import { randomUUID } from "node:crypto";
import { dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import type { ZodType } from "zod";
import { exportDiagnostics } from "./diagnostics";
import {
  audienceRuntimeEventSchema,
  audienceMediaCheckRequestSchema,
  hidRoleRequestSchema,
  hidTokenRequestSchema,
  IPC,
  mediaDeviceCatalogSchema,
  operatorCommandMessageSchema,
  runtimeHealthSchema,
  settingsPatchSchema,
  systemCheckRequestSchema,
  testKeyRequestSchema,
  testTransportRequestSchema,
} from "./ipc-contracts";
import { logger } from "./logger";
import {
  composeEngineSnapshot,
  type EngineMediaTelemetry,
  type EngineRecordingTelemetry,
} from "./engine-snapshot";
import type { ContentManager } from "./content-manager";
import type { PermissionService } from "./permission-service";
import type { InputManager, TestControlAction } from "./input-manager";
import type { HidService } from "./hid-service";
import { HidHelperEventSchema } from "./hid-protocol";
import type { PowerService } from "./power-service";
import type { RuntimeMode } from "./runtime-mode";
import type { SettingsStore } from "./settings-store";
import type { SystemCheckService } from "./system-check-service";
import type {
  AudienceMediaCheckRequest,
  AudienceMediaTelemetryEvent,
  EngineCommandType,
  EngineCoordinatorLike,
  MediaDeviceCatalog,
  OperationMode,
  SystemCheckItem,
  SystemCheckSnapshot,
  WindowRole,
} from "./types";
import { activeDeviceProfile } from "./types";
import type { WindowManager } from "./window-manager";
import { SYSTEM_CHECK_IDS } from "../shared/system-check";
import {
  IpcAcknowledgementSchema,
  type AudienceRuntimeEvent,
  type EngineSnapshot,
  type RuntimeSnapshot,
} from "../shared/contracts";

type InvokeHandler<T, R> = (event: IpcMainInvokeEvent, payload: T) => Promise<R> | R;

const ENGINE_COMMANDS = new Set<EngineCommandType>([
  "START",
  "PAUSE",
  "RESUME",
  "RESTART_SCENE",
  "SKIP_SCENE",
  "RESET",
  "EMERGENCY_RESET",
  "RETURN_TO_IDLE",
  "TEST_SCENE",
  "STOP_SCENE_TEST",
]);

function isEngineCommand(value: string): value is EngineCommandType {
  return ENGINE_COMMANDS.has(value as EngineCommandType);
}

export interface IpcServiceDependencies {
  windows: WindowManager;
  coordinator: EngineCoordinatorLike;
  settings: SettingsStore;
  content: ContentManager;
  permissions: PermissionService;
  power: PowerService;
  systemCheck: SystemCheckService;
  runtimeMode: RuntimeMode;
  input: InputManager;
  hid: HidService;
  onContentRootChanged: (contentRoot: string) => void;
  issueDevelopmentVideo: (filePath: string) => Promise<string>;
}

export class IpcService {
  private readonly channels: string[] = [];
  private unsubscribeRuntime: (() => void) | null = null;
  private mediaTelemetry: EngineMediaTelemetry | null = null;
  private recordingTelemetry: EngineRecordingTelemetry | null = null;
  private readonly mediaDeviceCatalogs: Record<OperationMode, MediaDeviceCatalog> = {
    production: {
      operationMode: "production",
      audioInputs: [],
      audioOutputs: [],
      sinkSelectionSupported: false,
      observedAt: 0,
    },
    test: {
      operationMode: "test",
      audioInputs: [],
      audioOutputs: [],
      sinkSelectionSupported: false,
      observedAt: 0,
    },
  };
  private readonly mediaDeviceWaiters: Record<OperationMode, Set<(catalog: MediaDeviceCatalog) => void>> = {
    production: new Set(),
    test: new Set(),
  };

  constructor(private readonly dependencies: IpcServiceDependencies) {}

  install(): void {
    const { coordinator, settings, content, hid, permissions, systemCheck, windows } = this.dependencies;

    this.handle("operator", IPC.operator.getSnapshot, undefined, () => this.getEngineSnapshot());
    this.handle("operator", IPC.operator.command, operatorCommandMessageSchema, async (_event, command) => {
      if (command.command === "SIMULATE_INPUT") {
        if (settings.get().operationMode !== "test") {
          return IpcAcknowledgementSchema.parse({
            requestId: command.requestId,
            accepted: false,
            reason: "Onscreen visitor controls are available only in Test",
            snapshot: this.getEngineSnapshot(),
          });
        }
        const result = await coordinator.dispatch({
          type: command.action,
          source: "operator",
          inputSource: "SIMULATION",
          occurredAt: command.issuedAtMs,
        });
        return IpcAcknowledgementSchema.parse({
          requestId: command.requestId,
          accepted: result.accepted,
          ...(result.reason === undefined ? {} : { reason: result.reason }),
          snapshot: this.getEngineSnapshot(),
        });
      }
      if (!isEngineCommand(command.command)) {
        return IpcAcknowledgementSchema.parse({
          requestId: command.requestId,
          accepted: false,
          reason: "This command uses a dedicated, typed operator service",
          snapshot: this.getEngineSnapshot(),
        });
      }
      if (command.command === "START") await systemCheck.run();
      const result = await coordinator.dispatch({
        type: command.command,
        ...(command.command === "TEST_SCENE" ? { sceneId: command.state } : {}),
        source: "operator",
        occurredAt: command.issuedAtMs,
      });
      return IpcAcknowledgementSchema.parse({
        requestId: command.requestId,
        accepted: result.accepted,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
        snapshot: this.getEngineSnapshot(),
      });
    });
    this.handle("operator", IPC.operator.getSettings, undefined, () => settings.get());
    this.handle("operator", IPC.operator.updateSettings, settingsPatchSchema, async (_event, patch) => {
      this.requireSafeConfigurationState();
      if (patch.operationMode !== undefined && patch.operationMode !== settings.get().operationMode &&
        coordinator.getSnapshot().state !== "IDLE" && coordinator.getSnapshot().state !== "SYSTEM_CHECK") {
        throw new Error("Production/Test mode can only be changed outside a visitor session");
      }
      const previous = settings.get();
      const updated = await settings.update(patch);
      for (const mode of ["production", "test"] as const) {
        const previousProfile = previous[mode];
        const updatedProfile = updated[mode];
        if (updatedProfile.microphoneDeviceId !== previousProfile.microphoneDeviceId) {
          systemCheck.prepareMicrophoneTest(mode);
        }
        if (updatedProfile.audioOutputDeviceId !== previousProfile.audioOutputDeviceId) {
          systemCheck.prepareAudioOutputTest(mode);
        }
      }
      if (patch.production?.inputBindings !== undefined) {
        await hid.setBindings(updated.production.inputBindings);
        await systemCheck.invalidateNativeInputs("Production control assignments changed; run fresh checks");
      }
      await windows.applySettings(updated);
      windows.send("audience", IPC.audience.settings, updated);
      if (updated.operationMode !== previous.operationMode) {
        await this.requestMediaDeviceCatalog(updated.operationMode);
      }
      await systemCheck.run();
      return updated;
    });
    this.handle("operator", IPC.operator.getDisplays, undefined, () => windows.getDisplays());
    this.handle("operator", IPC.operator.getMediaDeviceCatalog, undefined, () =>
      this.mediaDeviceCatalogs[settings.get().operationMode]);
    this.handle("operator", IPC.operator.refreshMediaDeviceCatalog, undefined, () => {
      this.requireSafeConfigurationState();
      return this.requestMediaDeviceCatalog(settings.get().operationMode);
    });
    this.handle("operator", IPC.operator.runSystemCheck, systemCheckRequestSchema, (_event, request) =>
      this.runGuidedSystemCheck(request?.checkId));
    this.handle("operator", IPC.operator.testKey, testKeyRequestSchema, (event, input) =>
      this.dependencies.input.handleKey({ ...input, atMs: Date.now() }, event.sender.id));
    this.handle("operator", IPC.operator.testTransport, testTransportRequestSchema, (event, request) => {
      const action: Exclude<TestControlAction, "RECORD_BUTTON" | "CHOICE_BUTTON"> = request.action === "start" ||
        request.action === "togglePause"
        ? "START_PAUSE_RESUME"
        : request.action === "previous"
          ? "PREVIOUS"
          : request.action === "next" ? "NEXT" : "RESTART";
      return this.dependencies.input.handleTransport(action, Date.now(), event.sender.id);
    });
    this.handle("operator", IPC.operator.getHidState, undefined, () => hid.getState());
    this.handle("operator", IPC.operator.refreshHid, undefined, async () => {
      this.requireSafeConfigurationState();
      await hid.refreshDevices();
      await systemCheck.run();
      return hid.getState();
    });
    this.handle("operator", IPC.operator.requestHidAccess, undefined, async () => {
      this.requireSafeConfigurationState();
      await hid.requestAccess();
      await systemCheck.run();
      return hid.getState();
    });
    this.handle("operator", IPC.operator.openInputMonitoringSettings, undefined, async () => {
      this.requireSafeConfigurationState();
      await shell.openExternal("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ListenEvent");
      return true;
    });
    this.handle("operator", IPC.operator.beginHidLearn, hidRoleRequestSchema, async (_event, request) => {
      this.requireProductionSetupState();
      if (hid.getState().learn !== null) await hid.cancelLearning();
      await hid.beginLearning(request.role);
      return hid.getState();
    });
    this.handle("operator", IPC.operator.cancelHidLearn, hidTokenRequestSchema, async (_event, request) => {
      this.requireProductionSetupState();
      if (hid.getState().learn?.token !== request.token) throw new Error("Input-learning session is no longer active");
      await hid.cancelLearning();
      return hid.getState();
    });
    this.handle("operator", IPC.operator.confirmHidLearn, hidTokenRequestSchema, async (_event, request) => {
      this.requireProductionSetupState();
      const learning = hid.getState().learn;
      if (learning?.token !== request.token || learning.phase !== "ready" || learning.candidate === null) {
        throw new Error("Complete two press-release cycles before confirming the assignment");
      }
      await hid.confirmBinding(learning.candidate);
      const state = hid.getState();
      await settings.update({
        production: { inputBindings: { [learning.role]: state.bindings[learning.role] } },
      });
      await systemCheck.invalidateNativeInputs("Assignment saved; System Check still requires a fresh press-release");
      return state;
    });
    this.handle("operator", IPC.operator.forgetHidBinding, hidRoleRequestSchema, async (_event, request) => {
      this.requireProductionSetupState();
      await hid.forgetBinding(request.role);
      await settings.update({ production: { inputBindings: { [request.role]: null } } });
      await systemCheck.invalidateNativeInputs("Production control assignment removed");
      return hid.getState();
    });
    this.handle("operator", IPC.operator.requestMicrophonePermission, undefined, async () => {
      this.requireSafeConfigurationState();
      const result = await permissions.requestMicrophonePermission();
      if (result.granted || result.status === "granted") {
        await this.requestMediaDeviceCatalog(settings.get().operationMode);
      }
      await systemCheck.run();
      return result;
    });
    this.handle("operator", IPC.operator.openMicrophoneSettings, undefined, () => {
      this.requireSafeConfigurationState();
      return permissions.openMicrophoneSettings();
    });
    this.handle("operator", IPC.operator.getContent, undefined, () => {
      const loaded = content.get();
      return {
        configuration: loaded.configuration,
        source: loaded.source,
        ...(loaded.warning === undefined ? {} : { warning: loaded.warning }),
        contentDirectory: loaded.contentDirectory,
        mediaBaseUrl: "relight-media://content/media/",
      };
    });
    this.handle("operator", IPC.operator.chooseContentFolder, undefined, async () => {
      this.requireSafeConfigurationState();
      const operator = windows.get("operator");
      if (operator === null) throw new Error("Operator window is unavailable");
      const result = await dialog.showOpenDialog(operator, {
        title: "Choose RE:Light Content Folder",
        defaultPath: content.contentDirectory,
        properties: ["openDirectory", "createDirectory"],
      });
      const selected = result.filePaths[0];
      if (result.canceled || selected === undefined) return { changed: false, content: content.get() };
      const loaded = await content.selectDirectory(selected);
      await coordinator.reloadConfiguration(loaded.configuration);
      await settings.update({ contentRoot: selected });
      this.dependencies.onContentRootChanged(selected);
      await systemCheck.run();
      return { changed: true, content: loaded };
    });
    this.handle("operator", IPC.operator.validateContent, undefined, () => content.validateCurrent());
    this.handle("operator", IPC.operator.reloadContent, undefined, async () => {
      this.requireSafeConfigurationState();
      const loaded = await content.reloadCurrent();
      await coordinator.reloadConfiguration(loaded.configuration);
      await systemCheck.run();
      return loaded;
    });
    this.handle("operator", IPC.operator.restoreContent, undefined, async () => {
      this.requireSafeConfigurationState();
      const loaded = await content.restoreLastKnownGood();
      await coordinator.reloadConfiguration(loaded.configuration);
      await systemCheck.run();
      return loaded;
    });
    this.handle("operator", IPC.operator.chooseDevelopmentVideo, undefined, async () => {
      if (!this.dependencies.runtimeMode.development) {
        throw new Error("Local scene-test media is disabled outside development");
      }
      if (coordinator.getSnapshot().state !== "IDLE") {
        throw new Error("Local scene-test media can only be selected while the experience is idle");
      }
      const operator = windows.get("operator");
      if (operator === null) throw new Error("Operator window is unavailable");
      const result = await dialog.showOpenDialog(operator, {
        title: "Choose Scene Test MP4",
        properties: ["openFile"],
        filters: [{ name: "MPEG-4 video", extensions: ["mp4"] }],
      });
      const selected = result.filePaths[0];
      if (result.canceled || selected === undefined) return { selected: false };
      const url = await this.dependencies.issueDevelopmentVideo(selected);
      return { selected: true, url };
    });
    this.handle("operator", IPC.operator.revealContentFolder, undefined, async () => {
      const error = await shell.openPath(content.contentDirectory);
      return error.length === 0;
    });
    this.handle("operator", IPC.operator.exportDiagnostics, undefined, async () => {
      const operator = windows.get("operator");
      if (operator === null) throw new Error("Operator window is unavailable");
      return exportDiagnostics(operator, {
        settings: settings.get(),
        displays: windows.getDisplays(),
        systemCheck: systemCheck.get(),
        power: this.dependencies.power.get(),
        engineSnapshot: this.getEngineSnapshot(),
      });
    });

    this.handle("audience", IPC.audience.getBootstrap, undefined, () => ({
      snapshot: coordinator.getSnapshot(),
      content: content.get().configuration,
      settings: settings.get(),
      mediaBaseUrl: "relight-media://content/" as const,
      verificationMode: this.dependencies.runtimeMode.packageVerification || this.dependencies.runtimeMode.e2e,
    }));
    this.handle("audience", IPC.audience.runtimeEvent, audienceRuntimeEventSchema, async (_event, runtimeEvent) => {
      const previous = coordinator.getSnapshot();
      const previousIdentity = this.matchesCurrentIdentity(runtimeEvent, previous);
      if (previousIdentity) this.observeAudienceTelemetry(runtimeEvent);
      await coordinator.handleAudienceEvent(runtimeEvent);
      const current = coordinator.getSnapshot();
      const currentIdentity = runtimeEvent.sessionId === current.sessionId &&
        runtimeEvent.stateRevision === current.stateRevision;
      if (currentIdentity) await systemCheck.updateAudienceEvent(runtimeEvent);
      if (
        runtimeEvent.event === "MEDIA_STARTED" ||
        runtimeEvent.event === "MEDIA_PROGRESS" ||
        runtimeEvent.event === "MEDIA_ERROR"
      ) {
        const { event: eventType, ...eventDetail } = runtimeEvent;
        const telemetry: AudienceMediaTelemetryEvent = {
          ...eventDetail,
          type: eventType,
          currentIdentity,
        } as AudienceMediaTelemetryEvent;
        windows.send("operator", IPC.operator.systemEvent, telemetry);
      }
      this.broadcastEngineSnapshot(current);
    });
    this.handle("audience", IPC.audience.runtimeHealth, runtimeHealthSchema, async (_event, report) => {
      await systemCheck.updateRuntimeHealth(report);
    });
    this.handle("audience", IPC.audience.reportMediaDeviceCatalog, mediaDeviceCatalogSchema, async (_event, catalog) => {
      this.mediaDeviceCatalogs[catalog.operationMode] = catalog;
      for (const resolve of this.mediaDeviceWaiters[catalog.operationMode]) resolve(catalog);
      this.mediaDeviceWaiters[catalog.operationMode].clear();
      windows.send("operator", IPC.operator.mediaDeviceCatalog, catalog);
      if (catalog.operationMode !== settings.get().operationMode) return;
      await systemCheck.updateMediaDeviceInventory({
        operationMode: catalog.operationMode,
        audioInputDeviceIds: catalog.audioInputs.map((device) => device.id),
        audioOutputDeviceIds: catalog.audioOutputs.map((device) => device.id),
        sinkSelectionSupported: catalog.sinkSelectionSupported,
        observedAt: catalog.observedAt,
      });
    });

    this.handle("operator", IPC.operator.testCrashAudience, undefined, () => this.crashRenderer("audience"));
    this.handle("operator", IPC.operator.testCrashOperator, undefined, () => this.crashRenderer("operator"));
    if (this.dependencies.runtimeMode.e2e && process.env.RELIGHT_E2E_HID_FIXTURE === "1") {
      this.handle("operator", IPC.operator.testInjectHidFixture, HidHelperEventSchema, (_event, fixtureEvent) => {
        hid.injectFixtureEvent(fixtureEvent);
        return hid.getState();
      });
      this.handle("operator", IPC.operator.testBeginActiveProduction, undefined, async () => {
        if (settings.get().operationMode !== "production") throw new Error("Production fixture requires Production mode");
        await coordinator.applySystemCheckGate({
          mode: "exhibition",
          readiness: "READY",
          canStart: true,
          blockingChecks: [],
          warnings: [],
          completed: SYSTEM_CHECK_IDS.length,
          total: SYSTEM_CHECK_IDS.length,
        });
        if (coordinator.getSnapshot().state === "IDLE") {
          await coordinator.dispatch({ type: "START", source: "system", occurredAt: Date.now() });
        }
        return this.getEngineSnapshot();
      });
    }

    this.unsubscribeRuntime = coordinator.subscribe((runtime) => {
      this.pruneTelemetry(runtime);
      this.broadcastEngineSnapshot(runtime);
    });
  }

  dispose(): void {
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = null;
    for (const mode of ["production", "test"] as const) {
      for (const resolve of this.mediaDeviceWaiters[mode]) resolve(this.mediaDeviceCatalogs[mode]);
      this.mediaDeviceWaiters[mode].clear();
    }
    for (const channel of this.channels) ipcMain.removeHandler(channel);
    this.channels.length = 0;
  }

  async refreshMediaDevicesForPackageVerification(): Promise<MediaDeviceCatalog> {
    if (!this.dependencies.runtimeMode.packageVerification) {
      throw new Error("Packaged media-device verification is unavailable in the normal runtime");
    }
    return this.requestMediaDeviceCatalog(this.dependencies.settings.get().operationMode);
  }

  private handle<T, R>(
    role: WindowRole,
    channel: string,
    schema: ZodType<T> | undefined,
    handler: InvokeHandler<T, R>,
  ): void {
    ipcMain.handle(channel, async (event, rawPayload) => {
      const frameUrl = event.senderFrame?.url ?? event.sender.getURL();
      if (!this.dependencies.windows.isTrustedSender(event.sender, role, frameUrl)) {
        logger.warn("Rejected IPC from untrusted sender", { channel, role, frameUrl });
        throw new Error("Unauthorized IPC sender");
      }

      let payload: T;
      try {
        payload = schema === undefined ? (undefined as T) : schema.parse(rawPayload);
      } catch (error) {
        logger.warn("Rejected invalid IPC payload", {
          channel,
          role,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error("Invalid IPC request");
      }
      return handler(event, payload);
    });
    this.channels.push(channel);
  }

  private crashRenderer(role: WindowRole): boolean {
    if (!this.dependencies.runtimeMode.e2e) throw new Error("Crash injection is disabled outside E2E mode");
    const window = this.dependencies.windows.get(role);
    if (window === null) return false;
    window.webContents.forcefullyCrashRenderer();
    return true;
  }

  private requestMediaDeviceCatalog(operationMode: OperationMode): Promise<MediaDeviceCatalog> {
    const audience = this.dependencies.windows.get("audience");
    if (audience === null) return Promise.resolve(this.mediaDeviceCatalogs[operationMode]);
    return new Promise((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = (catalog: MediaDeviceCatalog): void => {
        if (settled) return;
        settled = true;
        if (timeout !== null) clearTimeout(timeout);
        this.mediaDeviceWaiters[operationMode].delete(finish);
        resolve(catalog);
      };
      this.mediaDeviceWaiters[operationMode].add(finish);
      timeout = setTimeout(() => finish(this.mediaDeviceCatalogs[operationMode]), 2_500);
      this.dependencies.windows.send("audience", IPC.audience.refreshMediaDevices, { operationMode });
    });
  }

  private async runGuidedSystemCheck(
    checkId?: SystemCheckItem["id"],
  ): Promise<SystemCheckSnapshot> {
    const { content, coordinator, permissions, settings, systemCheck, windows } = this.dependencies;
    if (checkId === undefined) {
      if (settings.get().operationMode === "production") systemCheck.prepareNativeButtonTests();
      return systemCheck.run();
    }

    if (checkId === "redButton" || checkId === "whiteButton") {
      this.requireSafeConfigurationState();
      systemCheck.prepareNativeButtonTests([
        checkId === "redButton" ? "RECORD_BUTTON" : "CHOICE_BUTTON",
      ]);
      return systemCheck.run();
    }

    if (checkId === "microphoneDevice" || checkId === "microphoneSignal") {
      this.requireSafeConfigurationState();
      systemCheck.prepareMicrophoneTest();
      await systemCheck.run();
      const selectedMicrophone = activeDeviceProfile(settings.get()).microphoneDeviceId;
      if (selectedMicrophone === null || !permissions.canUseMicrophone()) return systemCheck.get();
      this.issueAudienceMediaCheck({
        type: "mic.test",
        durationMs: 2_000,
        microphoneDeviceId: selectedMicrophone,
      });
      await systemCheck.waitForMicrophoneEvidence(3_000);
      return systemCheck.run();
    }

    if (checkId === "audioOutput") {
      this.requireSafeConfigurationState();
      systemCheck.prepareAudioOutputTest();
      await systemCheck.run();
      this.issueAudienceMediaCheck({ type: "audio.test" });
      await systemCheck.waitForAudioPlayback(3_000);
      if (systemCheck.audioPlaybackSucceeded()) {
        const operator = windows.get("operator");
        if (operator !== null) {
          const confirmation = await dialog.showMessageBox(operator, {
            type: "question",
            title: "Confirm Speaker Test",
            message: "Did you hear the speaker test clearly?",
            detail: "Choose Yes only if the sound came from the intended exhibition speakers at a usable level.",
            buttons: ["Yes, I Heard It", "No"],
            defaultId: 1,
            cancelId: 1,
            noLink: true,
          });
          systemCheck.confirmAudioOutput(confirmation.response === 0);
        }
      }
      return systemCheck.run();
    }

    if (checkId === "videoEngine") {
      this.requireSafeConfigurationState();
      systemCheck.prepareVideoEngineTest();
      await systemCheck.run();
      const scene = content.get().configuration.states.find(
        (candidate) => candidate.kind === "passive" && "media" in candidate && candidate.media !== undefined,
      );
      if (scene === undefined || !(await coordinator.previewSceneForSystemCheck(scene.id))) {
        return systemCheck.run();
      }
      try {
        await systemCheck.waitForVideoEvidence(5_000);
      } finally {
        await coordinator.syncWindows();
      }
      return systemCheck.run();
    }

    return systemCheck.run();
  }

  private issueAudienceMediaCheck(
    request: Pick<AudienceMediaCheckRequest, "type" | "durationMs" | "microphoneDeviceId">,
  ): void {
    const snapshot = this.dependencies.coordinator.getSnapshot();
    const payload = audienceMediaCheckRequestSchema.parse({
      id: randomUUID(),
      type: request.type,
      sessionId: snapshot.sessionId,
      stateRevision: snapshot.stateRevision,
      ...(request.durationMs === undefined ? {} : { durationMs: request.durationMs }),
      ...(request.microphoneDeviceId === undefined ? {} : { microphoneDeviceId: request.microphoneDeviceId }),
    });
    this.dependencies.windows.send("audience", IPC.audience.mediaCheck, payload);
  }

  private requireSafeConfigurationState(): void {
    const state = this.dependencies.coordinator.getSnapshot().state;
    if (state !== "IDLE" && state !== "SYSTEM_CHECK") {
      throw new Error("Settings and content can only be changed outside a visitor session");
    }
  }

  private requireProductionSetupState(): void {
    this.requireSafeConfigurationState();
    if (this.dependencies.settings.get().operationMode !== "production") {
      throw new Error("Native control assignment is available only in Production Setup");
    }
  }

  private getEngineSnapshot(runtime = this.dependencies.coordinator.getSnapshot()): EngineSnapshot {
    const loaded = this.dependencies.content.get();
    return composeEngineSnapshot({
      runtime,
      configuration: loaded.configuration,
      systemCheck: this.dependencies.systemCheck.get(),
      settings: this.dependencies.settings.get(),
      displays: this.dependencies.windows.getDisplays(),
      sceneTestActive: this.dependencies.coordinator.isSceneTestActive(),
      hidState: this.dependencies.hid.getState(),
      ...(loaded.warning === undefined ? {} : { contentWarning: loaded.warning }),
      mediaTelemetry: this.mediaTelemetry,
      recordingTelemetry: this.recordingTelemetry,
    });
  }

  private broadcastEngineSnapshot(runtime = this.dependencies.coordinator.getSnapshot()): void {
    this.dependencies.windows.send("operator", IPC.operator.snapshot, this.getEngineSnapshot(runtime));
  }

  private matchesCurrentIdentity(event: AudienceRuntimeEvent, runtime: RuntimeSnapshot): boolean {
    if (event.sessionId !== runtime.sessionId || event.stateRevision !== runtime.stateRevision) return false;
    return !("state" in event) || event.state === runtime.state;
  }

  private observeAudienceTelemetry(event: AudienceRuntimeEvent): void {
    switch (event.event) {
      case "MEDIA_STARTED":
        this.mediaTelemetry = {
          sessionId: event.sessionId,
          stateRevision: event.stateRevision,
          status: "playing",
          currentTimeMs: 0,
          durationMs: event.durationMs,
          error: null,
        };
        return;
      case "MEDIA_PROGRESS":
        this.mediaTelemetry = {
          sessionId: event.sessionId,
          stateRevision: event.stateRevision,
          status: "playing",
          currentTimeMs: event.mediaTimeMs,
          durationMs: event.durationMs,
          error: null,
        };
        return;
      case "MEDIA_ENDED": {
        const previous = this.mediaTelemetry;
        this.mediaTelemetry = {
          sessionId: event.sessionId,
          stateRevision: event.stateRevision,
          status: "ended",
          currentTimeMs: previous?.durationMs ?? previous?.currentTimeMs ?? 0,
          durationMs: previous?.durationMs ?? null,
          error: null,
        };
        return;
      }
      case "MEDIA_ERROR":
        this.mediaTelemetry = {
          sessionId: event.sessionId,
          stateRevision: event.stateRevision,
          status: "error",
          currentTimeMs: this.mediaTelemetry?.currentTimeMs ?? 0,
          durationMs: this.mediaTelemetry?.durationMs ?? null,
          error: event.message,
        };
        return;
      case "MICROPHONE_STATUS":
        this.recordingTelemetry = {
          sessionId: event.sessionId,
          durationMs: this.recordingTelemetry?.sessionId === event.sessionId
            ? this.recordingTelemetry.durationMs
            : null,
          inputLevel: event.level,
          hasAudio: this.recordingTelemetry?.sessionId === event.sessionId
            ? this.recordingTelemetry.hasAudio
            : false,
        };
        return;
      case "RECORDING_STARTED":
        this.recordingTelemetry = {
          sessionId: event.sessionId,
          durationMs: null,
          inputLevel: this.recordingTelemetry?.sessionId === event.sessionId
            ? this.recordingTelemetry.inputLevel
            : null,
          hasAudio: false,
        };
        return;
      case "RECORDING_COMPLETE":
        this.recordingTelemetry = {
          sessionId: event.sessionId,
          durationMs: event.durationMs,
          inputLevel: this.recordingTelemetry?.sessionId === event.sessionId
            ? this.recordingTelemetry.inputLevel
            : null,
          hasAudio: event.hasAudio,
        };
        return;
      case "RECORDING_ERROR":
        this.recordingTelemetry = {
          sessionId: event.sessionId,
          durationMs: null,
          inputLevel: this.recordingTelemetry?.sessionId === event.sessionId
            ? this.recordingTelemetry.inputLevel
            : null,
          hasAudio: false,
        };
        return;
      case "READY":
      case "AUDIO_STATUS":
      case "RESET_COMPLETE":
        return;
    }
  }

  private pruneTelemetry(runtime: RuntimeSnapshot): void {
    if (
      this.mediaTelemetry !== null &&
      (this.mediaTelemetry.sessionId !== runtime.sessionId ||
        this.mediaTelemetry.stateRevision !== runtime.stateRevision)
    ) {
      this.mediaTelemetry = null;
    }
    if (
      this.recordingTelemetry !== null &&
      runtime.sessionId === null &&
      this.recordingTelemetry.sessionId !== null
    ) {
      this.recordingTelemetry = null;
    }
  }
}
