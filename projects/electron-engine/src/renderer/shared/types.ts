export type RequiredExperienceState =
  | "BOOT"
  | "SYSTEM_CHECK"
  | "IDLE"
  | "MEMORY_INTRO"
  | "WAITING_FOR_RECORD"
  | "RECORDING"
  | "DREAM"
  | "PRESSURE"
  | "NARROWING"
  | "FINAL_PROMPT"
  | "WAITING_FOR_CHOICE"
  | "RELIGHT"
  | "END"
  | "RESETTING";

/** Validated content may insert additional passive UPPER_SNAKE_CASE states. */
export type ExperienceState = RequiredExperienceState | (string & {});

export type Readiness = "checking" | "ready" | "degraded" | "faulted";
export type RunMode = "idle" | "running" | "paused" | "resetting";
export type OperationMode = "production" | "test";
export type ProductionInputRole = "RECORD_BUTTON" | "CHOICE_BUTTON";
export type InputSource = "NATIVE_HID" | "TEST_KEYBOARD" | "SIMULATION";
export type HidAccessStatus = "unknown" | "granted" | "denied" | "restartRequired";
export type HidIdentityQuality = "serial" | "physical" | "port" | "session";
export type TestSpeed = 1 | 2 | 4;
export type CheckStatus =
  | "not-tested"
  | "checking"
  | "passed"
  | "failed"
  | "simulated"
  | "warning"
  | "unavailable";

export type RecordingStatus =
  | "none"
  | "arming"
  | "armed"
  | "recording"
  | "captured"
  | "error";

export interface HealthItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  required: boolean;
  checkedAt?: string;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error";
  message: string;
}

export interface DisplayOption {
  id: string;
  label: string;
  resolution: string;
  isPrimary: boolean;
  isAvailable: boolean;
}

export interface AudioDeviceOption {
  id: string;
  label: string;
  isDefault: boolean;
  isAvailable: boolean;
}

export interface HidDeviceOption {
  id: string;
  label: string;
  manufacturer?: string;
  connected: boolean;
  assignable: boolean;
  reason?: string;
  identityQuality: HidIdentityQuality;
  locationBound?: boolean;
  internal?: boolean;
}

export interface HidBinding {
  role: ProductionInputRole;
  deviceId: string;
  deviceLabel: string;
  elementLabel: string;
  connected: boolean;
  identityQuality: HidIdentityQuality;
  locationBound?: boolean;
  lastSeenAt?: string;
}

export interface HidLearnSession {
  token: string;
  role: ProductionInputRole;
  phase: "waiting" | "firstPress" | "ready" | "error";
  pressCount: 0 | 1 | 2;
  candidateLabel?: string;
  message?: string;
}

export interface LastInput {
  source: InputSource;
  action: string;
  accepted: boolean;
  occurredAt: string;
  detail?: string;
}

export interface HidState {
  access: HidAccessStatus;
  helperAvailable: boolean;
  devices: HidDeviceOption[];
  bindings: Record<ProductionInputRole, HidBinding | null>;
  learn: HidLearnSession | null;
  lastInput: LastInput | null;
}

export interface AudioBusLevels {
  master: number;
  film: number;
  narration: number;
  ambience: number;
  sfx: number;
  visitorVoice: number;
}

export interface OperatorSettings {
  operationMode: OperationMode;
  production: {
    audienceDisplayId: string;
    audienceFullscreen: boolean;
    microphoneDeviceId: string;
    audioOutputDeviceId: string;
  };
  test: {
    audienceDisplayId: string;
    audienceFullscreen: boolean;
    microphoneDeviceId: string;
    audioOutputDeviceId: string;
    speed: TestSpeed;
  };
  audio: AudioBusLevels;
  recordingDurationMs: number;
  endHoldMs: number;
  visitorWaitTimeoutMs: number | null;
  developerMode: boolean;
  /** Compatibility signal for the original V1 bridge; Test is always explicit in the UI. */
  simulationMode: boolean;
}

export interface SceneSummary {
  id: ExperienceState;
  label: string;
  sequence: string;
  durationMs: number | null;
  hasMedia: boolean;
  mediaLabel: string;
  developmentOnly?: boolean;
}

