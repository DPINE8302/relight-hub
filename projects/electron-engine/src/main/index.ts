import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  app,
  dialog,
  powerSaveBlocker,
  type MessageBoxSyncOptions,
} from "electron";
import { ContentManager } from "./content-manager";
import { exportDiagnostics } from "./diagnostics";
import { EngineCoordinator } from "./engine-coordinator";
import { HidService, type HidServiceEvent } from "./hid-service";
import { InputManager } from "./input-manager";
import { IPC } from "./ipc-contracts";
import { IpcService } from "./ipc-service";
import { logger } from "./logger";
import { NativeInputGate } from "./native-input-gate";
import { installNativeMenu } from "./native-menu";
import {
  hasExactMicrophonePurposeString,
  readBundleIdentifier,
  runPackageVerification,
} from "./package-verification";
import { PermissionService } from "./permission-service";
import { PowerService } from "./power-service";
import { ProtocolService, registerPrivilegedSchemes } from "./protocols";
import { detectRuntimeMode, type RuntimeMode } from "./runtime-mode";
import { SecurityPolicy } from "./security-policy";
import { SettingsStore } from "./settings-store";
import { cleanupStaleRecordings } from "./startup-cleanup";
import {
  SystemCheckService,
  systemCheckGateFromSnapshot,
} from "./system-check-service";
import type { EngineCommandType } from "./types";
import { WindowManager } from "./window-manager";

registerPrivilegedSchemes();
app.setName("RE:Light Engine");
function applicationDataDirectoryForLaunch(): string {
  const verificationIndex = process.argv.indexOf("--relight-verification-user-data");
  const e2eIndex = process.argv.indexOf("--relight-e2e-user-data");
  const isE2E = process.env.RELIGHT_E2E === "1" || process.argv.includes("--relight-e2e");
  if (e2eIndex !== -1 && !isE2E) throw new Error("E2E user data is accepted only by the E2E runtime");
  const index = verificationIndex !== -1 ? verificationIndex : e2eIndex;
  if (index === -1) return join(homedir(), "Library", "Application Support", "RELight Engine");
  const candidate = process.argv[index + 1];
  if (candidate === undefined) throw new Error("Isolated user-data path is missing");
  const resolved = resolve(candidate);
  const temporaryRoot = resolve(app.getPath("temp"));
  const child = relative(temporaryRoot, resolved);
  const expectedParentPrefix = verificationIndex !== -1 ? "relight-package-run-" : "relight-e2e-";
  if (
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    basename(resolved) !== "user-data" ||
    !basename(dirname(resolved)).startsWith(expectedParentPrefix)
  ) {
    throw new Error("Isolated user data must be a named folder inside the system temporary directory");
  }
  return resolved;
}

const applicationDataDirectory = applicationDataDirectoryForLaunch();
const applicationLogDirectory = join(applicationDataDirectory, "logs");
mkdirSync(applicationLogDirectory, { recursive: true, mode: 0o700 });
app.setPath("userData", applicationDataDirectory);
app.setPath("logs", applicationLogDirectory);

interface RuntimeServices {
  runtimeMode: RuntimeMode;
  windows: WindowManager;
  coordinator: EngineCoordinator;
  input: InputManager;
  nativeInput: NativeInputGate;
  hid: HidService;
  unsubscribeHidState: () => void;
  unsubscribeHidEvents: () => void;
  onWindowFocus: () => void;
  onWindowBlur: () => void;
  ipc: IpcService;
  protocol: ProtocolService;
  security: SecurityPolicy;
  power: PowerService;
  powerSaveBlockerId: number;
}

