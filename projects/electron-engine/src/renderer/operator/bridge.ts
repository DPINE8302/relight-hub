import type {
  AppSettings,
  AppSettingsPatch,
  DisplayDescriptor,
  HidState as MainHidState,
  MediaDeviceCatalog,
  MediaDeviceOptionDescriptor,
  SystemCheckSnapshot,
} from "../../main/types";
import type { EngineSnapshot, OperatorCommandMessage } from "../../shared/contracts";
import type {
  CommandResult,
  HealthItem,
  HidState,
  OperatorBridge,
  OperatorCommand,
  OperatorSettings,
  OperatorSnapshot,
  SceneSummary,
} from "../shared/types";

const emptyHidState: HidState = {
  access: "unknown",
  helperAvailable: false,
  devices: [],
  bindings: { RECORD_BUTTON: null, CHOICE_BUTTON: null },
  learn: null,
  lastInput: null,
};

interface ContentShape {
  configuration?: {
    experience?: {
      recordingDurationMs?: number;
      endHoldMs?: number;
      visitorWaitTimeoutMs?: number | null;
    };
    states?: Array<{
      id?: string;
      durationMs?: number;
      media?: string;
      video?: string;
      placeholder?: { title?: string };
    }>;
  };
  source?: string;
  warning?: string;
  contentDirectory?: string;
}

const unavailableSnapshot: OperatorSnapshot = {
  revision: 0,
  appVersion: "1.0.0",
  readiness: "faulted",
  canStart: false,
  runMode: "idle",
  experienceState: "BOOT",
  currentSceneLabel: "Renderer not connected",
  currentSceneFile: "—",
  playbackMs: 0,
  playbackDurationMs: 0,
  mediaReady: false,
  droppedVideoFrames: 0,
  totalVideoFrames: 0,
  mediaError: null,
  recordingStatus: "none",
  microphoneLevel: 0,
  operationMode: "test",
  modeReadiness: { production: "faulted", test: "faulted" },
  simulationMode: true,
  developerMode: false,
  audienceDisplayLabel: "Unavailable",
  audioOutputLabel: "System default",
  contentPackLabel: "Unavailable",
  contentValidation: { valid: null, issues: [] },
  developmentMediaUrl: null,
  session: { id: null, startedAt: null, elapsedMs: 0 },
  health: [{ id: "bridge", label: "Application bridge", status: "failed", detail: "The operator renderer is not connected to the Electron preload.", required: true }],
  recentActivity: [{ id: "bridge-unavailable", timestamp: new Date(0).toISOString(), level: "error", message: "Application bridge unavailable" }],
  displays: [],
  microphones: [],
  audioOutputs: [],
  hid: emptyHidState,
  scenes: [],
  settings: {
    operationMode: "test",
    production: {
      audienceDisplayId: "",
      audienceFullscreen: true,
      microphoneDeviceId: "",
      audioOutputDeviceId: "",
    },
    test: {
      audienceDisplayId: "",
      audienceFullscreen: false,
      microphoneDeviceId: "",
      audioOutputDeviceId: "",
      speed: 4,
    },
    audio: { master: 0.85, film: 0.8, narration: 0.85, ambience: 0.65, sfx: 0.7, visitorVoice: 0.9 },
    recordingDurationMs: 6000,
    endHoldMs: 8000,
    visitorWaitTimeoutMs: null,
    developerMode: false,
    simulationMode: false,
  },
};

function checkStatus(status: EngineSnapshot["checks"][keyof EngineSnapshot["checks"]]["status"]): HealthItem["status"] {
  switch (status) {
    case "pass":
      return "passed";
    case "fail":
      return "failed";
    case "warning":
      return "warning";
    case "simulated":
      return "simulated";
    case "running":
      return "checking";
    case "untested":
      return "not-tested";
  }
}

function validState(value: string): OperatorSnapshot["experienceState"] {
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(value)
    ? (value as OperatorSnapshot["experienceState"])
    : "BOOT";
}