export interface SessionSummary {
  id: string | null;
  startedAt: string | null;
  elapsedMs: number;
}

export interface OperatorSnapshot {
  revision: number;
  appVersion: string;
  readiness: Readiness;
  canStart: boolean;
  runMode: RunMode;
  experienceState: ExperienceState;
  currentSceneLabel: string;
  currentSceneFile: string;
  playbackMs: number;
  playbackDurationMs: number;
  mediaReady: boolean;
  droppedVideoFrames: number;
  totalVideoFrames: number;
  mediaError: string | null;
  recordingStatus: RecordingStatus;
  microphoneLevel: number;
  operationMode: OperationMode;
  modeReadiness: Record<OperationMode, Readiness>;
  simulationMode: boolean;
  developerMode: boolean;
  audienceDisplayLabel: string;
  audioOutputLabel: string;
  contentPackLabel: string;
  contentValidation: { valid: boolean | null; issues: string[] };
  developmentMediaUrl: string | null;
  session: SessionSummary;
  health: HealthItem[];
  recentActivity: ActivityItem[];
  displays: DisplayOption[];
  microphones: AudioDeviceOption[];
  audioOutputs: AudioDeviceOption[];
  hid: HidState;
  scenes: SceneSummary[];
  settings: OperatorSettings;
}

export type OperatorCommand =
  | { type: "experience.start" }
  | { type: "experience.pause" }
  | { type: "experience.resume" }
  | { type: "experience.returnToIdle" }
  | { type: "experience.reset" }
  | { type: "experience.emergencyReset" }
  | { type: "experience.restartScene" }
  | { type: "experience.skipScene" }
  | { type: "systemCheck.runAll" }
  | { type: "systemCheck.run"; checkId: string }
  | { type: "sceneTester.play"; sceneId: string; loop: boolean }
  | { type: "sceneTester.stop" }
  | { type: "sceneTester.fullscreen" }
  | { type: "sceneTester.testRecording" }
  | { type: "sceneTester.chooseDevelopmentVideo" }
  | { type: "mode.set"; mode: OperationMode }
  | { type: "hid.refresh" }
  | { type: "hid.requestAccess" }
  | { type: "hid.openSettings" }
  | { type: "hid.learn.begin"; role: ProductionInputRole }
  | { type: "hid.learn.cancel"; token: string }
  | { type: "hid.learn.confirm"; token: string }
  | { type: "hid.binding.forget"; role: ProductionInputRole }
  | {
      type: "test.keyboard";
      code: "Space" | "KeyR" | "KeyW" | "ArrowLeft" | "ArrowRight";
      phase: "down" | "up";
      repeat: boolean;
      alt: boolean;
      interactive: boolean;
    }
  | { type: "test.transport"; action: "startOrToggle" | "previousScene" | "nextScene" | "restartScene" }
  | { type: "test.speed.set"; speed: TestSpeed }
  | { type: "settings.patch"; patch: Partial<OperatorSettings> }
  | { type: "diagnostics.exportLogs" }
  | { type: "diagnostics.openAudience" }
  | { type: "content.openFolder" }
  | { type: "content.chooseFolder" }
  | { type: "content.validate" }
  | { type: "content.reload" }
  | { type: "content.restoreLastKnownGood" }
  | { type: "diagnostics.reloadContent" }
  | { type: "input.simulate"; input: "RECORD_BUTTON" | "CHOICE_BUTTON" };

export interface CommandResult {
  ok: boolean;
  message: string;
}

export interface OperatorBridge {
  getSnapshot: () => Promise<OperatorSnapshot>;
  subscribe: (listener: (snapshot: OperatorSnapshot) => void) => () => void;
  dispatch: (command: OperatorCommand) => Promise<CommandResult>;
}

