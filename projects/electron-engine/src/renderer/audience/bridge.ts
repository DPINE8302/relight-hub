import type { AppSettings, MediaDeviceCatalog, MediaDeviceOptionDescriptor, RuntimeHealthReport } from "../../main/types";
import type { AudienceCommandMessage, AudienceRuntimeEvent, RuntimeSnapshot } from "../../shared/contracts";
import type { ExperienceConfig, ExperienceState as ConfigState, TimelineAction as ConfigTimelineAction } from "../../shared/experience-config";
import type {
  AudienceBridge,
  AudienceDirective,
  AudienceReport,
  AudienceScene,
  ExperienceState,
  MediaRequest,
  TimelineAction,
} from "../shared/types";

const fallbackDirective: AudienceDirective = {
  revision: 0,
  verificationMode: false,
  operationMode: "test",
  testSpeed: 4,
  runMode: "idle",
  readiness: "faulted",
  developerMode: false,
  showDiagnostics: false,
  selectedMicrophoneId: "",
  selectedAudioOutputId: "",
  recordingDurationMs: 6000,
  audio: { master: 0.85, film: 0.8, narration: 0.85, ambience: 0.65, sfx: 0.7, visitorVoice: 0.9 },
  voiceEffects: {
    clean: { safetyGain: 0.9 },
    memoryEcho: { lowPassHz: 5200, delayMs: 280, feedback: 0.22, reverbWet: 0.18 },
    memoryDecay: { startHz: 12_000, endHz: 900, delayMs: 320, feedback: 0.36, reverbWet: 0.35, durationMs: 10_000 },
    darkVoice: { lowPassHz: 2400, delayMs: 210, feedback: 0.18, distortion: 0.16 },
  },
  scene: {
    id: "IDLE",
    sequence: "",
    title: "RE:LIGHT",
    subtitle: "พรุ่งนี้ดีได้ เพราะฉันเลือกเอง",
    purpose: "",
    privacyNotice: "",
    kind: "wait",
    loop: true,
    durationMs: null,
    mediaUrl: null,
    nextMediaUrl: null,
    developerMediaUrl: null,
    transitionMs: 0,
    tone: "#000000",
    timeline: [],
  },
  mediaRequests: [],
};

const MAX_PENDING_MEDIA_REQUESTS = 16;

function deviceOption(
  device: MediaDeviceInfo,
  fallback: string,
): MediaDeviceOptionDescriptor | null {
  const id = device.deviceId.trim();
  if (id.length === 0 || id.length > 1_024 || id === "default" || id === "communications") return null;
  const cleanLabel = [...device.label]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127 ? character : " ";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 256);
  return {
    id,
    label: cleanLabel || fallback,
    isDefault: false,
  };
}

function uniqueDevices(devices: MediaDeviceOptionDescriptor[]): MediaDeviceOptionDescriptor[] {
  return [...new Map(devices.map((device) => [device.id, device])).values()];
}

/** Coalesces bursts while guaranteeing one trailing run sees the latest mode. */
export class MediaCatalogRefreshQueue {
  private inFlight: Promise<void> | null = null;
  private trailingRequested = false;

  constructor(private readonly refresh: () => Promise<void>) {}

