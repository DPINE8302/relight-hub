import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { EngineSnapshot, IpcAcknowledgement, OperatorCommandMessage } from "../shared/contracts";
import type {
  AppSettings,
  AppSettingsPatch,
  DisplayDescriptor,
  HidState,
  MediaDeviceCatalog,
  ProductionInputRole,
  SystemCheckSnapshot,
} from "../main/types";
import type { InputEventReport, TestKeyEvent } from "../main/input-manager";
import type { HidHelperEvent } from "../main/hid-protocol";

// Keep this preload self-contained. Sandboxed Electron preloads use a limited
// CommonJS loader and cannot import a shared local runtime chunk.
const CHANNELS = {
  operator: {
    getSnapshot: "relight:operator:get-snapshot",
    command: "relight:operator-command",
    getSettings: "relight:operator:get-settings",
    updateSettings: "relight:operator:update-settings",
    getDisplays: "relight:operator:get-displays",
    getMediaDeviceCatalog: "relight:operator:get-media-device-catalog",
    refreshMediaDeviceCatalog: "relight:operator:refresh-media-device-catalog",
    mediaDeviceCatalog: "relight:operator:media-device-catalog",
    runSystemCheck: "relight:operator:run-system-check",
    requestMicrophonePermission: "relight:operator:request-microphone-permission",
    openMicrophoneSettings: "relight:operator:open-microphone-settings",
    exportDiagnostics: "relight:operator:export-diagnostics",
    getContent: "relight:operator:get-content",
    chooseContentFolder: "relight:operator:choose-content-folder",
    validateContent: "relight:operator:validate-content",
    reloadContent: "relight:operator:reload-content",
    restoreContent: "relight:operator:restore-content",
    chooseDevelopmentVideo: "relight:operator:choose-development-video",
    revealContentFolder: "relight:operator:reveal-content-folder",
    snapshot: "relight:engine-snapshot",
    systemEvent: "relight:operator:system-event",
    systemCheckSnapshot: "relight:system-check-snapshot",
    inputEvent: "relight:input-event",
    getHidState: "relight:operator:get-hid-state",
    refreshHid: "relight:operator:refresh-hid",
    requestHidAccess: "relight:operator:request-hid-access",
    openInputMonitoringSettings: "relight:operator:open-input-monitoring-settings",
    beginHidLearn: "relight:operator:begin-hid-learn",
    cancelHidLearn: "relight:operator:cancel-hid-learn",
    confirmHidLearn: "relight:operator:confirm-hid-learn",
    forgetHidBinding: "relight:operator:forget-hid-binding",
    testKey: "relight:operator:test-key",
    testTransport: "relight:operator:test-transport",
    hidState: "relight:operator:hid-state",
    testCrashAudience: "relight:test:crash-audience",
    testCrashOperator: "relight:test:crash-operator",
    testInjectHidFixture: "relight:test:inject-hid-fixture",
    testBeginActiveProduction: "relight:test:begin-active-production",
  },
} as const;

