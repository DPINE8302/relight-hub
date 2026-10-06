import type { BrowserWindow, WebContents } from "electron";
import type { AudienceRuntimeEvent, InputSource, RuntimeSnapshot } from "../shared/contracts";
import type { ExperienceConfig } from "../shared/experience-config";
import type { SystemCheckGate } from "../shared/system-check";

export type WindowRole = "operator" | "audience";

export type OperationMode = "production" | "test";
export type ProductionInputRole = "RECORD_BUTTON" | "CHOICE_BUTTON";
export type HidIdentityQuality = "serial" | "physical" | "port" | "session";
export type HidAccessStatus = "unknown" | "granted" | "denied" | "restartRequired";
export type TestSpeed = 1 | 2 | 4;

export interface HidElementBinding {
  role: ProductionInputRole;
  deviceId: string;
  deviceLabel: string;
  elementId: string;
  elementLabel: string;
  usagePage: number;
  usage: number;
  reportId: number;
  logicalMinimum: number;
  logicalMaximum: number;
  releasedValue: number;
  pressedValue: number;
  identityQuality: HidIdentityQuality;
  locationBound: boolean;
  assignedAt: number;
  lastSeenAt: number | null;
}

export interface HidDeviceDescriptor {
  id: string;
  label: string;
  manufacturer: null;
  vendorId: number;
  productId: number;
  transport: "USB";
  identityQuality: HidIdentityQuality;
  identityNote:
    | "Stable device identity"
    | "Stable physical identity"
    | "Bound to this USB port"
    | "Available for this startup only";
  locationBound: boolean;
  internal: boolean;
  connected: boolean;
  assignable: boolean;
  assignableElementCount: number;
  reason:
    | "Internal input devices cannot be assigned"
    | "Pointing devices cannot be assigned"
    | "Sensor devices cannot be assigned"
    | "No compatible momentary controls"
    | null;
  lastSeenAt: number | null;
}

export interface HidLearnState {
  token: string;
  role: ProductionInputRole;
  phase: "waiting" | "firstPress" | "ready" | "error";
  pressCount: 0 | 1 | 2;
  candidate: HidElementBinding | null;
  message: string;
}

export interface HidLastInput {
  source: "NATIVE_HID" | "TEST_KEYBOARD" | "SIMULATION";
  role: ProductionInputRole | "START" | "PREVIOUS" | "NEXT" | "RESTART" | "PAUSE_RESUME";
  accepted: boolean;
  occurredAt: number;
  detail: string;
}

export interface HidState {
  access: HidAccessStatus;
  helperAvailable: boolean;
  devices: HidDeviceDescriptor[];
  bindings: Record<ProductionInputRole, HidElementBinding | null>;
  learn: HidLearnState | null;
  lastInput: HidLastInput | null;
  error: string | null;
}

export type EngineCommandType =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "RESTART_SCENE"
  | "SKIP_SCENE"
  | "RESET"
  | "EMERGENCY_RESET"
  | "RETURN_TO_IDLE"
  | "RECORD_BUTTON"
  | "CHOICE_BUTTON"
  | "TEST_SCENE"
  | "STOP_SCENE_TEST";

export interface EngineCommand {
  type: EngineCommandType;
  sceneId?: string;
  source: "operator" | "keyboard" | "nativeHid" | "audience" | "system";
  inputSource?: InputSource | undefined;
  occurredAt: number;
}

export interface EngineCoordinatorLike {
  getSnapshot(): RuntimeSnapshot;
  dispatch(command: EngineCommand): Promise<{ accepted: boolean; reason?: string }>;
  handleAudienceEvent(event: AudienceRuntimeEvent): Promise<void> | void;
  applySystemCheckGate(gate: SystemCheckGate): Promise<void>;
  reloadConfiguration(configuration: ExperienceConfig): Promise<void>;
  previewSceneForSystemCheck(sceneId: string): Promise<boolean>;
  navigateTest(direction: "previous" | "next", occurredAt: number): Promise<{ accepted: boolean; reason?: string }>;
  syncWindows(): Promise<void>;
  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void;
  isSceneTestActive(): boolean;
  dispose(): Promise<void> | void;
}

export interface DisplayDescriptor {
  id: string;
  label: string;
  primary: boolean;
  internal: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  rotation: number;
}

export interface AppSettings {
  schemaVersion: 2;
  contentRoot: string | null;
  developerMode: boolean;
  operationMode: OperationMode;
  production: DeviceProfile & {
    inputBindings: Record<ProductionInputRole, HidElementBinding | null>;
  };
  test: DeviceProfile & {
    speed: TestSpeed;
    keyboardBindings: TestKeyboardBindings;
  };
  audio: {
    master: number;
    film: number;
    narration: number;
    ambience: number;
    sfx: number;
    visitorVoice: number;
  };
}