function createRequestId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `operator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapSettings(settings: AppSettings, content: ContentShape): OperatorSettings {
  const experience = content.configuration?.experience;
  return {
    operationMode: settings.operationMode,
    production: {
      audienceDisplayId: settings.production.audienceDisplayId ?? "",
      audienceFullscreen: settings.production.audienceFullscreen,
      microphoneDeviceId: settings.production.microphoneDeviceId ?? "",
      audioOutputDeviceId: settings.production.audioOutputDeviceId ?? "",
    },
    test: {
      audienceDisplayId: settings.test.audienceDisplayId ?? "",
      audienceFullscreen: settings.test.audienceFullscreen,
      microphoneDeviceId: settings.test.microphoneDeviceId ?? "",
      audioOutputDeviceId: settings.test.audioOutputDeviceId ?? "",
      speed: settings.test.speed,
    },
    audio: { ...settings.audio },
    recordingDurationMs: experience?.recordingDurationMs ?? 6000,
    endHoldMs: experience?.endHoldMs ?? 8000,
    visitorWaitTimeoutMs: experience?.visitorWaitTimeoutMs ?? null,
    developerMode: settings.developerMode,
    simulationMode: settings.operationMode === "test",
  };
}

function mapHidState(state: MainHidState): HidState {
  const connected = new Map(state.devices.map((device) => [device.id, device.connected]));
  const mapBinding = (binding: MainHidState["bindings"][keyof MainHidState["bindings"]]) => binding ? {
    role: binding.role,
    deviceId: binding.deviceId,
    deviceLabel: binding.deviceLabel,
    elementLabel: binding.elementLabel,
    connected: connected.get(binding.deviceId) ?? false,
    identityQuality: binding.identityQuality,
    ...(binding.locationBound ? { locationBound: true } : {}),
    ...(binding.lastSeenAt === null ? {} : { lastSeenAt: new Date(binding.lastSeenAt).toISOString() }),
  } : null;
  return {
    access: state.access,
    helperAvailable: state.helperAvailable,
    devices: state.devices.map((device) => ({
      id: device.id,
      label: device.label,
      ...(device.manufacturer === null ? {} : { manufacturer: device.manufacturer }),
      connected: device.connected,
      assignable: device.assignable,
      ...(device.reason === null ? {} : { reason: device.reason }),
      identityQuality: device.identityQuality,
      ...(device.locationBound ? { locationBound: true } : {}),
      ...(device.internal ? { internal: true } : {}),
    })),
    bindings: {
      RECORD_BUTTON: mapBinding(state.bindings.RECORD_BUTTON),
      CHOICE_BUTTON: mapBinding(state.bindings.CHOICE_BUTTON),
    },
    learn: state.learn ? {
      token: state.learn.token,
      role: state.learn.role,
      phase: state.learn.phase,
      pressCount: state.learn.pressCount,
      ...(state.learn.candidate ? { candidateLabel: `${state.learn.candidate.deviceLabel} · ${state.learn.candidate.elementLabel}` } : {}),
      ...(state.learn.message ? { message: state.learn.message } : {}),
    } : null,
    lastInput: state.lastInput ? {
      source: state.lastInput.source,
      action: state.lastInput.role,
      accepted: state.lastInput.accepted,
      occurredAt: new Date(state.lastInput.occurredAt).toISOString(),
      ...(state.lastInput.detail ? { detail: state.lastInput.detail } : {}),
    } : null,
  };
}

function mapScenes(content: ContentShape): SceneSummary[] {
  return (content.configuration?.states ?? []).flatMap((state, index) => {
    if (!state.id) return [];
    const id = validState(state.id);
    return [{
      id,
      label: state.placeholder?.title ?? state.id.replaceAll("_", " "),
      sequence: String(index).padStart(3, "0"),
      durationMs: state.durationMs ?? null,
      hasMedia: Boolean(state.media ?? state.video),
      mediaLabel: state.media ?? state.video ?? "Cinematic placeholder",
      ...((state.media ?? state.video) === "scene01.mp4" || (state.media ?? state.video) === "media/scene01.mp4" ? { developmentOnly: true } : {}),
    }];
  });
}

class ElectronOperatorAdapter implements OperatorBridge {
  private engine: EngineSnapshot | null = null;
  private settings: AppSettings | null = null;
  private displays: DisplayDescriptor[] = [];
  private systemCheck: SystemCheckSnapshot = {
    ready: false,
    productionReady: false,
    testReady: false,
    operationMode: "test",
    canStart: false,
    simulationOverride: false,
    checkedAt: 0,
    items: [],
  };
  private content: ContentShape = {};
  private contentValidation: OperatorSnapshot["contentValidation"] = { valid: null, issues: [] };
  private developmentMediaUrl: string | null = null;
  private mediaTelemetry = {
    ready: false,
    droppedVideoFrames: 0,
    totalVideoFrames: 0,
    error: null as string | null,
  };
  private microphones: MediaDeviceOptionDescriptor[] = [];
  private audioOutputs: MediaDeviceOptionDescriptor[] = [];
  private hidState: HidState = emptyHidState;
  private readonly listeners = new Set<(snapshot: OperatorSnapshot) => void>();
  private readonly activity: OperatorSnapshot["recentActivity"] = [];
  private unsubscribeSnapshot: (() => void) | null = null;
  private unsubscribeSystem: (() => void) | null = null;
  private unsubscribeSystemCheck: (() => void) | null = null;
  private unsubscribeInput: (() => void) | null = null;
  private unsubscribeHid: (() => void) | null = null;
  private unsubscribeMediaDevices: (() => void) | null = null;

  async getSnapshot(): Promise<OperatorSnapshot> {
    await this.refresh();
    return this.build();
  }

  subscribe(listener: (snapshot: OperatorSnapshot) => void): () => void {
    this.listeners.add(listener);
    this.installSubscriptions();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.removeSubscriptions();
    };
  }

  async dispatch(command: OperatorCommand): Promise<CommandResult> {
    const bridge = window.relightOperator;
    if (!bridge) return { ok: false, message: "The Electron preload is not connected." };
    try {
      const engineCommand = this.mapEngineCommand(command);
      if (engineCommand) {
        const result = await bridge.dispatchCommand(engineCommand);
        this.engine = result.snapshot;
        this.emit();
        return { ok: result.accepted, message: result.accepted ? "Command accepted." : result.reason ?? "The engine rejected this command." };
      }

      if (command.type === "mode.set") {
        this.settings = await bridge.updateSettings({ operationMode: command.mode });
        await this.refreshMicrophones(true);
        this.engine = await bridge.getSnapshot();
        this.emit();
        return {
          ok: true,
          message: command.mode === "test"
            ? "Test profile is active. Production assignments are unchanged."
            : "Production profile is active. Complete every genuine check before Start.",
        };
      }

      if (command.type === "hid.refresh" || command.type === "hid.requestAccess") {
        const next = command.type === "hid.refresh" ? await bridge.refreshHid() : await bridge.requestHidAccess();
        this.hidState = mapHidState(next);
        this.emit();
        return {
          ok: next.access === "granted" && next.helperAvailable,
          message: next.access === "restartRequired"
            ? "Input Monitoring changed. Restart RE:Light Engine to continue."
            : next.access === "denied"
              ? "Input Monitoring is denied. Open System Settings to allow RE:Light Engine."
              : next.helperAvailable
                ? `Input devices refreshed. ${next.devices.filter((device) => device.assignable).length} assignable device${next.devices.filter((device) => device.assignable).length === 1 ? "" : "s"} found.`
                : "The native input helper is unavailable.",
        };
      }

      if (command.type === "hid.openSettings") {
        const opened = await bridge.openInputMonitoringSettings();
        return { ok: opened, message: opened ? "Opened Input Monitoring settings." : "Input Monitoring settings could not be opened." };
      }

      if (command.type === "hid.learn.begin") {
        this.hidState = mapHidState(await bridge.beginHidLearn(command.role));
        this.emit();
        return { ok: true, message: "Input learning started. Press and release the intended control twice." };
      }

      if (command.type === "hid.learn.cancel" || command.type === "hid.learn.confirm") {
        const next = command.type === "hid.learn.cancel"
          ? await bridge.cancelHidLearn(command.token)
          : await bridge.confirmHidLearn(command.token);
        this.hidState = mapHidState(next);
        this.settings = await bridge.getSettings();
        this.emit();
        return {
          ok: true,
          message: command.type === "hid.learn.cancel" ? "Input assignment cancelled." : "Physical control assigned. Run a fresh guided button check.",
        };
      }

      if (command.type === "hid.binding.forget") {
        this.hidState = mapHidState(await bridge.forgetHidBinding(command.role));
        this.settings = await bridge.getSettings();
        this.emit();
        return { ok: true, message: "Physical control assignment removed." };
      }

      if (command.type === "test.keyboard") {
        const report = await bridge.sendTestKey({
          code: command.code,
          phase: command.phase === "down" ? "PRESSED" : "RELEASED",
          repeat: command.repeat,
          alt: command.alt,
          interactive: command.interactive,
          atMs: Date.now(),
        });
        return {
          ok: report.accepted,
          message: report.accepted ? `${report.action.replaceAll("_", " ")} accepted.` : report.reason ?? "Test key ignored.",
        };
      }

      if (command.type === "test.transport") {
        const action = command.action === "startOrToggle"
          ? this.engine?.runMode === "stopped" ? "start" : "togglePause"
          : command.action === "previousScene"
            ? "previous"
            : command.action === "nextScene" ? "next" : "restart";
        const report = await bridge.testTransport(action);
        return { ok: report.accepted, message: report.accepted ? `${report.action.replaceAll("_", " ")} accepted.` : report.reason ?? "Test transport ignored." };
      }

      if (command.type === "test.speed.set") {
        this.settings = await bridge.updateSettings({ test: { speed: command.speed } });
        this.emit();
        return { ok: true, message: `Passive Test scenes now run at ${command.speed}×. Recording remains real-time.` };
      }

      if (command.type === "systemCheck.runAll" || command.type === "systemCheck.run") {
        if (command.type === "systemCheck.runAll" || (command.type === "systemCheck.run" && command.checkId === "microphonePermission")) {
          const permission = await bridge.requestMicrophonePermission();
          if (!permission.granted && permission.status !== "granted") {
            this.systemCheck = await bridge.runSystemCheck();
            this.emit();
            return { ok: false, message: permission.restartRequired ? "Microphone permission changed. Restart RE:Light Engine." : `Microphone permission is ${permission.status}.` };
          }
        }
        if (command.type === "systemCheck.runAll") {
          this.systemCheck = await bridge.runSystemCheck();
          const profile = this.settings?.[this.settings.operationMode];
          if (profile?.microphoneDeviceId) {
            this.systemCheck = await bridge.runSystemCheck("microphoneSignal");
          }
          this.systemCheck = await bridge.runSystemCheck("audioOutput");
          this.systemCheck = await bridge.runSystemCheck("videoEngine");
        } else {
          const checkAliases: Record<string, SystemCheckSnapshot["items"][number]["id"]> = {
            display: "display",
            content: "content",
            microphonePermission: "microphonePermission",
            microphone: "microphoneDevice",
            microphoneSignal: "microphoneSignal",
            redButton: "redButton",
            whiteButton: "whiteButton",
            audio: "audioOutput",
            videoEngine: "videoEngine",
            storage: "storage",
            power: "power",
            inputMonitoring: "inputMonitoring",
          };
          this.systemCheck = await bridge.runSystemCheck(checkAliases[command.checkId] ?? "content");
        }
        this.emit();
        return {
          ok: this.systemCheck.ready || this.systemCheck.canStart,
          message: this.systemCheck.ready
            ? "All required physical checks passed."
            : this.systemCheck.canStart
              ? "Simulation checks completed. Physical exhibition readiness is unchanged."
              : "System Check completed. Resolve the remaining items before rehearsal.",
        };
      }

      if (command.type === "settings.patch") {
        const patch: AppSettingsPatch = {};
        if (command.patch.operationMode !== undefined) patch.operationMode = command.patch.operationMode;
        if (command.patch.production !== undefined) {
          const profile = command.patch.production;
          patch.production = {
            audienceDisplayId: profile.audienceDisplayId || null,
            audienceFullscreen: profile.audienceFullscreen,
            microphoneDeviceId: profile.microphoneDeviceId || null,
            microphoneDeviceLabel: profile.microphoneDeviceId
              ? this.microphones.find((device) => device.id === profile.microphoneDeviceId)?.label ?? this.settings?.production.microphoneDeviceLabel ?? null
              : null,
            audioOutputDeviceId: profile.audioOutputDeviceId || null,
          };
        }
        if (command.patch.test !== undefined) {
          const profile = command.patch.test;
          patch.test = {
            audienceDisplayId: profile.audienceDisplayId || null,
            audienceFullscreen: profile.audienceFullscreen,
            microphoneDeviceId: profile.microphoneDeviceId || null,
            microphoneDeviceLabel: profile.microphoneDeviceId
              ? this.microphones.find((device) => device.id === profile.microphoneDeviceId)?.label ?? this.settings?.test.microphoneDeviceLabel ?? null
              : null,
            audioOutputDeviceId: profile.audioOutputDeviceId || null,
            speed: profile.speed,
          };
        }
        if (command.patch.developerMode !== undefined) patch.developerMode = command.patch.developerMode;
        if (command.patch.audio !== undefined) patch.audio = command.patch.audio;
        this.settings = await bridge.updateSettings(patch);
        this.emit();
        return { ok: true, message: "Settings saved locally." };
      }

      if (command.type === "sceneTester.fullscreen") {
        const mode = this.settings?.operationMode ?? "test";
        this.settings = await bridge.updateSettings(mode === "production" ? { production: { audienceFullscreen: true } } : { test: { audienceFullscreen: true } });
        this.emit();
        return { ok: true, message: "Audience window moved to fullscreen." };
      }

      if (command.type === "diagnostics.exportLogs") {
        const result = await bridge.exportDiagnostics();
        return { ok: result.exported, message: result.exported ? `Diagnostics exported${result.fileName ? ` as ${result.fileName}` : ""}.` : "Diagnostics export was cancelled." };
      }

      if (command.type === "diagnostics.openAudience") {
        const mode = this.settings?.operationMode ?? "test";
        this.settings = await bridge.updateSettings(mode === "production" ? { production: { audienceFullscreen: false } } : { test: { audienceFullscreen: false } });
        this.emit();
        return { ok: true, message: "Audience preview is available in development window mode." };
      }

      if (command.type === "content.openFolder") {
        const opened = await bridge.revealContentFolder();
        return { ok: opened, message: opened ? "Opened the active content folder." : "The active content folder could not be opened." };
      }

      if (command.type === "content.chooseFolder") {
        await bridge.chooseContentFolder();
        this.content = (await bridge.getContent()) as ContentShape;
        this.settings = await bridge.getSettings();
        this.contentValidation = { valid: null, issues: [] };
        this.emit();
        return { ok: true, message: "Content folder selection completed." };
      }

      if (command.type === "content.validate") {
        const result = await bridge.validateContent();
        this.contentValidation = { valid: result.valid, issues: [...result.issues] };
        this.emit();
        return {
          ok: result.valid,
          message: result.valid ? "experience.json is valid." : result.issues[0] ?? "experience.json is invalid.",
        };
      }

      if (command.type === "content.reload") {
        await bridge.reloadContent();
        this.content = (await bridge.getContent()) as ContentShape;
        this.contentValidation = { valid: true, issues: [] };
        this.emit();
        return { ok: true, message: "Validated content reloaded." };
      }

      if (command.type === "content.restoreLastKnownGood") {
        await bridge.restoreContent();
        this.content = (await bridge.getContent()) as ContentShape;
        this.contentValidation = { valid: true, issues: [] };
        this.emit();
        return { ok: true, message: "Last-known-good experience.json restored and loaded." };
      }

      if (command.type === "diagnostics.reloadContent") {
        this.content = (await bridge.getContent()) as ContentShape;
        this.emit();
        return { ok: true, message: "Active validated content refreshed in the operator view." };
      }

      if (command.type === "sceneTester.testRecording") {
        const permission = await bridge.requestMicrophonePermission();
        if (!permission.granted && permission.status !== "granted") {
          return { ok: false, message: `Microphone permission is ${permission.status}.` };
        }
        this.systemCheck = await bridge.runSystemCheck("microphoneSignal");
        this.emit();
        const signal = this.systemCheck.items.find((item) => item.id === "microphoneSignal");
        return {
          ok: signal?.status === "PASS" || signal?.status === "SIMULATED",
          message: signal?.detail ?? "Microphone signal test completed.",
        };
      }

      if (command.type === "sceneTester.chooseDevelopmentVideo") {
        if (!bridge.chooseDevelopmentVideo) {
          return { ok: false, message: "Development video selection is not connected." };
        }
        const result = await bridge.chooseDevelopmentVideo();
        if (result.selected && result.url) this.developmentMediaUrl = result.url;
        this.emit();
        return { ok: result.selected, message: result.selected ? "Development video ready for local preview." : "Development video selection cancelled." };
      }

      return { ok: false, message: "This control is unavailable until the main-process command is connected." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "The command could not be completed." };
    }
  }

  private async refresh(): Promise<void> {
    const bridge = window.relightOperator;
    if (!bridge) return;
    const [engine, settings, displays, content] = await Promise.all([
      bridge.getSnapshot(),
      bridge.getSettings(),
      bridge.getDisplays(),
      bridge.getContent(),
    ]);
    this.engine = engine;
    this.settings = settings;
    this.displays = displays;
    this.content = content as ContentShape;
    try {
      this.hidState = mapHidState(await bridge.getHidState());
    } catch {
      this.hidState = emptyHidState;
    }
    await this.refreshMicrophones(false);
  }

  private async refreshMicrophones(runCheck: boolean): Promise<void> {
    const bridge = window.relightOperator;
    try {
      const catalog = runCheck
        ? await bridge?.refreshMediaDeviceCatalog()
        : await bridge?.getMediaDeviceCatalog();
      this.applyMediaDeviceCatalog(catalog);
    } catch {
      this.microphones = [];
      this.audioOutputs = [];
    }
    if (bridge && runCheck) {
      try {
        this.systemCheck = await bridge.runSystemCheck();
        this.engine = await bridge.getSnapshot();
      } catch {
        // The disconnected persisted device is still shown as unavailable below.
      }
    }
    this.emit();
  }

  private applyMediaDeviceCatalog(catalog: MediaDeviceCatalog | undefined): void {
    if (!catalog || catalog.operationMode !== this.settings?.operationMode) return;
    this.microphones = catalog.audioInputs.map((device) => ({ ...device }));
    this.audioOutputs = catalog.audioOutputs.map((device) => ({ ...device }));
  }

  private installSubscriptions(): void {
    const bridge = window.relightOperator;
    if (!bridge || this.unsubscribeSnapshot) return;
    this.unsubscribeSnapshot = bridge.onSnapshot((snapshot) => {
      this.engine = snapshot;
      this.emit();
    });
    this.unsubscribeSystem = bridge.onSystemEvent((event) => {
      if (typeof event === "object" && event !== null && "type" in event) {
        const systemEvent = event as Record<string, unknown>;
        if (systemEvent.type === "NAVIGATE" && systemEvent.destination === "settings") {
          window.dispatchEvent(new CustomEvent("relight:navigate", { detail: "settings" }));
          return;
        }
        const telemetry = systemEvent.type === "AUDIENCE_MEDIA_TELEMETRY" && systemEvent.currentIdentity === true &&
          typeof systemEvent.event === "object" && systemEvent.event !== null
          ? systemEvent.event as Record<string, unknown>
          : systemEvent;
        if (systemEvent.type === "AUDIENCE_MEDIA_TELEMETRY" && systemEvent.currentIdentity !== true) return;
        if (telemetry.event === "MEDIA_STARTED" || telemetry.type === "MEDIA_STARTED") {
          this.mediaTelemetry.ready = true;
          this.mediaTelemetry.error = null;
          this.mediaTelemetry.droppedVideoFrames = 0;
          this.mediaTelemetry.totalVideoFrames = 0;
          this.emit();
          return;
        }
        if (telemetry.event === "MEDIA_PROGRESS" || telemetry.type === "MEDIA_PROGRESS") {
          const dropped = Number(telemetry.droppedVideoFrames);
          const total = Number(telemetry.totalVideoFrames);
          this.mediaTelemetry.ready = true;
          if (Number.isFinite(dropped) && dropped >= 0) this.mediaTelemetry.droppedVideoFrames = Math.floor(dropped);
          if (Number.isFinite(total) && total >= 0) this.mediaTelemetry.totalVideoFrames = Math.floor(total);
          this.emit();
          return;
        }
        if (telemetry.event === "MEDIA_ERROR" || telemetry.type === "MEDIA_ERROR") {
          this.mediaTelemetry.ready = false;
          this.mediaTelemetry.error = typeof telemetry.message === "string" ? telemetry.message : "Audience media playback failed.";
          this.recordActivity("error", this.mediaTelemetry.error);
          return;
        }
      }
      const detail = typeof event === "object" && event !== null && "message" in event
        ? String((event as { message: unknown }).message)
        : "System status updated";
      this.recordActivity("info", detail);
    });
    this.unsubscribeSystemCheck = bridge.onSystemCheck((snapshot) => {
      this.systemCheck = snapshot;
      this.emit();
    });
    this.unsubscribeInput = bridge.onInputEvent((event) => {
      const detail = typeof event === "object" && event !== null && "action" in event ? String((event as { action: unknown }).action) : "Hardware input";
      if (typeof event === "object" && event !== null) {
        const input = event as Record<string, unknown>;
        const source = input.source;
        if (source === "NATIVE_HID" || source === "TEST_KEYBOARD" || source === "SIMULATION") {
          this.hidState = {
            ...this.hidState,
            lastInput: {
              source,
              action: String(input.action ?? "INPUT"),
              accepted: input.accepted === true,
              occurredAt: new Date(typeof input.occurredAt === "number" ? input.occurredAt : Date.now()).toISOString(),
              ...(typeof input.reason === "string" ? { detail: input.reason } : {}),
            },
          };
        }
      }
      this.recordActivity("info", detail);
    });
    this.unsubscribeHid = bridge.onHidState((state) => {
      this.hidState = mapHidState(state);
      this.emit();
    });
    this.unsubscribeMediaDevices = bridge.onMediaDeviceCatalog((catalog) => {
      this.applyMediaDeviceCatalog(catalog);
      this.emit();
    });
  }

  private removeSubscriptions(): void {
    this.unsubscribeSnapshot?.();
    this.unsubscribeSystem?.();
    this.unsubscribeSystemCheck?.();
    this.unsubscribeInput?.();
    this.unsubscribeHid?.();
    this.unsubscribeMediaDevices?.();
    this.unsubscribeSnapshot = null;
    this.unsubscribeSystem = null;
    this.unsubscribeSystemCheck = null;
    this.unsubscribeInput = null;
    this.unsubscribeHid = null;
    this.unsubscribeMediaDevices = null;
  }

  private recordActivity(level: "info" | "warning" | "error", message: string): void {
    this.activity.unshift({ id: `${Date.now()}-${this.activity.length}`, timestamp: new Date().toISOString(), level, message });
    this.activity.splice(30);
    this.emit();
  }

  private emit(): void {
    const snapshot = this.build();
    for (const listener of this.listeners) listener(snapshot);
  }

  private build(): OperatorSnapshot {
    if (!this.engine || !this.settings) return unavailableSnapshot;
    const engine = this.engine;
    const simulationMode = engine.mode.simulation;
    const settings = mapSettings(this.settings, this.content);
    const activeProfile = this.settings[this.settings.operationMode];
    const state = validState(engine.state);
    const scenes = mapScenes(this.content);
    const scene = scenes.find((entry) => entry.id === state);
    const checkLabels: Record<keyof EngineSnapshot["checks"], string> = {
      audienceDisplay: "Audience display",
      microphonePermission: "Microphone permission",
      microphoneDevice: "Microphone device",
      microphoneSignal: "Microphone signal",
      recordButton: "Red button",
      choiceButton: "White button",
      audioOutput: "Audio output",
      videoEngine: "Video engine",
      storage: "Temporary storage",
      acPower: "AC power",
      contentConfig: "Content configuration",
      inputMonitoring: "Input Monitoring",
    };
    const checkViewIds: Record<keyof EngineSnapshot["checks"], string> = {
      audienceDisplay: "display",
      microphonePermission: "microphonePermission",
      microphoneDevice: "microphone",
      microphoneSignal: "microphoneSignal",
      recordButton: "redButton",
      choiceButton: "whiteButton",
      audioOutput: "audio",
      videoEngine: "videoEngine",
      storage: "storage",
      acPower: "power",
      contentConfig: "content",
      inputMonitoring: "inputMonitoring",
    };
    let health = Object.entries(engine.checks).map<HealthItem>(([id, item]) => ({
      id: checkViewIds[id as keyof EngineSnapshot["checks"]],
      label: checkLabels[id as keyof EngineSnapshot["checks"]],
      status: checkStatus(item.status),
      detail: item.summary,
      required: true,
      checkedAt: new Date(item.updatedAtMs).toISOString(),
    }));
    const selectedMicrophoneMissing = Boolean(
      activeProfile.microphoneDeviceId &&
      !this.microphones.some((device) => device.id === activeProfile.microphoneDeviceId),
    );
    if (selectedMicrophoneMissing) {
      health = health.filter((item) => item.id !== "microphone");
      health.push({
        id: "microphone",
        label: "Selected microphone",
        status: "failed",
        detail: `${activeProfile.microphoneDeviceLabel || "The saved microphone"} is disconnected. Reconnect it or explicitly choose another device.`,
        required: true,
        checkedAt: new Date().toISOString(),
      });
    }
    const readiness = engine.readiness;
    const runMode = engine.status === "RESETTING"
      ? "resetting"
      : engine.runMode === "paused"
        ? "paused"
        : engine.runMode === "running"
          ? "running"
          : "idle";
    const playbackMs = engine.media.currentTimeMs;
    const playbackDurationMs = engine.media.durationMs ?? scene?.durationMs ?? 0;
    const stateEnteredAt = engine.sessionId === null ? null : engine.stateEnteredAtMs;
    const engineMediaError = engine.media.status === "error"
      ? engine.warnings.find((warning) => warning.code === "AUDIENCE_MEDIA_ERROR")?.message ??
        engine.error?.message ??
        "Audience media playback failed."
      : null;
    return {
      revision: engine.stateRevision,
      appVersion: "1.0.0",
      readiness,
      canStart: engine.readinessByMode[engine.mode.operation] === "ready",
      runMode,
      experienceState: state,
      currentSceneLabel: engine.scene.title,
      currentSceneFile: engine.scene.media ?? "Cinematic placeholder",
      playbackMs,
      playbackDurationMs,
      mediaReady: ["ready", "playing", "paused", "ended"].includes(engine.media.status) || this.mediaTelemetry.ready,
      droppedVideoFrames: this.mediaTelemetry.droppedVideoFrames,
      totalVideoFrames: this.mediaTelemetry.totalVideoFrames,
      mediaError: engineMediaError ?? this.mediaTelemetry.error,
      recordingStatus: engine.recording.status === "RECORDING" ? "recording" : engine.recording.status === "CAPTURED" ? "captured" : engine.recording.status === "ERROR" || engine.recording.status === "UNAVAILABLE" ? "error" : "none",
      microphoneLevel: engine.recording.inputLevel ?? 0,
      operationMode: engine.mode.operation,
      modeReadiness: { ...engine.readinessByMode },
      simulationMode,
      developerMode: engine.mode.developer,
      audienceDisplayLabel: engine.devices.audienceDisplay.label ?? "Development preview",
      audioOutputLabel: engine.devices.audioOutput.label ?? "Uses macOS system output",
      contentPackLabel: this.content.warning ? `Last-known-good · ${this.content.warning}` : this.content.source ?? "Validated content",
      contentValidation: { valid: this.contentValidation.valid, issues: [...this.contentValidation.issues] },
      developmentMediaUrl: this.developmentMediaUrl,
      session: {
        id: engine.sessionId,
        startedAt: stateEnteredAt === null ? null : new Date(stateEnteredAt).toISOString(),
        elapsedMs: stateEnteredAt === null ? 0 : Math.max(0, Date.now() - stateEnteredAt),
      },
      health,
      recentActivity: [...this.activity],
      displays: this.displays.map((display) => ({
        id: display.id,
        label: display.label,
        resolution: `${display.bounds.width} × ${display.bounds.height}`,
        isPrimary: display.primary,
        isAvailable: true,
      })),
      microphones: [
        ...this.microphones.map((device) => ({ id: device.id, label: device.label, isDefault: device.isDefault, isAvailable: true })),
        ...(selectedMicrophoneMissing && activeProfile.microphoneDeviceId
          ? [{
              id: activeProfile.microphoneDeviceId,
              label: `${activeProfile.microphoneDeviceLabel || "Saved microphone"} · Disconnected`,
              isDefault: false,
              isAvailable: false,
            }]
          : []),
      ],
      audioOutputs: this.audioOutputs.map((device) => ({
        id: device.id,
        label: device.label,
        isDefault: device.isDefault,
        isAvailable: true,
      })),
      hid: this.hidState,
      scenes,
      settings,
    };
  }

  private mapEngineCommand(command: OperatorCommand): OperatorCommandMessage | null {
    const envelope = { requestId: createRequestId(), issuedAtMs: Date.now() };
    switch (command.type) {
      case "experience.start": return { ...envelope, command: "START" };
      case "experience.pause": return { ...envelope, command: "PAUSE" };
      case "experience.resume": return { ...envelope, command: "RESUME" };
      case "experience.restartScene": return { ...envelope, command: "RESTART_SCENE" };
      case "experience.skipScene": return { ...envelope, command: "SKIP_SCENE" };
      case "experience.emergencyReset": return { ...envelope, command: "EMERGENCY_RESET" };
      case "experience.returnToIdle": return { ...envelope, command: "RETURN_TO_IDLE" };
      case "experience.reset": return { ...envelope, command: "RESET" };
      case "sceneTester.play": return { ...envelope, command: "TEST_SCENE", state: validState(command.sceneId), loop: command.loop };
      case "sceneTester.stop": return { ...envelope, command: "STOP_SCENE_TEST" };
      case "input.simulate": return { ...envelope, command: "SIMULATE_INPUT", action: command.input };
      default: return null;
    }
  }
}

const electronAdapter = new ElectronOperatorAdapter();

export function getOperatorBridge(): OperatorBridge {
  return window.relight?.operator ?? (window.relightOperator ? electronAdapter : {
    getSnapshot: async () => unavailableSnapshot,
    subscribe: () => () => undefined,
    dispatch: async () => ({ ok: false, message: "The Electron preload is not connected." }),
  });
}

export async function dispatchOperatorCommand(command: OperatorCommand): Promise<CommandResult> {
  try {
    return await getOperatorBridge().dispatch(command);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The command could not be completed." };
  }
}
