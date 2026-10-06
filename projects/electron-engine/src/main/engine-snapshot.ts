import {
  EngineSnapshotSchema,
  type EngineSnapshot,
  type RuntimeSnapshot,
} from "../shared/contracts";
import type { ExperienceConfig } from "../shared/experience-config";
import {
  createInitialSystemCheckResults,
  updateSystemCheckResult,
  type SystemCheckEvidence,
  type SystemCheckId,
  type SystemCheckResult,
  type SystemCheckResults,
} from "../shared/system-check";
import {
  activeDeviceProfile,
  type AppSettings,
  type DisplayDescriptor,
  type HidState,
  type SystemCheckItem,
  type SystemCheckSnapshot,
} from "./types";

const SHARED_CHECK_ID: Readonly<Record<SystemCheckItem["id"], SystemCheckId>> = {
  power: "acPower",
  display: "audienceDisplay",
  content: "contentConfig",
  microphonePermission: "microphonePermission",
  microphoneDevice: "microphoneDevice",
  microphoneSignal: "microphoneSignal",
  redButton: "recordButton",
  whiteButton: "choiceButton",
  audioOutput: "audioOutput",
  videoEngine: "videoEngine",
  storage: "storage",
  inputMonitoring: "inputMonitoring",
};

export interface EngineMediaTelemetry {
  sessionId: string | null;
  stateRevision: number;
  status: EngineSnapshot["media"]["status"];
  currentTimeMs: number;
  durationMs: number | null;
  error: string | null;
}

export interface EngineRecordingTelemetry {
  sessionId: string | null;
  durationMs: number | null;
  inputLevel: number | null;
  hasAudio: boolean;
}

export interface ComposeEngineSnapshotInput {
  runtime: RuntimeSnapshot;
  configuration: ExperienceConfig;
  systemCheck: SystemCheckSnapshot;
  settings: AppSettings;
  displays: DisplayDescriptor[];
  sceneTestActive: boolean;
  hidState?: HidState;
  contentWarning?: string;
  mediaTelemetry?: EngineMediaTelemetry | null;
  recordingTelemetry?: EngineRecordingTelemetry | null;
}

function evidenceFor(check: SystemCheckItem): SystemCheckEvidence {
  if (check.status === "SIMULATED") return "SIMULATED";
  if (check.status === "NOT_TESTED") return "NONE";
  if (check.id === "redButton" || check.id === "whiteButton") return "PHYSICAL_INPUT";
  if (check.id === "audioOutput") return "OPERATOR_CONFIRMED";
  return "AUTOMATED";
}

function sharedStatus(check: SystemCheckItem): SystemCheckResult["status"] {
  switch (check.status) {
    case "PASS": return "pass";
    case "FAIL": return "fail";
    case "WARNING": return "warning";
    case "SIMULATED": return "simulated";
    case "NOT_TESTED": return "untested";
  }
}

export function engineSystemChecks(snapshot: SystemCheckSnapshot): SystemCheckResults {
  let results = createInitialSystemCheckResults();
  for (const check of snapshot.items) {
    results = updateSystemCheckResult(results, {
      id: SHARED_CHECK_ID[check.id],
      status: sharedStatus(check),
      evidence: evidenceFor(check),
      summary: check.detail,
      updatedAtMs: check.checkedAt,
    });
  }
  return results;
}

function deviceStatus(check: SystemCheckResult): EngineSnapshot["devices"]["microphone"]["status"] {
  switch (check.status) {
    case "pass": return "ready";
    case "warning": return "warning";
    case "fail": return "error";
    case "simulated": return "simulated";
    case "running":
    case "untested":
      return "untested";
  }
}

function device(
  check: SystemCheckResult,
  id: string | null,
  label: string | null,
): EngineSnapshot["devices"]["microphone"] {
  return {
    status: deviceStatus(check),
    id,
    label,
    detail: check.summary,
    lastSeenAtMs: check.updatedAtMs > 0 ? check.updatedAtMs : null,
  };
}

function publicReadiness(runtime: RuntimeSnapshot): EngineSnapshot["readiness"] {
  if (runtime.status === "FAULTED") return "faulted";
  if (runtime.status === "CHECKING") return "checking";
  return runtime.systemReadiness === "READY" ? "ready" : "degraded";
}

function publicRunMode(runtime: RuntimeSnapshot): EngineSnapshot["runMode"] {
  if (runtime.runMode === "RUNNING") return "running";
  if (runtime.runMode === "PAUSED") return "paused";
  return "stopped";
}

