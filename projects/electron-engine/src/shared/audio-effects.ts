import type { AudioBus, ExperienceConfig } from "./experience-config";

export const AUDIO_PARAMETER_LIMITS = {
  gain: { min: 0, max: 1 },
  frequencyHz: { min: 20, max: 20_000 },
  delayMs: { min: 0, max: 2_000 },
  feedback: { min: 0, max: 0.38 },
  wet: { min: 0, max: 1 },
  distortion: { min: 0, max: 1 },
  durationMs: { min: 100, max: 60_000 },
} as const;

export const VOICE_FEEDBACK_CAPS = {
  memoryEcho: 0.25,
  memoryDecay: 0.38,
  darkVoice: 0.25,
} as const;

export const DEFAULT_SAFE_VOICE_EFFECTS: ExperienceConfig["voiceEffects"] = {
  clean: { safetyGain: 0.9 },
  memoryEcho: { lowPassHz: 5_200, delayMs: 280, feedback: 0.22, reverbWet: 0.18 },
  memoryDecay: {
    startHz: 12_000,
    endHz: 900,
    delayMs: 320,
    feedback: 0.36,
    reverbWet: 0.35,
    durationMs: 10_000,
  },
  darkVoice: { lowPassHz: 2_400, delayMs: 210, feedback: 0.18, distortion: 0.16 },
};

const AUDIO_BUSES: readonly AudioBus[] = ["master", "film", "narration", "ambience", "sfx", "visitorVoice"];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numericProperty = (
  value: unknown,
  key: string,
  fallback: number,
): number => (isRecord(value) && typeof value[key] === "number" ? value[key] : fallback);

export const clampFinite = (value: number, minimum: number, maximum: number, fallback: number): number => {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, safeValue));
};

export const clampGain = (value: number, fallback = 0): number =>
  clampFinite(value, AUDIO_PARAMETER_LIMITS.gain.min, AUDIO_PARAMETER_LIMITS.gain.max, fallback);

export const clampFrequencyHz = (value: number, fallback = 1_000): number =>
  clampFinite(
    value,
    AUDIO_PARAMETER_LIMITS.frequencyHz.min,
    AUDIO_PARAMETER_LIMITS.frequencyHz.max,
    fallback,
  );

export const clampDelayMs = (value: number, fallback = 0): number =>
  clampFinite(value, AUDIO_PARAMETER_LIMITS.delayMs.min, AUDIO_PARAMETER_LIMITS.delayMs.max, fallback);

export const clampFeedback = (value: number, fallback = 0): number =>
  clampFinite(value, AUDIO_PARAMETER_LIMITS.feedback.min, AUDIO_PARAMETER_LIMITS.feedback.max, fallback);

export const clampDurationMs = (value: number, fallback = 1_000): number =>
  clampFinite(
    value,
    AUDIO_PARAMETER_LIMITS.durationMs.min,
    AUDIO_PARAMETER_LIMITS.durationMs.max,
    fallback,
  );

const clampPresetFeedback = (
  value: number,
  preset: keyof typeof VOICE_FEEDBACK_CAPS,
  fallback: number,
): number => clampFinite(value, 0, VOICE_FEEDBACK_CAPS[preset], fallback);

export const clampAudioBusLevels = (
  value: unknown,
  fallback: Readonly<Record<AudioBus, number>>,
): Record<AudioBus, number> => {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    AUDIO_BUSES.map((bus) => [
      bus,
      clampGain(typeof source[bus] === "number" ? source[bus] : fallback[bus], fallback[bus]),
    ]),
  ) as Record<AudioBus, number>;
};

