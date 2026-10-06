import type { AudioBusLevels, VoiceEffectName, VoiceEffectPreset } from "../shared/types";

type BusName = keyof AudioBusLevels;

interface VisitorEffectChain {
  nodes: Set<AudioNode>;
  parameters: Set<AudioParam>;
}

type SinkSelectableAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export interface RecordingSignalAnalysis {
  integratedRms: number;
  activeRms: number;
  peakRms: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const strength = clamp(amount, 0, 1) * 80;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / (samples - 1) - 1;
    curve[index] = ((3 + strength) * x * 20 * (Math.PI / 180)) / (Math.PI + strength * Math.abs(x));
  }
  return curve;
}

export class AudioGraph {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly buses = new Map<BusName, GainNode>();
  private readonly videoSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private readonly activeVisitorSources = new Set<AudioBufferSourceNode>();
  private readonly visitorEffectChains = new Map<AudioBufferSourceNode, VisitorEffectChain>();
  private readonly timelineSources = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private sessionGeneration = 0;
  private visitorBuffer: AudioBuffer | null = null;
  private microphoneSource: MediaStreamAudioSourceNode | null = null;
  private microphoneAnalyser: AnalyserNode | null = null;
  private reverbImpulse: AudioBuffer | null = null;
  private requestedOutputDeviceId = "";
  private routedOutputDeviceId = "";
  private outputRoute: Promise<void> = Promise.resolve();

  ensureContext(): AudioContext {
    if (this.context) return this.context;
    const context = new AudioContext({ latencyHint: "interactive", sampleRate: 48_000 });
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -5;
    limiter.knee.value = 5;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.22;

    const master = context.createGain();
    master.gain.value = 0.85;
    master.connect(limiter);
    limiter.connect(context.destination);

    this.context = context;
    this.masterGain = master;
    for (const name of ["film", "narration", "ambience", "sfx", "visitorVoice"] as const) {
      const bus = context.createGain();
      bus.connect(master);
      this.buses.set(name, bus);
    }
    this.reverbImpulse = this.createReverbImpulse(context);
    return context;
  }

  async resume(): Promise<void> {
    const context = this.ensureContext();
    await this.ensureOutputDevice();
    if (context.state === "suspended") await context.resume();
  }

  /**
   * Selects the Web Audio destination used by every bus. An empty/default ID
   * intentionally follows the macOS system output. Requests are serialized so
   * media playback cannot overtake an in-flight device change.
   */
  setOutputDevice(deviceId: string): Promise<void> {
    this.requestedOutputDeviceId = deviceId === "default" ? "" : deviceId;
    this.outputRoute = this.outputRoute
      .catch(() => undefined)
      .then(() => this.applyOutputDevice());
    return this.outputRoute;
  }

  async suspend(): Promise<void> {
    if (this.context?.state === "running") await this.context.suspend();
  }

  setLevels(levels: AudioBusLevels): void {
    const context = this.ensureContext();
    const at = context.currentTime;
    this.masterGain?.gain.setTargetAtTime(clamp(levels.master, 0, 1), at, 0.02);
    for (const name of ["film", "narration", "ambience", "sfx", "visitorVoice"] as const) {
      this.buses.get(name)?.gain.setTargetAtTime(clamp(levels[name], 0, 1), at, 0.02);
    }
  }

  setBusLevel(name: keyof AudioBusLevels, value: number, durationMs = 0): void {
    const context = this.ensureContext();
    const gainNode = name === "master" ? this.masterGain : this.buses.get(name);
    if (!gainNode) throw new Error(`Audio bus ${name} is unavailable.`);
    const now = context.currentTime;
    const target = clamp(value, 0, 1);
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    if (durationMs > 0) gainNode.gain.linearRampToValueAtTime(target, now + durationMs / 1000);
    else gainNode.gain.setTargetAtTime(target, now, 0.02);
  }

  beginTimelineRevision(): void {
    this.sessionGeneration += 1;
    this.stopVisitorVoice();
    this.stopTimelineSounds();
  }