let services: RuntimeServices | null = null;
let shutdownStarted = false;
let allowQuit = false;
let startupFailed = false;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function bootstrap(): Promise<RuntimeServices> {
  const runtimeMode = await detectRuntimeMode();
  logger.initialize(join(app.getPath("userData"), "logs"), runtimeMode.development);
  logger.info("Starting RE:Light Engine", {
    packaged: app.isPackaged,
    development: runtimeMode.development,
    e2e: runtimeMode.e2e,
    packageVerification: runtimeMode.packageVerification,
  });

  const settingsStore = new SettingsStore(app.getPath("userData"));
  let settings = await settingsStore.initialize();
  const defaultContentRoot = join(homedir(), "Movies", "RELight Engine Content");
  const contentRoot = settings.contentRoot ?? defaultContentRoot;
  const resourceRoot = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "resources");
  const content = new ContentManager(
    contentRoot,
    join(resourceRoot, "default-content"),
    app.getPath("userData"),
  );
  const loadedContent = await content.initialize();
  if (settings.contentRoot === null) settings = await settingsStore.update({ contentRoot });

  await cleanupStaleRecordings(app.getPath("temp"));

  const hidHelperPath = app.isPackaged
    ? resolve(process.resourcesPath, "..", "Library", "Helpers", "relight-hid-bridge")
    : join(app.getAppPath(), "native", "hid-bridge", "build", "relight-hid-bridge");
  const hid = new HidService({
    helperPath: hidHelperPath,
    e2e: runtimeMode.e2e,
    initialBindings: settings.production.inputBindings,
  });
  try {
    await hid.start();
  } catch (error) {
    logger.warn("Native HID helper is unavailable; Test remains available and Production stays blocked", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const permissions = new PermissionService();
  const security = new SecurityPolicy(app.isPackaged, () => permissions.canUseMicrophone() || runtimeMode.e2e);
  security.install();

  const protocolService = new ProtocolService(
    join(app.getAppPath(), "out", "renderer"),
    content.contentDirectory,
    join(resourceRoot, "fonts", "line-seed-sans-th"),
    runtimeMode.development,
  );
  await protocolService.install();

  let systemCheck: SystemCheckService;
  let inputManager: InputManager | null = null;
  let coordinator: EngineCoordinator;
  let gateUpdate: Promise<void> = Promise.resolve();
  let audienceRecovery: Promise<void> | null = null;

  let windows: WindowManager;
  const power = new PowerService((status) => {
    windows.send("operator", IPC.operator.systemEvent, { type: "POWER_CHANGED", status });
    if (systemCheck !== undefined) void systemCheck.run();
  });

  windows = new WindowManager(
    settings,
    security,
    {
      onQuitRequested: () => app.quit(),
      onAudienceFailure: (reason) => {
        if (audienceRecovery !== null) return;
        audienceRecovery = (async () => {
          logger.error("Audience runtime recovery started", undefined, { reason });
          await coordinator.dispatch({
            type: "EMERGENCY_RESET",
            source: "system",
            occurredAt: Date.now(),
          });
          await windows.recreateAudienceWindow();
          await coordinator.dispatch({
            type: "EMERGENCY_RESET",
            source: "system",
            occurredAt: Date.now(),
          });
        })()
          .catch((error: unknown) => logger.error("Audience runtime recovery failed", error))
          .finally(() => {
            audienceRecovery = null;
          });
      },
      onDisplayTopology: (event) => {
        windows.send("operator", IPC.operator.systemEvent, {
          type: "DISPLAY_TOPOLOGY_CHANGED",
          ...event,
        });
        if (systemCheck !== undefined) void systemCheck.run();
      },
      onOperatorRecreated: (_webContents) => {
        setTimeout(() => {
          void coordinator.syncWindows().catch((error: unknown) => logger.error("Operator resynchronization failed", error));
        }, 100);
      },
      onAudienceRecreated: (_webContents) => {
        setTimeout(() => {
          void coordinator.syncWindows().catch((error: unknown) => logger.error("Audience resynchronization failed", error));
        }, 100);
      },
    },
    runtimeMode,
  );

  coordinator = new EngineCoordinator({
    configuration: loadedContent.configuration,
    windows,
    accelerated: runtimeMode.e2e || runtimeMode.packageVerification,
    inputSource: "TEST_KEYBOARD",
  });

  systemCheck = new SystemCheckService(
    app.getPath("userData"),
    join(app.getPath("userData"), "logs"),
    windows,
    content,
    permissions,
    power,
    (snapshot) => {
      windows.send("operator", IPC.operator.systemCheckSnapshot, snapshot);
      gateUpdate = coordinator.applySystemCheckGate(systemCheckGateFromSnapshot(snapshot));
      void gateUpdate.catch((error: unknown) => logger.error("System-check gate update failed", error));
    },
    () => settingsStore.get().operationMode === "test" || runtimeMode.e2e || runtimeMode.packageVerification,
    (mode = settingsStore.get().operationMode) => settingsStore.get()[mode].microphoneDeviceId,
    () => settingsStore.get().operationMode,
    (mode = settingsStore.get().operationMode) => settingsStore.get()[mode].audioOutputDeviceId,
    () => runtimeMode.e2e || runtimeMode.packageVerification,
    () => hid.getState(),
  );

  inputManager = new InputManager(
    async (action, occurredAt) => {
      const snapshot = coordinator.getSnapshot();
      let result: { accepted: boolean; reason?: string };
      if (action === "START_PAUSE_RESUME") {
        if (snapshot.state === "IDLE") {
          await systemCheck.run();
          await gateUpdate;
          result = await coordinator.dispatch({ type: "START", source: "keyboard", occurredAt });
        } else {
          const state = content.get().configuration.states.find((candidate) => candidate.id === snapshot.state);
          if (state?.kind !== "passive") {
            result = { accepted: false, reason: "Space only pauses or resumes passive Test scenes" };
          } else {
            result = await coordinator.dispatch({
              type: snapshot.runMode === "PAUSED" ? "RESUME" : "PAUSE",
              source: "keyboard",
              occurredAt,
            });
          }
        }
      } else if (action === "PREVIOUS" || action === "NEXT") {
        result = await coordinator.navigateTest(action === "PREVIOUS" ? "previous" : "next", occurredAt);
      } else if (action === "RESTART") {
        result = await coordinator.dispatch({ type: "RESTART_SCENE", source: "keyboard", occurredAt });
      } else {
        result = await coordinator.dispatch({
          type: action,
          source: "keyboard",
          inputSource: "TEST_KEYBOARD",
          occurredAt,
        });
      }
      return {
        accepted: result.accepted,
        state: coordinator.getSnapshot().state,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      };
    },
    (report) => {
      windows.send("operator", IPC.operator.inputEvent, report);
      const role = report.action === "RECORD_BUTTON"
        ? "RECORD_BUTTON"
        : report.action === "CHOICE_BUTTON"
          ? "CHOICE_BUTTON"
          : report.action === "PREVIOUS"
            ? "PREVIOUS"
            : report.action === "NEXT"
              ? "NEXT"
              : report.action === "RESTART" ? "RESTART" : "PAUSE_RESUME";
      hid.recordResolvedInput("TEST_KEYBOARD", role, report.accepted, report.occurredAt, report.reason ?? report.state);
    },
    () => {
      if (settingsStore.get().operationMode !== "test") {
        return { accepted: false, reason: "Keyboard controls are disabled in Production" };
      }
      const operator = windows.get("operator");
      if (operator === null || !operator.isFocused()) {
        return { accepted: false, reason: "RE:Light must be foreground for Test keyboard input" };
      }
      return { accepted: true };
    },
  );

  const nativeInput = new NativeInputGate(
    async (role, occurredAt) => {
      const result = await coordinator.dispatch({
        type: role,
        source: "nativeHid",
        inputSource: "NATIVE_HID",
        occurredAt,
      });
      return {
        accepted: result.accepted,
        state: coordinator.getSnapshot().state,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      };
    },
    () => {
      if (settingsStore.get().operationMode !== "production") {
        return { accepted: false, reason: "Native HID controls are reserved for Production" };
      }
      const foreground = windows.get("operator")?.isFocused() === true || windows.get("audience")?.isFocused() === true;
      return foreground
        ? { accepted: true }
        : { accepted: false, reason: "RE:Light must be foreground for Production input" };
    },
    (report) => windows.send("operator", IPC.operator.inputEvent, report),
  );

  let hidEventChain = Promise.resolve();
  const handleHidEvent = async (event: HidServiceEvent): Promise<void> => {
    if (event.type === "input") {
      const report = await nativeInput.handle(event);
      let accepted = report.accepted;
      let detail = report.reason ?? report.state;
      if (report.completedPressRelease) {
        accepted = await systemCheck.recordNativeButtonInput(event.role, event.deviceId, event.elementId) || accepted;
        if (accepted) detail = "Assigned control press-release verified";
      }
      if (event.edge === "down" || report.completedPressRelease) {
        hid.recordResolvedInput("NATIVE_HID", event.role, accepted, event.occurredAt, detail);
      }
      return;
    }
    if (event.type === "heartbeat") return;

    const assignedFailure = event.type === "deviceRemoved"
      ? event.assignedRoles.length > 0
      : event.type === "accessChanged"
        ? event.access !== "granted"
        : event.type === "fault" && !event.recoverable;
    if (!assignedFailure) return;
    await systemCheck.invalidateNativeInputs(
      event.type === "deviceRemoved"
        ? "Assigned USB control disconnected; reconnect it and run fresh checks"
        : "Native input access changed; resolve it and run fresh checks",
    );
    const snapshot = coordinator.getSnapshot();
    if (settingsStore.get().operationMode === "production" && snapshot.sessionId !== null) {
      await coordinator.dispatch({ type: "EMERGENCY_RESET", source: "system", occurredAt: Date.now() });
    }
  };
  const unsubscribeHidEvents = hid.subscribeEvents((event) => {
    hidEventChain = hidEventChain
      .then(() => handleHidEvent(event))
      .catch((error: unknown) => logger.error("Native HID event handling failed", error));
  });
  const unsubscribeHidState = hid.subscribeState((state) => {
    windows.send("operator", IPC.operator.hidState, state);
  });

  const syncHidForeground = (): void => {
    const foreground = windows.get("operator")?.isFocused() === true || windows.get("audience")?.isFocused() === true;
    if (!foreground) nativeInput.reset();
    if (!hid.getState().helperAvailable) return;
    void hid.setForeground(foreground).catch((error: unknown) => logger.warn("Could not update native HID foreground state", {
      error: error instanceof Error ? error.message : String(error),
    }));
  };
  const onWindowFocus = (): void => syncHidForeground();
  const onWindowBlur = (): void => {
    setTimeout(syncHidForeground, 0);
  };
  app.on("browser-window-focus", onWindowFocus);
  app.on("browser-window-blur", onWindowBlur);

  const ipc = new IpcService({
    windows,
    coordinator,
    settings: settingsStore,
    content,
    permissions,
    power,
    systemCheck,
    runtimeMode,
    input: inputManager,
    hid,
    onContentRootChanged: (newContentRoot) => protocolService.setContentRoot(newContentRoot),
    issueDevelopmentVideo: (filePath) => protocolService.issueDevelopmentVideo(filePath),
  });
  ipc.install();

  await power.initialize();
  const blockerId = powerSaveBlocker.start("prevent-display-sleep");
  await coordinator.boot();
  await windows.create();
  syncHidForeground();
  installNativeMenu({
    command: async (type: EngineCommandType) => {
      if (type === "START") {
        await systemCheck.run();
        await gateUpdate;
      }
      await coordinator.dispatch({ type, source: "operator", occurredAt: Date.now() });
    },
    getSnapshot: () => coordinator.getSnapshot(),
    showSettings: () => {
      windows.focusOperator();
      windows.send("operator", IPC.operator.systemEvent, { type: "NAVIGATE", destination: "settings" });
    },
    exportDiagnostics: async () => {
      const operator = windows.get("operator");
      if (operator === null) return;
      await exportDiagnostics(operator, {
        settings: settingsStore.get(),
        displays: windows.getDisplays(),
        systemCheck: systemCheck.get(),
        power: power.get(),
        engineSnapshot: coordinator.getSnapshot(),
      });
    },
  });

  await systemCheck.run();
  await gateUpdate;
  await wait(100);
  await coordinator.syncWindows();

  if (runtimeMode.packageVerification && runtimeMode.verificationSentinelPath !== null) {
    const audienceReady = await coordinator.waitForAudienceReady(5_000);
    if (!audienceReady) logger.error("Audience READY signal timed out during package verification");
    const permission = await permissions.requestMicrophonePermission();
    const mediaDeviceCatalog = await ipc.refreshMediaDevicesForPackageVerification();
    const placeholderCycle = audienceReady ? await coordinator.runVerificationCycle() : false;
    await runPackageVerification(
      runtimeMode.verificationSentinelPath,
      placeholderCycle,
      {
        audienceReady,
        bundleId: await readBundleIdentifier(),
        microphonePurposeStringPresent: await hasExactMicrophonePurposeString(),
        microphonePermissionStatus: permission.status,
        mediaDevices: {
          audioInputCount: mediaDeviceCatalog.audioInputs.length,
          audioOutputCount: mediaDeviceCatalog.audioOutputs.length,
          namedAudioInputAvailable: mediaDeviceCatalog.audioInputs.some(
            (device) => !/^Microphone \d+$/.test(device.label),
          ),
        },
        networkAudit: security.getNetworkAudit(),
      },
    );
  }

  return {
    runtimeMode,
    windows,
    coordinator,
    input: inputManager,
    nativeInput,
    hid,
    unsubscribeHidState,
    unsubscribeHidEvents,
    onWindowFocus,
    onWindowBlur,
    ipc,
    protocol: protocolService,
    security,
    power,
    powerSaveBlockerId: blockerId,
  };
}

async function shutdown(): Promise<void> {
  if (services === null) return;
  const active = services;
  try {
    await active.coordinator.dispatch({
      type: "EMERGENCY_RESET",
      source: "system",
      occurredAt: Date.now(),
    });
    await wait(100);
  } catch (error) {
    logger.error("Emergency shutdown reset failed", error);
  }
  active.windows.prepareToQuit();
  active.input.dispose();
  active.nativeInput.reset();
  active.ipc.dispose();
  active.unsubscribeHidState();
  active.unsubscribeHidEvents();
  app.off("browser-window-focus", active.onWindowFocus);
  app.off("browser-window-blur", active.onWindowBlur);
  await active.hid.dispose();
  await active.coordinator.dispose();
  active.power.dispose();
  if (powerSaveBlocker.isStarted(active.powerSaveBlockerId)) {
    powerSaveBlocker.stop(active.powerSaveBlockerId);
  }
  active.windows.closeAll();
  active.protocol.dispose();
  active.security.dispose();
  services = null;
  logger.info("RE:Light Engine shutdown completed");
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => services?.windows.focusOperator());
  app.on("activate", () => services?.windows.focusOperator());
  app.on("window-all-closed", () => app.quit());
  app.on("certificate-error", (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(false);
  });
  app.on("child-process-gone", (_event, details) => {
    logger.error("Electron child process exited", undefined, {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
  app.on("before-quit", (event) => {
    if (allowQuit || startupFailed) return;
    event.preventDefault();
    if (shutdownStarted) return;
    const snapshot = services?.coordinator.getSnapshot();
    if (
      snapshot?.sessionId !== null &&
      snapshot?.sessionId !== undefined &&
      services?.runtimeMode.e2e !== true &&
      services?.runtimeMode.packageVerification !== true
    ) {
      const options: MessageBoxSyncOptions = {
        type: "warning",
        title: "Quit RE:Light Engine?",
        message: "A visitor experience is still active.",
        detail: "Quitting will stop playback, erase the temporary recording, and return the audience display to black.",
        buttons: ["Quit and Erase Session", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      };
      const operator = services?.windows.get("operator");
      const response = operator === null || operator === undefined
        ? dialog.showMessageBoxSync(options)
        : dialog.showMessageBoxSync(operator, options);
      if (response !== 0) return;
    }
    shutdownStarted = true;
    void shutdown()
      .catch((error: unknown) => logger.error("Application shutdown failed", error))
      .finally(() => {
        allowQuit = true;
        app.quit();
      });
  });

  void app.whenReady()
    .then(async () => {
      services = await bootstrap();
    })
    .catch((error: unknown) => {
      startupFailed = true;
      logger.error("Application startup failed", error);
      dialog.showErrorBox(
        "RE:Light Engine could not start",
        "The offline runtime could not be initialized. No visitor recording was retained. See the application log for diagnostics.",
      );
      app.quit();
    });
}

process.on("uncaughtException", (error) => {
  logger.error("Uncaught main-process exception", error);
  app.quit();
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled main-process rejection", reason);
  app.quit();
});