export const clampVoiceEffects = (value: unknown): ExperienceConfig["voiceEffects"] => {
  const source = isRecord(value) ? value : {};
  const clean = source.clean;
  const memoryEcho = source.memoryEcho;
  const memoryDecay = source.memoryDecay;
  const darkVoice = source.darkVoice;

  const decayStartHz = clampFrequencyHz(
    numericProperty(memoryDecay, "startHz", DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.startHz),
    DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.startHz,
  );
  const unclampedDecayEndHz = clampFrequencyHz(
    numericProperty(memoryDecay, "endHz", DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.endHz),
    DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.endHz,
  );

  return {
    clean: {
      safetyGain: clampGain(
        numericProperty(clean, "safetyGain", DEFAULT_SAFE_VOICE_EFFECTS.clean.safetyGain),
        DEFAULT_SAFE_VOICE_EFFECTS.clean.safetyGain,
      ),
    },
    memoryEcho: {
      lowPassHz: clampFrequencyHz(
        numericProperty(memoryEcho, "lowPassHz", DEFAULT_SAFE_VOICE_EFFECTS.memoryEcho.lowPassHz),
        DEFAULT_SAFE_VOICE_EFFECTS.memoryEcho.lowPassHz,
      ),
      delayMs: clampDelayMs(
        numericProperty(memoryEcho, "delayMs", DEFAULT_SAFE_VOICE_EFFECTS.memoryEcho.delayMs),
        DEFAULT_SAFE_VOICE_EFFECTS.memoryEcho.delayMs,
      ),
      feedback: clampPresetFeedback(
        numericProperty(memoryEcho, "feedback", DEFAULT_SAFE_VOICE_EFFECTS.memoryEcho.feedback),
        "memoryEcho",
        DEFAULT_SAFE_VOICE_EFFECTS.memoryEcho.feedback,
      ),
      reverbWet: clampGain(
        numericProperty(memoryEcho, "reverbWet", DEFAULT_SAFE_VOICE_EFFECTS.memoryEcho.reverbWet),
        DEFAULT_SAFE_VOICE_EFFECTS.memoryEcho.reverbWet,
      ),
    },
    memoryDecay: {
      startHz: decayStartHz,
      endHz: Math.min(decayStartHz, unclampedDecayEndHz),
      delayMs: clampDelayMs(
        numericProperty(memoryDecay, "delayMs", DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.delayMs),
        DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.delayMs,
      ),
      feedback: clampPresetFeedback(
        numericProperty(memoryDecay, "feedback", DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.feedback),
        "memoryDecay",
        DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.feedback,
      ),
      reverbWet: clampGain(
        numericProperty(memoryDecay, "reverbWet", DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.reverbWet),
        DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.reverbWet,
      ),
      durationMs: clampDurationMs(
        numericProperty(memoryDecay, "durationMs", DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.durationMs),
        DEFAULT_SAFE_VOICE_EFFECTS.memoryDecay.durationMs,
      ),
    },
    darkVoice: {
      lowPassHz: clampFrequencyHz(
        numericProperty(darkVoice, "lowPassHz", DEFAULT_SAFE_VOICE_EFFECTS.darkVoice.lowPassHz),
        DEFAULT_SAFE_VOICE_EFFECTS.darkVoice.lowPassHz,
      ),
      delayMs: clampDelayMs(
        numericProperty(darkVoice, "delayMs", DEFAULT_SAFE_VOICE_EFFECTS.darkVoice.delayMs),
        DEFAULT_SAFE_VOICE_EFFECTS.darkVoice.delayMs,
      ),
      feedback: clampPresetFeedback(
        numericProperty(darkVoice, "feedback", DEFAULT_SAFE_VOICE_EFFECTS.darkVoice.feedback),
        "darkVoice",
        DEFAULT_SAFE_VOICE_EFFECTS.darkVoice.feedback,
      ),
      distortion: clampGain(
        numericProperty(darkVoice, "distortion", DEFAULT_SAFE_VOICE_EFFECTS.darkVoice.distortion),
        DEFAULT_SAFE_VOICE_EFFECTS.darkVoice.distortion,
      ),
    },
  };
};

export type AudioAutomationParameter =
  | "gain"
  | "frequencyHz"
  | "delayMs"
  | "feedback"
  | "wet"
  | "distortion";

export const clampAutomationValue = (
  parameter: AudioAutomationParameter,
  value: number,
  fallback = 0,
): number => {
  const limits = AUDIO_PARAMETER_LIMITS[parameter];
  return clampFinite(value, limits.min, limits.max, fallback);
};