  connectVideo(element: HTMLMediaElement): void {
    if (this.videoSources.has(element)) return;
    const context = this.ensureContext();
    const source = context.createMediaElementSource(element);
    const filmBus = this.buses.get("film");
    if (!filmBus) throw new Error("Film audio bus is unavailable.");
    source.connect(filmBus);
    this.videoSources.set(element, source);
  }

  attachMicrophone(stream: MediaStream): void {
    const context = this.ensureContext();
    this.detachMicrophone();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    this.microphoneSource = source;
    this.microphoneAnalyser = analyser;
  }

  microphoneLevel(): number {
    return clamp(this.microphoneRms() * 6.5, 0, 1);
  }

  microphoneRms(): number {
    const analyser = this.microphoneAnalyser;
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    return clamp(Math.sqrt(sum / samples.length), 0, 1);
  }

  detachMicrophone(): void {
    this.microphoneSource?.disconnect();
    this.microphoneAnalyser?.disconnect();
    this.microphoneSource = null;
    this.microphoneAnalyser = null;
  }

  async setVisitorRecording(data: ArrayBuffer): Promise<AudioBuffer> {
    const context = this.ensureContext();
    const decoded = await context.decodeAudioData(data.slice(0));
    this.visitorBuffer = decoded;
    return decoded;
  }

  async analyzeRecordingSignal(data: ArrayBuffer): Promise<RecordingSignalAnalysis> {
    const context = this.ensureContext();
    const decoded = await context.decodeAudioData(data.slice(0));
    const blockSize = Math.max(128, Math.floor(decoded.sampleRate * 0.02));
    const blockRms: number[] = [];
    let totalSquared = 0;
    let totalSamples = 0;
    let peakRms = 0;

    for (let offset = 0; offset < decoded.length; offset += blockSize) {
      const end = Math.min(decoded.length, offset + blockSize);
      let blockSquared = 0;
      let blockSamples = 0;
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const samples = decoded.getChannelData(channel);
        for (let index = offset; index < end; index += 1) {
          const sample = samples[index] ?? 0;
          const squared = sample * sample;
          blockSquared += squared;
          totalSquared += squared;
          blockSamples += 1;
          totalSamples += 1;
        }
      }
      const rms = blockSamples > 0 ? Math.sqrt(blockSquared / blockSamples) : 0;
      blockRms.push(rms);
      peakRms = Math.max(peakRms, rms);
    }