export interface DeviceProfile {
  audienceDisplayId: string | null;
  audienceFullscreen: boolean;
  microphoneDeviceId: string | null;
  microphoneDeviceLabel: string | null;
  audioOutputDeviceId: string | null;
}

/**
 * Sanitized renderer observation of Chromium media devices. Labels are
 * deliberately excluded: main needs stable IDs only to verify that an
 * explicitly selected device still exists.
 */
export interface MediaDeviceInventory {
  operationMode: OperationMode;
  audioInputDeviceIds: string[];
  audioOutputDeviceIds: string[];
  sinkSelectionSupported: boolean;
  observedAt: number;
}

export interface MediaDeviceOptionDescriptor {
  id: string;
  label: string;
  isDefault: boolean;
}

/**
 * Sanitized media-device catalog produced by the audience renderer, which is
 * the only renderer allowed to access Chromium media APIs. Device IDs and
 * human-readable labels are returned to the operator UI but are never logged.
 */
export interface MediaDeviceCatalog {
  operationMode: OperationMode;
  audioInputs: MediaDeviceOptionDescriptor[];
  audioOutputs: MediaDeviceOptionDescriptor[];
  sinkSelectionSupported: boolean;
  observedAt: number;
}

export interface TestKeyboardBindings {
  start: "Space";
  record: "KeyR";
  chooseAgain: "KeyW";
  previous: "ArrowLeft";
  next: "ArrowRight";
  restart: "Alt+KeyR";
}

export interface AppSettingsPatch {
  contentRoot?: string | null | undefined;
  developerMode?: boolean | undefined;
  operationMode?: OperationMode | undefined;
  production?: (DeviceProfilePatch & {
    inputBindings?: {
      RECORD_BUTTON?: HidElementBinding | null | undefined;
      CHOICE_BUTTON?: HidElementBinding | null | undefined;
    } | undefined;
  }) | undefined;
  test?: (DeviceProfilePatch & {
    speed?: TestSpeed | undefined;
    keyboardBindings?: {
      [K in keyof TestKeyboardBindings]?: TestKeyboardBindings[K] | undefined;
    } | undefined;
  }) | undefined;
  audio?: { [K in keyof AppSettings["audio"]]?: AppSettings["audio"][K] | undefined } | undefined;
}

export type DeviceProfilePatch = {
  [K in keyof DeviceProfile]?: DeviceProfile[K] | undefined;
};

export function activeDeviceProfile(settings: AppSettings): DeviceProfile {
  return settings.operationMode === "production" ? settings.production : settings.test;
}

export type SystemCheckStatus = "PASS" | "FAIL" | "WARNING" | "NOT_TESTED" | "SIMULATED";

export interface SystemCheckItem {
  id:
    | "power"
    | "display"
    | "content"
    | "microphonePermission"
    | "microphoneDevice"
    | "microphoneSignal"
    | "redButton"
    | "whiteButton"
    | "audioOutput"
    | "videoEngine"
    | "storage"
    | "inputMonitoring";
  label: string;
  status: SystemCheckStatus;
  detail: string;
  checkedAt: number;
}

export interface SystemCheckSnapshot {
  /** True only when every critical check has real evidence. */
  ready: boolean;
  productionReady: boolean;
  testReady: boolean;
  operationMode: OperationMode;
  /** May be true with simulated evidence only under an explicit developer override. */
  canStart: boolean;
  simulationOverride: boolean;
  checkedAt: number;
  items: SystemCheckItem[];
}

export interface RuntimeHealthReport {
  operationMode: OperationMode;
  microphoneDevice?: "PASS" | "FAIL" | "NOT_TESTED" | undefined;
  microphoneSignal: "PASS" | "FAIL" | "NOT_TESTED";
  audioOutput: "PASS" | "FAIL" | "NOT_TESTED";
  videoEngine: "PASS" | "FAIL" | "NOT_TESTED";
  detail?: string | undefined;
}

export interface AudienceMediaCheckRequest {
  id: string;
  type: "mic.test" | "audio.test";
  sessionId: string | null;
  stateRevision: number;
  durationMs?: number | undefined;
  microphoneDeviceId?: string | undefined;
}

type AudienceMediaEventName = "MEDIA_STARTED" | "MEDIA_PROGRESS" | "MEDIA_ERROR";
export type AudienceMediaTelemetryEvent = {
  [EventName in AudienceMediaEventName]: Omit<
    Extract<AudienceRuntimeEvent, { event: EventName }>,
    "event"
  > & { type: EventName; currentIdentity: boolean };
}[AudienceMediaEventName];

export interface PowerStatus {
  onAcPower: boolean;
  detail: string;
  checkedAt: number;
}

export interface WindowRegistry {
  get(role: WindowRole): BrowserWindow | null;
  roleFor(webContents: WebContents): WindowRole | null;
  isTrustedSender(webContents: WebContents, role: WindowRole, frameUrl: string): boolean;
  send(role: WindowRole, channel: string, payload: unknown): void;
}

export interface LogContext {
  [key: string]: unknown;
}