export function composeEngineSnapshot(input: ComposeEngineSnapshotInput): EngineSnapshot {
  const { configuration, runtime, settings, systemCheck } = input;
  const profile = activeDeviceProfile(settings);
  const scene = configuration.states.find((candidate) => candidate.id === runtime.state);
  if (!scene) throw new Error(`Runtime state ${runtime.state} is absent from the active configuration`);

  const checks = engineSystemChecks(systemCheck);
  const selectedDisplay = input.displays.find((display) => display.id === profile.audienceDisplayId) ??
    input.displays.find((display) => !display.primary) ??
    input.displays.find((display) => display.primary) ??
    null;
  const candidateMediaTelemetry = input.mediaTelemetry;
  const mediaTelemetry = candidateMediaTelemetry !== null && candidateMediaTelemetry !== undefined &&
    candidateMediaTelemetry.sessionId === runtime.sessionId &&
    candidateMediaTelemetry.stateRevision === runtime.stateRevision
    ? candidateMediaTelemetry
    : null;
  const configuredDurationMs = scene.durationMs ?? null;
  const mediaDurationMs = mediaTelemetry?.durationMs ?? configuredDurationMs;
  const mediaStatus = mediaTelemetry === null
    ? "idle"
    : runtime.runMode === "PAUSED" && mediaTelemetry.status === "playing"
      ? "paused"
      : mediaTelemetry.status;
  const candidateRecordingTelemetry = input.recordingTelemetry;
  const recordingTelemetry = candidateRecordingTelemetry !== null && candidateRecordingTelemetry !== undefined &&
    candidateRecordingTelemetry.sessionId === runtime.sessionId
    ? candidateRecordingTelemetry
    : null;

  const warnings: EngineSnapshot["warnings"] = Object.values(checks)
    .filter((check) => check.status === "warning" || check.status === "fail")
    .map((check) => ({
      code: `SYSTEM_CHECK_${check.id.toUpperCase()}`,
      message: check.summary,
      sinceMs: check.updatedAtMs,
    }));
  if (input.contentWarning) {
    warnings.push({
      code: "CONTENT_LAST_KNOWN_GOOD",
      message: input.contentWarning,
      sinceMs: runtime.stateEnteredAtMs,
    });
  }
  if (mediaTelemetry?.error) {
    warnings.push({
      code: "AUDIENCE_MEDIA_ERROR",
      message: mediaTelemetry.error,
      sinceMs: runtime.stateEnteredAtMs,
    });
  }

  const mediaPath = "media" in scene && scene.media !== undefined ? scene.media : null;
  const hidState = input.hidState ?? {
    access: "unknown" as const,
    helperAvailable: false,
    devices: [],
    bindings: { RECORD_BUTTON: null, CHOICE_BUTTON: null },
    learn: null,
    lastInput: null,
    error: null,
  };
  return EngineSnapshotSchema.parse({
    state: runtime.state,
    status: runtime.status,
    readiness: publicReadiness(runtime),
    readinessByMode: {
      production: systemCheck.productionReady ? "ready" : "degraded",
      test: systemCheck.testReady ? "ready" : "degraded",
    },
    runMode: publicRunMode(runtime),
    sessionId: runtime.sessionId,
    stateRevision: runtime.stateRevision,
    stateEnteredAtMs: runtime.stateEnteredAtMs,
    scene: {
      id: scene.id,
      kind: scene.kind,
      title: scene.placeholder.title,
      media: mediaPath,
      loop: scene.loop,
    },
    media: {
      status: mediaStatus,
      currentTimeMs: mediaTelemetry?.currentTimeMs ?? 0,
      durationMs: mediaDurationMs,
      progress: mediaTelemetry !== null && mediaDurationMs !== null && mediaDurationMs > 0
        ? Math.max(0, Math.min(1, mediaTelemetry.currentTimeMs / mediaDurationMs))
        : null,
    },
    recording: {
      status: runtime.recording,
      durationMs: recordingTelemetry?.durationMs ?? null,
      inputLevel: recordingTelemetry?.inputLevel ?? null,
      hasAudio: recordingTelemetry?.hasAudio ?? runtime.recording === "CAPTURED",
    },
    devices: {
      audienceDisplay: device(
        checks.audienceDisplay,
        selectedDisplay?.id ?? null,
        selectedDisplay?.label ?? null,
      ),
      microphone: device(
        checks.microphoneDevice,
        profile.microphoneDeviceId,
        profile.microphoneDeviceLabel,
      ),
      audioOutput: device(
        checks.audioOutput,
        profile.audioOutputDeviceId,
        profile.audioOutputDeviceId === null ? "System default output" : "Selected audio output",
      ),
      recordButton: device(checks.recordButton, "RECORD_BUTTON", "Red record button"),
      choiceButton: device(checks.choiceButton, "CHOICE_BUTTON", "White choice button"),
    },
    inputs: {
      access: hidState.access,
      helperAvailable: hidState.helperAvailable,
      devices: hidState.devices,
      bindings: hidState.bindings,
      lastAcceptedInput: hidState.lastInput?.accepted === true ? hidState.lastInput : null,
      error: hidState.error,
    },
    checks,
    mode: {
      operation: settings.operationMode,
      developer: settings.developerMode,
      simulation: settings.operationMode === "test" || systemCheck.simulationOverride,
      sceneTest: input.sceneTestActive,
      singleDisplayFallback: !input.displays.some((display) => !display.primary),
    },
    warnings,
    lastTransition: runtime.lastTransition,
    error: runtime.error,
  });
}