export type TimelineAction =
  | { id: string; atMs: number; action: "transition"; target: ExperienceState }
  | {
      id: string;
      atMs: number;
      action: "playVisitorVoice";
      preset: VoiceEffectName;
    }
  | { id: string; atMs: number; action: "operatorNotification"; message: string }
  | { id: string; atMs: number; action: "showText"; text: string }
  | { id: string; atMs: number; action: "hideText" }
  | { id: string; atMs: number; action: "playSound"; assetUrl: string; bus: Exclude<keyof AudioBusLevels, "master">; gain: number }
  | { id: string; atMs: number; action: "stopSound"; soundId: string }
  | { id: string; atMs: number; action: "changeVolume"; bus: keyof AudioBusLevels; value: number }
  | { id: string; atMs: number; action: "fadeAudio"; bus: keyof AudioBusLevels; value: number; durationMs: number }
  | { id: string; atMs: number; action: "setVoiceEffect"; preset: VoiceEffectName }
  | { id: string; atMs: number; action: "emitEvent"; name: string };

export interface AudienceScene {
  id: ExperienceState;
  sequence: string;
  title: string;
  subtitle: string;
  purpose: string;
  privacyNotice: string;
  kind: "system" | "wait" | "passive" | "recordGate" | "recording" | "choiceGate";
  loop: boolean;
  durationMs: number | null;
  mediaUrl: string | null;
  nextMediaUrl: string | null;
  developerMediaUrl: string | null;
  transitionMs: number;
  tone: string;
  timeline: TimelineAction[];
}

export interface VoiceEffectPreset {
  safetyGain?: number;
  lowPassHz?: number;
  startHz?: number;
  endHz?: number;
  delayMs?: number;
  feedback?: number;
  reverbWet?: number;
  distortion?: number;
  durationMs?: number;
}

export type VoiceEffectName = "clean" | "memoryEcho" | "memoryDecay" | "darkVoice";

export interface MediaRequest {
  id: string;
  type: "mic.arm" | "mic.test" | "mic.stop" | "recording.stop" | "recording.discard" | "audio.test" | "media.cleanup";
  sessionId: string | null;
  stateRevision: number;
  durationMs?: number;
  microphoneDeviceId?: string;
}

export interface AudienceDirective {
  revision: number;
  verificationMode: boolean;
  operationMode: OperationMode;
  testSpeed: TestSpeed;
  runMode: RunMode;
  readiness: Readiness;
  developerMode: boolean;
  showDiagnostics: boolean;
  selectedMicrophoneId: string;
  selectedAudioOutputId: string;
  recordingDurationMs: number;
  audio: AudioBusLevels;
  voiceEffects: Record<VoiceEffectName, VoiceEffectPreset>;
  scene: AudienceScene;
  /**
   * Ordered, identity-bearing work that the audience has not acknowledged yet.
   * Destructive requests intentionally survive a following ENTER_STATE update.
   */
  mediaRequests: readonly MediaRequest[];
}

export type AudienceReport =
  | { type: "audience.ready"; revision: number }
  | { type: "media.ready"; revision: number; sceneId: ExperienceState; durationMs: number }
  | { type: "media.ended"; revision: number; sceneId: ExperienceState }
  | { type: "media.error"; revision: number; sceneId: ExperienceState; message: string }
  | { type: "audio.error"; revision: number; message: string }
  | {
      type: "media.progress";
      revision: number;
      sceneId: ExperienceState;
      elapsedMs: number;
      durationMs: number;
      seeking?: boolean;
      droppedVideoFrames?: number;
      totalVideoFrames?: number;
    }
  | { type: "timeline.action"; revision: number; action: TimelineAction }
  | { type: "recording.armed"; revision: number; deviceLabel: string; deviceId: string }
  | { type: "recording.started"; revision: number }
  | { type: "recording.completed"; revision: number; durationMs: number; mimeType: string }
  | { type: "recording.failed"; revision: number; message: string }
  | { type: "microphone.level"; revision: number; level: number; deviceId: string }
  | {
      type: "mediaRequest.completed";
      revision: number;
      requestId: string;
      requestType: MediaRequest["type"];
      message: string;
    }
  | {
      type: "mediaRequest.failed";
      revision: number;
      requestId: string;
      requestType: MediaRequest["type"];
      microphoneDeviceId?: string;
      message: string;
    };

export interface AudienceBridge {
  getDirective: () => Promise<AudienceDirective>;
  subscribe: (listener: (directive: AudienceDirective) => void) => () => void;
  report: (event: AudienceReport) => Promise<void>;
}

export interface RelightBridge {
  operator?: OperatorBridge;
  audience?: AudienceBridge;
}