export interface OperatorBridge {
  getSnapshot(): Promise<EngineSnapshot>;
  dispatchCommand(command: OperatorCommandMessage): Promise<IpcAcknowledgement>;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: AppSettingsPatch): Promise<AppSettings>;
  getDisplays(): Promise<DisplayDescriptor[]>;
  getMediaDeviceCatalog(): Promise<MediaDeviceCatalog>;
  refreshMediaDeviceCatalog(): Promise<MediaDeviceCatalog>;
  runSystemCheck(checkId?: SystemCheckSnapshot["items"][number]["id"]): Promise<SystemCheckSnapshot>;
  requestMicrophonePermission(): Promise<{ granted: boolean; status: string; restartRequired: boolean }>;
  openMicrophoneSettings(): Promise<boolean>;
  exportDiagnostics(): Promise<{ exported: boolean; fileName?: string }>;
  getContent(): Promise<unknown>;
  chooseContentFolder(): Promise<unknown>;
  validateContent(): Promise<{ valid: boolean; issues: string[] }>;
  reloadContent(): Promise<unknown>;
  restoreContent(): Promise<unknown>;
  chooseDevelopmentVideo?(): Promise<{ selected: boolean; url?: string }>;
  revealContentFolder(): Promise<boolean>;
  onSnapshot(listener: (snapshot: EngineSnapshot) => void): () => void;
  onSystemEvent(listener: (event: unknown) => void): () => void;
  onSystemCheck(listener: (snapshot: SystemCheckSnapshot) => void): () => void;
  onInputEvent(listener: (event: unknown) => void): () => void;
  getHidState(): Promise<HidState>;
  refreshHid(): Promise<HidState>;
  requestHidAccess(): Promise<HidState>;
  openInputMonitoringSettings(): Promise<boolean>;
  beginHidLearn(role: ProductionInputRole): Promise<HidState>;
  cancelHidLearn(token: string): Promise<HidState>;
  confirmHidLearn(token: string): Promise<HidState>;
  forgetHidBinding(role: ProductionInputRole): Promise<HidState>;
  sendTestKey(input: TestKeyEvent): Promise<InputEventReport>;
  testTransport(action: "start" | "togglePause" | "previous" | "next" | "restart"): Promise<InputEventReport>;
  onHidState(listener: (state: HidState) => void): () => void;
  onMediaDeviceCatalog(listener: (catalog: MediaDeviceCatalog) => void): () => void;
  testOnlyCrashAudience?(): Promise<boolean>;
  testOnlyCrashOperator?(): Promise<boolean>;
  testOnlyInjectHidFixture?(event: HidHelperEvent): Promise<HidState>;
  testOnlyBeginActiveProduction?(): Promise<EngineSnapshot>;
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const bridge: OperatorBridge = {
  getSnapshot: () => ipcRenderer.invoke(CHANNELS.operator.getSnapshot) as Promise<EngineSnapshot>,
  dispatchCommand: (command) => ipcRenderer.invoke(CHANNELS.operator.command, command) as Promise<IpcAcknowledgement>,
  getSettings: () => ipcRenderer.invoke(CHANNELS.operator.getSettings) as Promise<AppSettings>,
  updateSettings: (patch) => ipcRenderer.invoke(CHANNELS.operator.updateSettings, patch) as Promise<AppSettings>,
  getDisplays: () => ipcRenderer.invoke(CHANNELS.operator.getDisplays) as Promise<DisplayDescriptor[]>,
  getMediaDeviceCatalog: () =>
    ipcRenderer.invoke(CHANNELS.operator.getMediaDeviceCatalog) as Promise<MediaDeviceCatalog>,
  refreshMediaDeviceCatalog: () =>
    ipcRenderer.invoke(CHANNELS.operator.refreshMediaDeviceCatalog) as Promise<MediaDeviceCatalog>,
  runSystemCheck: (checkId) =>
    ipcRenderer.invoke(
      CHANNELS.operator.runSystemCheck,
      checkId === undefined ? undefined : { checkId },
    ) as Promise<SystemCheckSnapshot>,
  requestMicrophonePermission: () =>
    ipcRenderer.invoke(CHANNELS.operator.requestMicrophonePermission) as Promise<{
      granted: boolean;
      status: string;
      restartRequired: boolean;
    }>,
  openMicrophoneSettings: () => ipcRenderer.invoke(CHANNELS.operator.openMicrophoneSettings) as Promise<boolean>,
  exportDiagnostics: () =>
    ipcRenderer.invoke(CHANNELS.operator.exportDiagnostics) as Promise<{ exported: boolean; fileName?: string }>,
  getContent: () => ipcRenderer.invoke(CHANNELS.operator.getContent) as Promise<unknown>,
  chooseContentFolder: () => ipcRenderer.invoke(CHANNELS.operator.chooseContentFolder) as Promise<unknown>,
  validateContent: () =>
    ipcRenderer.invoke(CHANNELS.operator.validateContent) as Promise<{ valid: boolean; issues: string[] }>,
  reloadContent: () => ipcRenderer.invoke(CHANNELS.operator.reloadContent) as Promise<unknown>,
  restoreContent: () => ipcRenderer.invoke(CHANNELS.operator.restoreContent) as Promise<unknown>,
  revealContentFolder: () => ipcRenderer.invoke(CHANNELS.operator.revealContentFolder) as Promise<boolean>,
  onSnapshot: (listener) => subscribe(CHANNELS.operator.snapshot, listener),
  onSystemEvent: (listener) => subscribe(CHANNELS.operator.systemEvent, listener),
  onSystemCheck: (listener) => subscribe(CHANNELS.operator.systemCheckSnapshot, listener),
  onInputEvent: (listener) => subscribe(CHANNELS.operator.inputEvent, listener),
  getHidState: () => ipcRenderer.invoke(CHANNELS.operator.getHidState) as Promise<HidState>,
  refreshHid: () => ipcRenderer.invoke(CHANNELS.operator.refreshHid) as Promise<HidState>,
  requestHidAccess: () => ipcRenderer.invoke(CHANNELS.operator.requestHidAccess) as Promise<HidState>,
  openInputMonitoringSettings: () => ipcRenderer.invoke(CHANNELS.operator.openInputMonitoringSettings) as Promise<boolean>,
  beginHidLearn: (role) => ipcRenderer.invoke(CHANNELS.operator.beginHidLearn, { role }) as Promise<HidState>,
  cancelHidLearn: (token) => ipcRenderer.invoke(CHANNELS.operator.cancelHidLearn, { token }) as Promise<HidState>,
  confirmHidLearn: (token) => ipcRenderer.invoke(CHANNELS.operator.confirmHidLearn, { token }) as Promise<HidState>,
  forgetHidBinding: (role) => ipcRenderer.invoke(CHANNELS.operator.forgetHidBinding, { role }) as Promise<HidState>,
  sendTestKey: (input) => ipcRenderer.invoke(CHANNELS.operator.testKey, input) as Promise<InputEventReport>,
  testTransport: (action) => ipcRenderer.invoke(CHANNELS.operator.testTransport, { action }) as Promise<InputEventReport>,
  onHidState: (listener) => subscribe(CHANNELS.operator.hidState, listener),
  onMediaDeviceCatalog: (listener) => subscribe(CHANNELS.operator.mediaDeviceCatalog, listener),
};

if (process.argv.includes("--relight-e2e-preload")) {
  bridge.testOnlyCrashAudience = () => ipcRenderer.invoke(CHANNELS.operator.testCrashAudience) as Promise<boolean>;
  bridge.testOnlyCrashOperator = () => ipcRenderer.invoke(CHANNELS.operator.testCrashOperator) as Promise<boolean>;
}

if (process.argv.includes("--relight-e2e-hid-fixture-preload")) {
  // Main adds this renderer argument only after both E2E and fixture gates
  // pass. Main also owns the authoritative handler-registration gate.
  bridge.testOnlyInjectHidFixture = (event) => ipcRenderer.invoke(
    CHANNELS.operator.testInjectHidFixture,
    event,
  ) as Promise<HidState>;
  bridge.testOnlyBeginActiveProduction = () => ipcRenderer.invoke(
    CHANNELS.operator.testBeginActiveProduction,
  ) as Promise<EngineSnapshot>;
}

if (process.defaultApp) {
  bridge.chooseDevelopmentVideo = () =>
    ipcRenderer.invoke(CHANNELS.operator.chooseDevelopmentVideo) as Promise<{ selected: boolean; url?: string }>;
}

contextBridge.exposeInMainWorld("relightOperator", Object.freeze(bridge));