  run(): Promise<void> {
    if (this.inFlight !== null) {
      this.trailingRequested = true;
      return this.inFlight;
    }
    this.inFlight = (async () => {
      do {
        this.trailingRequested = false;
        await this.refresh();
      } while (this.trailingRequested);
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}

export function isDestructiveMediaRequest(request: MediaRequest): boolean {
  return request.type === "recording.stop" ||
    request.type === "recording.discard" ||
    request.type === "media.cleanup";
}

export interface ImmediateMediaRuntime {
  stopRecording(): void;
  cleanupRecording(): void;
  cleanupAudio(): void;
}

export function mediaRequestDeviceDomain(
  type: MediaRequest["type"],
): "microphone" | "audioOutput" | null {
  if (type === "mic.arm" || type === "mic.test") return "microphone";
  if (type === "audio.test") return "audioOutput";
  return null;
}

/** Returns the operator-facing completion text for synchronous requests. */
export function runImmediateMediaRequest(
  request: MediaRequest,
  runtime: ImmediateMediaRuntime,
): string | null {
  switch (request.type) {
    case "mic.stop":
      runtime.cleanupRecording();
      return "Microphone stopped.";
    case "recording.stop":
      runtime.stopRecording();
      return "Recording stop requested.";
    case "recording.discard":
      runtime.cleanupRecording();
      runtime.cleanupAudio();
      return "Participant recording discarded.";
    case "media.cleanup":
      runtime.cleanupRecording();
      runtime.cleanupAudio();
      return "Session media cleared.";
    case "mic.arm":
    case "mic.test":
    case "audio.test":
      return null;
  }
}

function sameRequestIdentity(
  left: Pick<MediaRequest, "sessionId" | "stateRevision">,
  right: Pick<MediaRequest, "sessionId" | "stateRevision">,
): boolean {
  return left.sessionId === right.sessionId && left.stateRevision === right.stateRevision;
}

/**
 * Small acknowledged queue for one-shot audience work. The state machine can
 * issue STOP + DISPOSE + ENTER synchronously; keeping those requests separate
 * from the scene directive prevents ENTER (or its following snapshot) from
 * overwriting privacy-critical cleanup.
 */
export class AudienceMediaRequestQueue {
  private pending: MediaRequest[] = [];

  get values(): readonly MediaRequest[] {
    return [...this.pending];
  }

  enqueue(request: MediaRequest): void {
    if (this.pending.some((candidate) => candidate.id === request.id)) return;

    if (request.type === "media.cleanup") {
      // Full cleanup subsumes every older request, including a pending guided
      // device check. Keeping only the newest reset also bounds emergency-reset
      // retries while the audience renderer is recovering.
      this.pending = [];
    } else if (request.type === "recording.discard") {
      // Preserve the matching STOP immediately before DISPOSE, but discard any
      // stale guided check so participant data cleanup cannot wait behind it.
      this.pending = this.pending.filter((candidate) =>
        candidate.type === "recording.stop" && sameRequestIdentity(candidate, request));
    }

    this.pending.push(request);
    this.compact();
  }

  applyCommand(command: AudienceCommandMessage): void {
    switch (command.command) {
      case "SYNC_RUNTIME":
        this.synchronizeIdentity(command.sessionId, command.stateRevision);
        return;
      case "ENTER_STATE":
      case "SET_RUN_MODE":
      case "START_RECORDING":
        this.synchronizeIdentity(command.sessionId, command.stateRevision);
        return;
      case "STOP_RECORDING":
        this.enqueue({
          id: `stop-${command.sessionId}-${command.stateRevision}-${command.reason}`,
          type: "recording.stop",
          sessionId: command.sessionId,
          stateRevision: command.stateRevision,
        });
        return;
      case "DISPOSE_RECORDING":
        this.enqueue({
          id: `discard-${command.sessionId ?? "idle"}-${command.stateRevision}`,
          type: "recording.discard",
          sessionId: command.sessionId,
          stateRevision: command.stateRevision,
        });
        return;
      case "RESET":
        this.enqueue({
          id: `reset-${command.stateRevision}-${command.emergency ? "emergency" : "normal"}`,
          type: "media.cleanup",
          sessionId: command.sessionId,
          stateRevision: command.stateRevision,
        });
        return;
      default:
        return;
    }
  }

  synchronizeIdentity(sessionId: string | null, stateRevision: number): void {
    this.pending = this.pending.filter((request) =>
      isDestructiveMediaRequest(request) ||
      (request.sessionId === sessionId && request.stateRevision === stateRevision));
  }

  acknowledge(requestId: string): boolean {
    const index = this.pending.findIndex((request) => request.id === requestId);
    if (index < 0) return false;
    this.pending.splice(index, 1);
    return true;
  }

  private compact(): void {
    while (this.pending.length > MAX_PENDING_MEDIA_REQUESTS) {
      const disposableIndex = this.pending.findIndex((request) => !isDestructiveMediaRequest(request));
      this.pending.splice(disposableIndex < 0 ? 0 : disposableIndex, 1);
    }
  }
}

function stateId(value: string): ExperienceState {
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? (value as ExperienceState) : "IDLE";
}

function localMediaUrl(mediaBaseUrl: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${mediaBaseUrl.replace(/\/$/, "")}/${encoded}`;
}

function timeline(state: ConfigState, mediaBaseUrl: string): TimelineAction[] {
  return state.timeline.flatMap((action: ConfigTimelineAction, index): TimelineAction[] => {
    const id = `${state.id}:${index}:${action.action}`;
    if (action.action === "transition") return [{ id, atMs: action.atMs, action: "transition", target: stateId(action.target) }];
    if (action.action === "playVisitorVoice") return [{ id, atMs: action.atMs, action: "playVisitorVoice", preset: action.preset }];
    if (action.action === "operatorNotification") return [{ id, atMs: action.atMs, action: "operatorNotification", message: action.message }];
    if (action.action === "showText") return [{ id, atMs: action.atMs, action: "showText", text: action.text }];
    if (action.action === "hideText") return [{ id, atMs: action.atMs, action: "hideText" }];
    if (action.action === "playSound") return [{ id, atMs: action.atMs, action: "playSound", assetUrl: localMediaUrl(mediaBaseUrl, action.asset), bus: action.bus, gain: action.gain ?? 1 }];
    if (action.action === "stopSound") return [{ id, atMs: action.atMs, action: "stopSound", soundId: action.soundId }];
    if (action.action === "changeVolume") return [{ id, atMs: action.atMs, action: "changeVolume", bus: action.bus, value: action.value }];
    if (action.action === "fadeAudio") return [{ id, atMs: action.atMs, action: "fadeAudio", bus: action.bus, value: action.value, durationMs: action.durationMs }];
    if (action.action === "setVoiceEffect") return [{ id, atMs: action.atMs, action: "setVoiceEffect", preset: action.preset }];
    if (action.action === "emitEvent") return [{ id, atMs: action.atMs, action: "emitEvent", name: action.name }];
    return [];
  });
}

function audienceScene(config: ExperienceConfig, state: ConfigState, mediaBaseUrl: string): AudienceScene {
  const id = stateId(state.id);
  const index = config.states.findIndex((entry) => entry.id === state.id);
  let title = state.placeholder.title;
  let subtitle = "";
  let purpose = "";
  if (id === "IDLE") {
    title = config.audience.idleTitle;
    subtitle = config.audience.idleSubtitle;
  } else if (id === "WAITING_FOR_RECORD") {
    title = config.audience.recordPrompt;
    purpose = config.audience.recordPurpose;
  } else if (id === "WAITING_FOR_CHOICE") {
    title = config.audience.choicePrompt;
    purpose = config.audience.choicePurpose;
  }
  const mediaUrlFor = (candidate: ConfigState | undefined, includeDevelopment = false): string | null => {
    const candidateMedia = candidate && "media" in candidate ? candidate.media : undefined;
    if (!candidateMedia) return null;
    if (!includeDevelopment && (candidateMedia === "scene01.mp4" || candidateMedia === "media/scene01.mp4")) return null;
    const encoded = candidateMedia.split("/").map(encodeURIComponent).join("/");
    return `${mediaBaseUrl.replace(/\/$/, "")}/${encoded}`;
  };
  const media = "media" in state ? state.media : undefined;
  const videoUrl = mediaUrlFor(state, true);
  const nextState = config.states.find((entry) => entry.id === state.next);
  const isDevelopmentMedia = media === "scene01.mp4" || media === "media/scene01.mp4";
  return {
    id,
    sequence: index >= 0 ? String(index).padStart(3, "0") : "",
    title,
    subtitle,
    purpose,
    privacyNotice: config.audience.privacyNotice,
    kind: state.kind,
    loop: state.loop,
    durationMs: state.durationMs ?? null,
    mediaUrl: isDevelopmentMedia ? null : videoUrl,
    nextMediaUrl: mediaUrlFor(nextState),
    developerMediaUrl: isDevelopmentMedia ? videoUrl : null,
    transitionMs: state.crossfadeMs ?? 0,
    tone: state.placeholder.tone,
    timeline: timeline(state, mediaBaseUrl),
  };
}

class ElectronAudienceAdapter implements AudienceBridge {
  private snapshot: RuntimeSnapshot | null = null;
  private settings: AppSettings | null = null;
  private content: ExperienceConfig | null = null;
  private mediaBaseUrl = "relight-media://content/";
  private verificationMode = false;
  private recordingDurationMs = 6000;
  private readonly mediaRequests = new AudienceMediaRequestQueue();
  private readonly healthByMode: Record<AppSettings["operationMode"], RuntimeHealthReport> = {
    production: {
      operationMode: "production",
      microphoneSignal: "NOT_TESTED",
      audioOutput: "NOT_TESTED",
      videoEngine: "NOT_TESTED",
    },
    test: {
      operationMode: "test",
      microphoneSignal: "NOT_TESTED",
      audioOutput: "NOT_TESTED",
      videoEngine: "NOT_TESTED",
    },
  };
  private readonly listeners = new Set<(directive: AudienceDirective) => void>();
  private readonly identities = new Map<number, { sessionId: string | null; state: ExperienceState }>();
  private unsubscribeSnapshot: (() => void) | null = null;
  private unsubscribeCommand: (() => void) | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private unsubscribeMediaCheck: (() => void) | null = null;
  private unsubscribeMediaRefresh: (() => void) | null = null;
  private readonly mediaRefresh = new MediaCatalogRefreshQueue(() => this.enumerateAndPublishMediaDevices());
  private readonly handleDeviceChange = (): void => {
    void this.publishMediaDeviceCatalog();
  };

  async getDirective(): Promise<AudienceDirective> {
    const bridge = window.relightAudience;
    if (!bridge) return fallbackDirective;
    const bootstrap = await bridge.getBootstrap();
    this.snapshot = bootstrap.snapshot;
    this.settings = bootstrap.settings as AppSettings;
    this.content = bootstrap.content as ExperienceConfig;
    this.recordingDurationMs = this.content.experience.recordingDurationMs;
    this.mediaBaseUrl = bootstrap.mediaBaseUrl;
    this.verificationMode = bootstrap.verificationMode;
    void this.publishMediaDeviceCatalog();
    return this.build();
  }

  subscribe(listener: (directive: AudienceDirective) => void): () => void {
    this.listeners.add(listener);
    this.install();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.remove();
    };
  }

  async report(event: AudienceReport): Promise<void> {
    if ((event.type === "mediaRequest.completed" || event.type === "mediaRequest.failed") &&
      this.mediaRequests.acknowledge(event.requestId)) {
      // Remove acknowledged work before crossing IPC. The listener update is
      // synchronous, so React can advance to the next ordered request without
      // waiting on main-process telemetry.
      this.emit();
    }
    const bridge = window.relightAudience;
    if (!bridge) return;
    const mapped = this.mapReport(event);
    if (mapped) await bridge.reportRuntimeEvent(mapped);
    const health = this.mapHealth(event);
    if (health) await bridge.updateRuntimeHealth(health);
  }

  private install(): void {
    const bridge = window.relightAudience;
    if (!bridge || this.unsubscribeSnapshot) return;
    this.unsubscribeSnapshot = bridge.onSnapshot((snapshot) => {
      this.snapshot = snapshot;
      this.mediaRequests.synchronizeIdentity(snapshot.sessionId, snapshot.stateRevision);
      this.emit();
    });
    this.unsubscribeCommand = bridge.onCommand((raw) => {
      this.handleCommand(raw);
      this.emit();
    });
    this.unsubscribeSettings = bridge.onSettings((settings) => {
      this.settings = settings;
      this.emit();
      void this.publishMediaDeviceCatalog();
    });
    this.unsubscribeMediaCheck = bridge.onMediaCheck((request) => {
      if (
        this.snapshot?.stateRevision !== request.stateRevision ||
        this.snapshot.sessionId !== request.sessionId
      ) return;
      this.mediaRequests.enqueue({
        id: request.id,
        type: request.type,
        sessionId: request.sessionId,
        stateRevision: request.stateRevision,
        ...(request.durationMs === undefined ? {} : { durationMs: request.durationMs }),
        ...(request.microphoneDeviceId === undefined ? {} : { microphoneDeviceId: request.microphoneDeviceId }),
      });
      this.emit();
    });
    this.unsubscribeMediaRefresh = bridge.onRefreshMediaDevices(() => {
      void this.publishMediaDeviceCatalog();
    });
    navigator.mediaDevices?.addEventListener("devicechange", this.handleDeviceChange);
  }

  private remove(): void {
    this.unsubscribeSnapshot?.();
    this.unsubscribeCommand?.();
    this.unsubscribeSettings?.();
    this.unsubscribeMediaCheck?.();
    this.unsubscribeMediaRefresh?.();
    this.unsubscribeSnapshot = null;
    this.unsubscribeCommand = null;
    this.unsubscribeSettings = null;
    this.unsubscribeMediaCheck = null;
    this.unsubscribeMediaRefresh = null;
    navigator.mediaDevices?.removeEventListener("devicechange", this.handleDeviceChange);
  }

  private publishMediaDeviceCatalog(): Promise<void> {
    return this.mediaRefresh.run();
  }

  private async enumerateAndPublishMediaDevices(): Promise<void> {
    const bridge = window.relightAudience;
    const operationMode = this.settings?.operationMode;
    if (!bridge || !operationMode || !navigator.mediaDevices) return;
    let devices: MediaDeviceInfo[] = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      // Report an observed empty catalog. Main will keep readiness blocked and
      // the operator will receive an actionable unavailable-device state.
    }
    const audioInputs = uniqueDevices(devices.flatMap((device, index) => {
      if (device.kind !== "audioinput") return [];
      const option = deviceOption(device, `Microphone ${index + 1}`);
      return option === null ? [] : [option];
    }));
    const supportsSinkSelection = typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
    const audioOutputs = supportsSinkSelection
      ? uniqueDevices(devices.flatMap((device, index) => {
        if (device.kind !== "audiooutput") return [];
        const option = deviceOption(device, `Audio output ${index + 1}`);
        return option === null ? [] : [option];
      }))
      : [];
    const catalog: MediaDeviceCatalog = {
      operationMode,
      audioInputs,
      audioOutputs,
      sinkSelectionSupported: supportsSinkSelection,
      observedAt: Date.now(),
    };
    await bridge.reportMediaDeviceCatalog(catalog);
  }

  private emit(): void {
    const directive = this.build();
    for (const listener of this.listeners) listener(directive);
  }

  private build(): AudienceDirective {
    if (!this.snapshot || !this.settings || !this.content) return fallbackDirective;
    const rawState = this.snapshot.state;
    const state = this.content.states.find((entry) => entry.id === rawState) ?? this.content.states.find((entry) => entry.id === "IDLE");
    if (!state) return fallbackDirective;
    const status = this.snapshot.status;
    this.rememberIdentity(this.snapshot);
    return {
      revision: this.snapshot.stateRevision,
      verificationMode: this.verificationMode,
      operationMode: this.settings.operationMode,
      testSpeed: this.settings.test.speed,
      runMode: status === "RESETTING" ? "resetting" : this.snapshot.runMode === "PAUSED" ? "paused" : this.snapshot.runMode === "RUNNING" ? "running" : "idle",
      readiness: status === "FAULTED" ? "faulted" : status === "CHECKING" ? "checking" : this.snapshot.systemReadiness === "READY" ? "ready" : "degraded",
      developerMode: this.settings.developerMode,
      showDiagnostics: this.settings.developerMode,
      selectedMicrophoneId: this.settings[this.settings.operationMode].microphoneDeviceId ?? "",
      selectedAudioOutputId: this.settings[this.settings.operationMode].audioOutputDeviceId ?? "",
      // Verification mode intentionally accelerates the visitor cycle. Keep
      // the cap in the derived directive as well as START_RECORDING so the
      // first RECORDING render is deterministic across IPC delivery order.
      recordingDurationMs: this.verificationMode
        ? Math.min(1_000, this.recordingDurationMs)
        : this.recordingDurationMs,
      audio: { ...this.settings.audio },
      voiceEffects: this.content.voiceEffects,
      scene: audienceScene(this.content, state, this.mediaBaseUrl),
      mediaRequests: this.mediaRequests.values,
    };
  }

  private handleCommand(command: AudienceCommandMessage): void {
    this.mediaRequests.applyCommand(command);
    switch (command.command) {
      case "SYNC_RUNTIME":
        this.snapshot = command.snapshot;
        return;
      case "ENTER_STATE":
        if (this.snapshot) {
          this.snapshot = {
            ...this.snapshot,
            state: command.state,
            stateRevision: command.stateRevision,
            sessionId: command.sessionId,
            stateEnteredAtMs: Date.now(),
          };
        }
        return;
      case "SET_RUN_MODE":
        if (this.snapshot) {
          this.snapshot = {
            ...this.snapshot,
            stateRevision: command.stateRevision,
            sessionId: command.sessionId,
            runMode: command.runMode,
            status: command.runMode === "RUNNING" ? "RUNNING" : command.runMode === "PAUSED" ? "PAUSED" : "IDLE",
          };
        }
        return;
      case "START_RECORDING":
        this.recordingDurationMs = command.maximumDurationMs;
        if (this.snapshot) {
          this.snapshot = {
            ...this.snapshot,
            sessionId: command.sessionId,
            stateRevision: command.stateRevision,
            recording: "RECORDING",
          };
        }
        return;
      case "STOP_RECORDING":
      case "DISPOSE_RECORDING":
      case "RESET":
        return;
      case "SET_BUS_VOLUME":
        if (this.settings) {
          this.settings = { ...this.settings, audio: { ...this.settings.audio, [command.bus]: command.value } };
        }
        return;
    }
  }

  private mapReport(event: AudienceReport): AudienceRuntimeEvent | null {
    const atMs = Date.now();
    const capturedIdentity = this.identities.get(event.revision);
    const identity = {
      sessionId: capturedIdentity?.sessionId ?? null,
      state: capturedIdentity?.state ?? "IDLE",
      stateRevision: event.revision,
      atMs,
    };
    const runtimeIdentity = {
      sessionId: identity.sessionId,
      stateRevision: identity.stateRevision,
      atMs,
    };
    switch (event.type) {
      case "audience.ready":
        return { event: "READY", ...runtimeIdentity };
      case "media.ready":
        return { event: "MEDIA_STARTED", ...identity, state: event.sceneId, durationMs: Number.isFinite(event.durationMs) ? Math.max(0, event.durationMs) : null };
      case "media.ended":
        return { event: "MEDIA_ENDED", ...identity, state: event.sceneId };
      case "media.error":
        return { event: "MEDIA_ERROR", ...identity, state: event.sceneId, code: "MEDIA_PLAYBACK_ERROR", message: event.message };
      case "audio.error":
        return { event: "AUDIO_STATUS", ...runtimeIdentity, status: "ERROR", message: event.message };
      case "media.progress":
        return {
          event: "MEDIA_PROGRESS",
          ...identity,
          state: event.sceneId,
          mediaTimeMs: Math.max(0, event.elapsedMs),
          durationMs: Number.isFinite(event.durationMs) ? Math.max(0, event.durationMs) : null,
          seeking: event.seeking ?? false,
          ...(event.droppedVideoFrames === undefined ? {} : { droppedVideoFrames: event.droppedVideoFrames }),
          ...(event.totalVideoFrames === undefined ? {} : { totalVideoFrames: event.totalVideoFrames }),
        };
      case "recording.started":
        return { event: "RECORDING_STARTED", ...identity };
      case "recording.completed":
        return { event: "RECORDING_COMPLETE", ...identity, durationMs: Math.max(0, event.durationMs), hasAudio: true };
      case "recording.failed":
        return { event: "RECORDING_ERROR", ...identity, code: "RECORDING_FAILED", message: event.message };
      case "recording.armed":
        return { event: "MICROPHONE_STATUS", ...runtimeIdentity, operationMode: this.settings?.operationMode ?? "test", status: "READY", deviceId: event.deviceId || null, level: null };
      case "microphone.level":
        return {
          event: "MICROPHONE_STATUS",
          ...runtimeIdentity,
          operationMode: this.settings?.operationMode ?? "test",
          status: event.level > 0.015 ? "READY" : "SILENT",
          deviceId: event.deviceId || null,
          level: Math.max(0, Math.min(1, event.level)),
        };
      case "timeline.action":
        return null;
      case "mediaRequest.completed":
        return mediaRequestDeviceDomain(event.requestType) === "audioOutput"
          ? { event: "AUDIO_STATUS", ...runtimeIdentity, status: "READY", message: event.message }
          : null;
      case "mediaRequest.failed":
        return mediaRequestDeviceDomain(event.requestType) === "audioOutput"
          ? { event: "AUDIO_STATUS", ...runtimeIdentity, status: "ERROR", message: event.message }
          : mediaRequestDeviceDomain(event.requestType) === "microphone"
            ? {
                event: "MICROPHONE_STATUS",
                ...runtimeIdentity,
                operationMode: this.settings?.operationMode ?? "test",
                status: "ERROR",
                deviceId: event.microphoneDeviceId ?? null,
                level: null,
              }
            : null;
    }
  }

  private mapHealth(event: AudienceReport): RuntimeHealthReport | null {
    const operationMode = this.settings?.operationMode ?? "test";
    let health = this.healthByMode[operationMode];
    let detail: string | null = null;
    if (event.type === "media.ready") {
      health = { ...health, videoEngine: "PASS" };
      detail = "Audience media deck rendered its first frame";
    } else if (event.type === "media.error") {
      health = { ...health, videoEngine: "FAIL" };
      detail = event.message;
    } else if (event.type === "audio.error") {
      health = { ...health, audioOutput: "FAIL" };
      detail = event.message;
    } else if (event.type === "media.progress" && event.totalVideoFrames !== undefined && event.totalVideoFrames > 0) {
      const dropped = event.droppedVideoFrames ?? 0;
      const ratio = dropped / event.totalVideoFrames;
      health = { ...health, videoEngine: ratio > 0.08 ? "FAIL" : "PASS" };
      detail = `Video frames: ${event.totalVideoFrames} total, ${dropped} dropped`;
    } else if (event.type === "microphone.level") {
      if (event.level > 0.015) health = { ...health, microphoneSignal: "PASS" };
      detail = "Live microphone meter";
    } else if (event.type === "recording.failed") {
      // A capture failure after Start is handled by the revisioned experience
      // engine, which preserves cinematic timing and continues without voice.
      // It must not retroactively revoke the guided preflight PASS.
      detail = event.message;
    } else if (event.type === "mediaRequest.completed" &&
      mediaRequestDeviceDomain(event.requestType) === "audioOutput") {
      health = { ...health, audioOutput: "PASS" };
      detail = event.message;
    } else if (event.type === "mediaRequest.failed" &&
      mediaRequestDeviceDomain(event.requestType) === "audioOutput") {
      health = { ...health, audioOutput: "FAIL" };
      detail = event.message;
    } else if (event.type === "mediaRequest.failed" &&
      mediaRequestDeviceDomain(event.requestType) === "microphone") {
      health = { ...health, microphoneDevice: "FAIL", microphoneSignal: "FAIL" };
      detail = event.message;
    }
    this.healthByMode[operationMode] = health;
    return detail === null ? null : {
      ...health,
      operationMode,
      detail,
    };
  }

  private rememberIdentity(snapshot: RuntimeSnapshot): void {
    this.identities.set(snapshot.stateRevision, {
      sessionId: snapshot.sessionId,
      state: stateId(snapshot.state),
    });
    while (this.identities.size > 32) {
      const oldest = this.identities.keys().next().value;
      if (oldest === undefined) break;
      this.identities.delete(oldest);
    }
  }
}

const electronAdapter = new ElectronAudienceAdapter();
const fallbackBridge: AudienceBridge = {
  getDirective: async () => fallbackDirective,
  subscribe: () => () => undefined,
  report: async () => undefined,
};

export function getAudienceBridge(): AudienceBridge {
  return window.relight?.audience ?? (window.relightAudience ? electronAdapter : fallbackBridge);
}