    blockRms.sort((left, right) => left - right);
    const activeIndex = Math.max(0, Math.ceil(blockRms.length * 0.9) - 1);
    return {
      integratedRms: totalSamples > 0 ? Math.sqrt(totalSquared / totalSamples) : 0,
      activeRms: blockRms[activeIndex] ?? 0,
      peakRms,
    };
  }

  hasVisitorRecording(): boolean {
    return this.visitorBuffer !== null;
  }

  async playTimelineSound(
    id: string,
    assetUrl: string,
    busName: Exclude<keyof AudioBusLevels, "master">,
    gainValue: number,
  ): Promise<void> {
    const generation = this.sessionGeneration;
    const response = await fetch(assetUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Timeline audio could not be loaded (${response.status}).`);
    const encoded = await response.arrayBuffer();
    const context = this.ensureContext();
    const decoded = await context.decodeAudioData(encoded);
    if (generation !== this.sessionGeneration) throw new DOMException("Stale timeline audio.", "AbortError");
    await this.resume();
    if (generation !== this.sessionGeneration) throw new DOMException("Stale timeline audio.", "AbortError");
    const bus = this.buses.get(busName);
    if (!bus) throw new Error(`Audio bus ${busName} is unavailable.`);

    this.stopTimelineSound(id);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = decoded;
    gain.gain.value = clamp(gainValue, 0, 1);
    source.connect(gain);
    gain.connect(bus);
    this.timelineSources.set(id, { source, gain });
    source.addEventListener("ended", () => this.disposeTimelineSound(id, source), { once: true });
    source.start();
  }

  stopTimelineSound(id: string): void {
    const active = this.timelineSources.get(id);
    if (!active) return;
    try {
      active.source.stop();
    } catch {
      // A naturally ended sound is disposed below.
    }
    this.disposeTimelineSound(id, active.source);
  }

  stopTimelineSounds(): void {
    for (const id of [...this.timelineSources.keys()]) this.stopTimelineSound(id);
  }

  async playVisitorVoice(name: VoiceEffectName, preset: VoiceEffectPreset): Promise<void> {
    const buffer = this.visitorBuffer;
    if (!buffer) throw new Error("No participant recording is available.");
    await this.resume();
    const context = this.ensureContext();
    const voiceBus = this.buses.get("visitorVoice");
    if (!voiceBus) throw new Error("Visitor voice bus is unavailable.");

    const source = context.createBufferSource();
    source.buffer = buffer;
    const safetyGain = context.createGain();
    const filter = context.createBiquadFilter();
    const output = context.createGain();
    const chain: VisitorEffectChain = {
      nodes: new Set<AudioNode>([source, safetyGain, filter, output]),
      parameters: new Set<AudioParam>([safetyGain.gain, filter.frequency, output.gain]),
    };
    const now = context.currentTime;
    const durationSeconds = Math.max(0.25, (preset.durationMs ?? buffer.duration * 1000) / 1000);

    safetyGain.gain.value = clamp(preset.safetyGain ?? 0.9, 0, 1.1);
    filter.type = "lowpass";
    const startFrequency = clamp(preset.startHz ?? preset.lowPassHz ?? 20_000, 120, 20_000);
    const endFrequency = clamp(preset.endHz ?? startFrequency, 120, 20_000);
    filter.frequency.setValueAtTime(startFrequency, now);
    if (endFrequency !== startFrequency) filter.frequency.exponentialRampToValueAtTime(endFrequency, now + durationSeconds);
    output.gain.setValueAtTime(1, now);
    if (name === "memoryDecay") output.gain.linearRampToValueAtTime(0.001, now + durationSeconds);

    source.connect(safetyGain);
    safetyGain.connect(filter);

    let dryOutput: AudioNode = filter;
    if ((preset.distortion ?? 0) > 0) {
      const distortion = context.createWaveShaper();
      chain.nodes.add(distortion);
      distortion.curve = createDistortionCurve(preset.distortion ?? 0);
      distortion.oversample = "2x";
      filter.connect(distortion);
      dryOutput = distortion;
    }
    dryOutput.connect(output);

    if ((preset.delayMs ?? 0) > 0) {
      const delay = context.createDelay(1.2);
      const feedback = context.createGain();
      const wet = context.createGain();
      chain.nodes.add(delay);
      chain.nodes.add(feedback);
      chain.nodes.add(wet);
      chain.parameters.add(delay.delayTime);
      chain.parameters.add(feedback.gain);
      chain.parameters.add(wet.gain);
      delay.delayTime.value = clamp((preset.delayMs ?? 0) / 1000, 0, 1.1);
      const feedbackCap = name === "memoryEcho" ? 0.25 : name === "memoryDecay" ? 0.38 : name === "darkVoice" ? 0.16 : 0;
      feedback.gain.value = clamp(preset.feedback ?? 0, 0, feedbackCap);
      wet.gain.value = 0.42;
      dryOutput.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(output);
    }

    if ((preset.reverbWet ?? 0) > 0 && this.reverbImpulse) {
      const convolver = context.createConvolver();
      const wet = context.createGain();
      chain.nodes.add(convolver);
      chain.nodes.add(wet);
      chain.parameters.add(wet.gain);
      convolver.buffer = this.reverbImpulse;
      wet.gain.value = clamp(preset.reverbWet ?? 0, 0, 0.55);
      dryOutput.connect(convolver);
      convolver.connect(wet);
      wet.connect(output);
    }

    output.connect(voiceBus);
    this.activeVisitorSources.add(source);
    this.visitorEffectChains.set(source, chain);
    source.addEventListener(
      "ended",
      () => {
        this.disposeVisitorEffectChain(source);
      },
      { once: true },
    );
    source.start(now);
    source.stop(now + Math.min(buffer.duration, durationSeconds) + 0.08);
  }

  stopVisitorVoice(): void {
    for (const source of [...this.activeVisitorSources]) {
      try {
        source.stop();
      } catch {
        // The source may already have ended; the effect chain is still disposed below.
      }
      this.disposeVisitorEffectChain(source);
    }
  }

  clearVisitorRecording(): void {
    this.stopVisitorVoice();
    this.visitorBuffer = null;
  }

  async playTestTone(): Promise<void> {
    await this.resume();
    const context = this.ensureContext();
    const sfxBus = this.buses.get("sfx");
    if (!sfxBus) throw new Error("Sound-effects audio bus is unavailable.");
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, now);
    oscillator.frequency.setValueAtTime(660, now + 0.22);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
    envelope.gain.setValueAtTime(0.16, now + 0.4);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
    oscillator.connect(envelope);
    envelope.connect(sfxBus);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      envelope.disconnect();
    }, { once: true });
    oscillator.start(now);
    oscillator.stop(now + 0.65);
  }

  cleanupSession(): void {
    this.sessionGeneration += 1;
    this.detachMicrophone();
    this.clearVisitorRecording();
    this.stopTimelineSounds();
  }

  private async ensureOutputDevice(): Promise<void> {
    await this.outputRoute;
    if (this.routedOutputDeviceId !== this.requestedOutputDeviceId) {
      await this.setOutputDevice(this.requestedOutputDeviceId);
    }
  }

  private async applyOutputDevice(): Promise<void> {
    const requested = this.requestedOutputDeviceId;
    if (requested === this.routedOutputDeviceId) return;
    const context = this.ensureContext() as SinkSelectableAudioContext;
    if (typeof context.setSinkId !== "function") {
      if (requested === "") {
        this.routedOutputDeviceId = "";
        return;
      }
      throw new Error("This Chromium build can only use the macOS system output.");
    }
    try {
      await context.setSinkId(requested);
    } catch {
      throw new Error(requested === ""
        ? "The macOS system output could not be opened."
        : "The selected sound output could not be opened.");
    }
    // A newer request may have arrived while Chromium was switching sinks.
    // Record the route that actually completed; ensureOutputDevice will then
    // apply the latest requested device before playback.
    this.routedOutputDeviceId = requested;
  }

  private disposeTimelineSound(id: string, source: AudioBufferSourceNode): void {
    const active = this.timelineSources.get(id);
    if (!active || active.source !== source) return;
    try {
      active.source.disconnect();
      active.gain.disconnect();
    } catch {
      // Disconnected nodes are already in the desired cleanup state.
    }
    this.timelineSources.delete(id);
  }

  private disposeVisitorEffectChain(source: AudioBufferSourceNode): void {
    const chain = this.visitorEffectChains.get(source);
    const now = this.context?.currentTime ?? 0;
    if (chain) {
      for (const parameter of chain.parameters) {
        try {
          parameter.cancelScheduledValues(now);
        } catch {
          // Chromium may reject cancellation after its owning node is collected.
        }
      }
      for (const node of chain.nodes) {
        try {
          node.disconnect();
        } catch {
          // A disconnected node is already in the desired cleanup state.
        }
      }
    } else {
      try {
        source.disconnect();
      } catch {
        // A disconnected source is already in the desired cleanup state.
      }
    }
    this.visitorEffectChains.delete(source);
    this.activeVisitorSources.delete(source);
  }

  private createReverbImpulse(context: AudioContext): AudioBuffer {
    const duration = 1.8;
    const length = Math.floor(context.sampleRate * duration);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const samples = impulse.getChannelData(channel);
      for (let index = 0; index < samples.length; index += 1) {
        const decay = Math.pow(1 - index / samples.length, 2.4);
        samples[index] = (Math.random() * 2 - 1) * decay;
      }
    }
    return impulse;
  }
}
