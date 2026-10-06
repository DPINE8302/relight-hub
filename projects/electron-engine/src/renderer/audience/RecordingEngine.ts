import { AudioGraph } from "./AudioGraph";

export interface RecordingResult {
  data: ArrayBuffer;
  durationMs: number;
  mimeType: string;
}

export interface ArmedMicrophone {
  label: string;
  deviceId: string;
}

function preferredMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

export class RecordingEngine {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private readonly chunks: Blob[] = [];
  private generation = 0;
  private activeRevision = -1;
  private activeDeviceId = "";
  private requestedDeviceId = "";
  private stopTimer: number | null = null;
  private meterTimer: number | null = null;
  private startedAt = 0;
  private pendingReject: ((reason?: unknown) => void) | null = null;
  private readonly floorSamples: number[] = [];
  private noiseFloorRms = 0.0005;
  private capturePeakRms = 0;
  private captureSquaredRms = 0;
  private captureSampleCount = 0;

  constructor(private readonly audio: AudioGraph) {}

  async arm(
    deviceId: string,
    revision: number,
    onLevel: (level: number, actualDeviceId: string) => void,
  ): Promise<ArmedMicrophone> {
    if (this.stream?.active && this.requestedDeviceId === deviceId) {
      this.activeRevision = revision;
      this.startMeter(revision, onLevel);
      return {
        label: this.stream.getAudioTracks()[0]?.label ?? "Selected microphone",
        deviceId: this.activeDeviceId,
      };
    }
    const generation = ++this.generation;
    this.stopStream();
    const audioConstraints: MediaTrackConstraints = {
      autoGainControl: true,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 48_000,
    };
    if (deviceId) audioConstraints.deviceId = { exact: deviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    if (generation !== this.generation) {
      for (const track of stream.getTracks()) track.stop();
      throw new DOMException("Stale microphone request.", "AbortError");
    }
    this.stream = stream;
    this.activeRevision = revision;
    this.requestedDeviceId = deviceId;
    const track = stream.getAudioTracks()[0];
    this.activeDeviceId = track?.getSettings().deviceId ?? "";
    this.floorSamples.splice(0);
    this.noiseFloorRms = 0.0005;
    this.audio.attachMicrophone(stream);
    this.startMeter(revision, onLevel);
    return {
      label: track?.label ?? "Selected microphone",
      deviceId: this.activeDeviceId,
    };
  }

  start(durationMs: number, revision: number): Promise<RecordingResult> {
    const stream = this.stream;
    if (!stream?.active) return Promise.reject(new Error("The microphone is not armed."));
    if (revision !== this.activeRevision) return Promise.reject(new DOMException("Stale recording command.", "AbortError"));
    if (this.recorder?.state === "recording") return Promise.reject(new Error("A recording is already in progress."));
    const generation = ++this.generation;
    const mimeType = preferredMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(stream, options);
    this.recorder = recorder;
    this.chunks.splice(0);
    this.startedAt = performance.now();
    this.capturePeakRms = 0;
    this.captureSquaredRms = 0;
    this.captureSampleCount = 0;

    return new Promise<RecordingResult>((resolve, reject) => {
      this.pendingReject = reject;
      recorder.addEventListener("dataavailable", (event) => {
        if (generation === this.generation && event.data.size > 0) this.chunks.push(event.data);
      });
      recorder.addEventListener(
        "error",
        (event) => {
          if (generation !== this.generation || revision !== this.activeRevision) return;
          this.pendingReject = null;
          reject(event.error);
          this.finishCapture(generation);
        },
        { once: true },
      );
      recorder.addEventListener(
        "stop",
        () => {
          if (generation !== this.generation || revision !== this.activeRevision) return;
          const elapsed = Math.max(0, performance.now() - this.startedAt);
          const blob = new Blob(this.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          this.pendingReject = null;
          void blob
            .arrayBuffer()
            .then(async (data) => {
              const analysis = await this.audio.analyzeRecordingSignal(data);
              if (generation !== this.generation || revision !== this.activeRevision) {
                throw new DOMException("Stale recording result.", "AbortError");
              }
              const liveRms = this.captureSampleCount > 0 ? Math.sqrt(this.captureSquaredRms / this.captureSampleCount) : 0;
              const activeRms = Math.max(analysis.activeRms, this.capturePeakRms);
              const integratedRms = Math.max(analysis.integratedRms, liveRms);
              const safeMargin = Math.max(0.0025, this.noiseFloorRms * 0.65);
              const minimumIntegratedRms = Math.max(0.0015, this.noiseFloorRms * 1.15);
              if (activeRms < this.noiseFloorRms + safeMargin || integratedRms < minimumIntegratedRms) {
                throw new Error("No voice was detected above the room noise floor. Please record again.");
              }
              resolve({ data, durationMs: elapsed, mimeType: blob.type });
            })
            .catch(reject)
            .finally(() => this.finishCapture(generation));
        },
        { once: true },
      );
      recorder.start(100);
      this.stopTimer = window.setTimeout(() => this.stop(), Math.max(250, durationMs));
    });
  }

  stop(): void {
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
    if (this.recorder?.state === "recording" || this.recorder?.state === "paused") this.recorder.stop();
  }

  cleanup(): void {
    this.generation += 1;
    this.activeRevision = -1;
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
    this.pendingReject?.(new DOMException("Recording was cancelled.", "AbortError"));
    this.pendingReject = null;
    if (this.recorder?.state === "recording" || this.recorder?.state === "paused") {
      try {
        this.recorder.stop();
      } catch {
        // Cleanup continues even if Chromium already stopped the recorder.
      }
    }
    this.recorder = null;
    this.chunks.splice(0);
    this.stopStream();
  }

  private startMeter(revision: number, onLevel: (level: number, actualDeviceId: string) => void): void {
    if (this.meterTimer !== null) window.clearInterval(this.meterTimer);
    this.meterTimer = window.setInterval(() => {
      if (revision !== this.activeRevision) return;
      const rms = this.audio.microphoneRms();
      if (this.recorder?.state === "recording") {
        this.capturePeakRms = Math.max(this.capturePeakRms, rms);
        this.captureSquaredRms += rms * rms;
        this.captureSampleCount += 1;
      } else if (Number.isFinite(rms)) {
        this.floorSamples.push(rms);
        if (this.floorSamples.length > 30) this.floorSamples.shift();
        const sorted = [...this.floorSamples].sort((left, right) => left - right);
        const floorIndex = Math.max(0, Math.floor((sorted.length - 1) * 0.35));
        this.noiseFloorRms = Math.max(0.0005, sorted[floorIndex] ?? 0.0005);
      }
      onLevel(this.audio.microphoneLevel(), this.activeDeviceId);
    }, 100);
  }

  private finishCapture(generation: number): void {
    if (generation !== this.generation) return;
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
    this.recorder = null;
    this.chunks.splice(0);
    this.stopStream();
  }

  private stopStream(): void {
    if (this.meterTimer !== null) window.clearInterval(this.meterTimer);
    this.meterTimer = null;
    this.audio.detachMicrophone();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.activeRevision = -1;
    this.activeDeviceId = "";
    this.requestedDeviceId = "";
  }
}
