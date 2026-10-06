import { z } from "zod";

export const RESERVED_STATE_IDS = [
  "BOOT",
  "SYSTEM_CHECK",
  "IDLE",
  "MEMORY_INTRO",
  "WAITING_FOR_RECORD",
  "RECORDING",
  "DREAM",
  "PRESSURE",
  "NARROWING",
  "FINAL_PROMPT",
  "WAITING_FOR_CHOICE",
  "RELIGHT",
  "END",
  "RESETTING",
] as const;

export const ReservedStateIdSchema = z.enum(RESERVED_STATE_IDS);
export type ReservedStateId = z.infer<typeof ReservedStateIdSchema>;

export const StateIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Z][A-Z0-9_]*$/, "State IDs must use UPPER_SNAKE_CASE");
export type StateId = z.infer<typeof StateIdSchema>;

export const StateKindSchema = z.enum([
  "system",
  "wait",
  "passive",
  "recordGate",
  "recording",
  "choiceGate",
]);
export type StateKind = z.infer<typeof StateKindSchema>;

export const AudioBusSchema = z.enum([
  "master",
  "film",
  "narration",
  "ambience",
  "sfx",
  "visitorVoice",
]);
export type AudioBus = z.infer<typeof AudioBusSchema>;

export const VoiceEffectNameSchema = z.enum([
  "clean",
  "memoryEcho",
  "memoryDecay",
  "darkVoice",
]);
export type VoiceEffectName = z.infer<typeof VoiceEffectNameSchema>;

const NonNegativeMillisecondsSchema = z.number().int().min(0).max(86_400_000);
const PositiveMillisecondsSchema = z.number().int().positive().max(86_400_000);
const MAX_RECORDING_DURATION_MS = 6_000;
const MINIMUM_EARLY_STOP_MS = 1_000;
const GainSchema = z.number().finite().min(0).max(1);
const FrequencySchema = z.number().finite().min(20).max(20_000);
const EchoFeedbackSchema = z.number().finite().min(0).max(0.25);
const DecayFeedbackSchema = z.number().finite().min(0).max(0.38);
const DarkFeedbackSchema = z.number().finite().min(0).max(0.25);

const safeRelativePath = (value: string): boolean => {
  if (value.includes("\0") || value.includes("\\")) {
    return false;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("/") || value.startsWith("~")) {
    return false;
  }

  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
};

export const ContentPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(safeRelativePath, "Content paths must stay beneath the content-pack root");

const TimelineBaseSchema = z.object({ atMs: NonNegativeMillisecondsSchema }).strict();

export const TimelineActionSchema = z.discriminatedUnion("action", [
  TimelineBaseSchema.extend({
    action: z.literal("transition"),
    target: StateIdSchema,
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("playVisitorVoice"),
    preset: VoiceEffectNameSchema,
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("playSound"),
    asset: ContentPathSchema,
    bus: AudioBusSchema.exclude(["master"]).default("sfx"),
    gain: GainSchema.optional(),
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("stopSound"),
    soundId: z.string().min(1).max(120),
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("changeVolume"),
    bus: AudioBusSchema,
    value: GainSchema,
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("fadeAudio"),
    bus: AudioBusSchema,
    value: GainSchema,
    durationMs: PositiveMillisecondsSchema,
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("setVoiceEffect"),
    preset: VoiceEffectNameSchema,
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("emitEvent"),
    name: z.string().min(1).max(120),
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("showText"),
    id: z.string().min(1).max(120),
    text: z.string().min(1).max(1_000),
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("hideText"),
    id: z.string().min(1).max(120),
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("vibrateVisual"),
    intensity: z.number().finite().min(0).max(1),
    durationMs: PositiveMillisecondsSchema,
  }).strict(),
  TimelineBaseSchema.extend({
    action: z.literal("operatorNotification"),
    level: z.enum(["info", "warning", "error"]),
    message: z.string().min(1).max(500),
  }).strict(),
  TimelineBaseSchema.extend({ action: z.literal("startRecording") }).strict(),
  TimelineBaseSchema.extend({ action: z.literal("stopRecording") }).strict(),
]);
export type TimelineAction = z.infer<typeof TimelineActionSchema>;

const ExperienceStateInputSchema = z
  .object({
    id: StateIdSchema,
    kind: StateKindSchema,
    durationMs: PositiveMillisecondsSchema.optional(),
    loop: z.boolean(),
    next: StateIdSchema,
    media: ContentPathSchema.optional(),
    video: ContentPathSchema.optional(),
    fit: z.enum(["contain", "cover"]).optional(),
    crossfadeMs: NonNegativeMillisecondsSchema.max(5_000).optional(),
    timeline: z.array(TimelineActionSchema).max(256),
    placeholder: z
      .object({
        title: z.string().min(1).max(160),
        tone: z.string().regex(/^#[0-9A-F]{6}$/i, "Tone must be a six-digit hex color"),
      })
      .strict(),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (state.media !== undefined && state.video !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["media"],
        message: "Use canonical media only; media and legacy video cannot both be present",
      });
    }
  });

type ExperienceStateInput = z.infer<typeof ExperienceStateInputSchema>;
type ExperienceStateOutput = Omit<ExperienceStateInput, "video" | "media"> & { media?: string };

export const ExperienceStateSchema = ExperienceStateInputSchema.transform(({ video, media, ...state }): ExperienceStateOutput => {
  const canonicalMedia = media ?? video;
  return canonicalMedia === undefined ? state : { ...state, media: canonicalMedia };
});
export type ExperienceState = z.infer<typeof ExperienceStateSchema>;

const VoiceEffectsSchema = z
  .object({
    clean: z.object({ safetyGain: GainSchema }).strict(),
    memoryEcho: z
      .object({
        lowPassHz: FrequencySchema,
        delayMs: z.number().finite().min(0).max(2_000),
        feedback: EchoFeedbackSchema,
        reverbWet: GainSchema,
      })
      .strict(),
    memoryDecay: z
      .object({
        startHz: FrequencySchema,
        endHz: FrequencySchema,
        delayMs: z.number().finite().min(0).max(2_000),
        feedback: DecayFeedbackSchema,
        reverbWet: GainSchema,
        durationMs: PositiveMillisecondsSchema.max(60_000),
      })
      .strict(),
    darkVoice: z
      .object({
        lowPassHz: FrequencySchema,
        delayMs: z.number().finite().min(0).max(2_000),
        feedback: DarkFeedbackSchema,
        distortion: GainSchema,
      })
      .strict(),
  })
  .strict();

const PROTECTED_KINDS: Readonly<Record<ReservedStateId, StateKind>> = {
  BOOT: "system",
  SYSTEM_CHECK: "system",
  IDLE: "wait",
  MEMORY_INTRO: "passive",
  WAITING_FOR_RECORD: "recordGate",
  RECORDING: "recording",
  DREAM: "passive",
  PRESSURE: "passive",
  NARROWING: "passive",
  FINAL_PROMPT: "passive",
  WAITING_FOR_CHOICE: "choiceGate",
  RELIGHT: "passive",
  END: "passive",
  RESETTING: "system",
};

const issue = (ctx: z.RefinementCtx, path: PropertyKey[], message: string): void => {
  ctx.addIssue({ code: "custom", path, message });
};

const validateProtectedGraph = (
  config: z.infer<typeof ExperienceConfigStructuralSchema>,
  ctx: z.RefinementCtx,
): void => {
  const byId = new Map<string, { state: ExperienceState; index: number }>();

  config.states.forEach((state, index) => {
    if (byId.has(state.id)) {
      issue(ctx, ["states", index, "id"], `Duplicate state ID: ${state.id}`);
      return;
    }
    byId.set(state.id, { state, index });
  });

  for (const requiredId of RESERVED_STATE_IDS) {
    const entry = byId.get(requiredId);
    if (!entry) {
      issue(ctx, ["states"], `Missing protected state: ${requiredId}`);
      continue;
    }

    if (entry.state.kind !== PROTECTED_KINDS[requiredId]) {
      issue(
        ctx,
        ["states", entry.index, "kind"],
        `${requiredId} must keep kind ${PROTECTED_KINDS[requiredId]}`,
      );
    }
  }

  for (const [id, entry] of byId) {
    const { state, index } = entry;
    if (!byId.has(state.next)) {
      issue(ctx, ["states", index, "next"], `${id} points to missing state ${state.next}`);
    }

    if (!RESERVED_STATE_IDS.includes(id as ReservedStateId) && state.kind !== "passive") {
      issue(ctx, ["states", index, "kind"], "Custom states must be passive deterministic segments");
    }

    if (state.kind === "passive" && state.durationMs === undefined) {
      issue(ctx, ["states", index, "durationMs"], "Passive states require a duration");
    }

    if ((state.kind === "passive" || state.kind === "recording") && state.loop) {
      issue(ctx, ["states", index, "loop"], `${state.kind} states cannot loop`);
    }

    if (["wait", "recordGate", "choiceGate"].includes(state.kind) && !state.loop) {
      issue(ctx, ["states", index, "loop"], `${state.kind} states must loop while awaiting input`);
    }

    let priorAtMs = -1;
    let transitionCount = 0;
    state.timeline.forEach((event, eventIndex) => {
      if (event.atMs < priorAtMs) {
        issue(ctx, ["states", index, "timeline", eventIndex, "atMs"], "Timeline events must be sorted");
      }
      priorAtMs = event.atMs;

      if (state.durationMs !== undefined && event.atMs > state.durationMs) {
        issue(
          ctx,
          ["states", index, "timeline", eventIndex, "atMs"],
          "Timeline event exceeds state duration",
        );
      }

      if (event.action === "transition") {
        transitionCount += 1;
        if (event.target !== state.next) {
          issue(
            ctx,
            ["states", index, "timeline", eventIndex, "target"],
            "Timeline transition must match the state's deterministic next target",
          );
        }
        if (!byId.has(event.target)) {
          issue(
            ctx,
            ["states", index, "timeline", eventIndex, "target"],
            `Timeline points to missing state ${event.target}`,
          );
        }
        if (state.durationMs !== undefined && event.atMs !== state.durationMs) {
          issue(
            ctx,
            ["states", index, "timeline", eventIndex, "atMs"],
            "Automatic transition must occur at the configured state duration",
          );
        }
      }

      if (event.action === "startRecording" || event.action === "stopRecording") {
        issue(
          ctx,
          ["states", index, "timeline", eventIndex, "action"],
          "Recording is owned by the RED-button gate and recording engine, not the timeline",
        );
      }

      if (event.action === "vibrateVisual") {
        issue(
          ctx,
          ["states", index, "timeline", eventIndex, "action"],
          "vibrateVisual is reserved for a future adapter and is unsupported in V1",
        );
      }

      if (event.action === "playVisitorVoice" && id !== "NARROWING" && id !== "RELIGHT") {
        issue(
          ctx,
          ["states", index, "timeline", eventIndex, "action"],
          "Visitor voice playback is protected to NARROWING and RELIGHT",
        );
      }
    });

    if (state.kind === "passive" && transitionCount !== 1) {
      issue(
        ctx,
        ["states", index, "timeline"],
        "Passive states require exactly one deterministic transition event",
      );
    }

    if (state.kind !== "passive" && transitionCount > 0) {
      issue(ctx, ["states", index, "timeline"], "Only passive states may transition from the timeline");
    }
  }

  const recordGate = byId.get("WAITING_FOR_RECORD")?.state;
  if (recordGate && recordGate.next !== "RECORDING") {
    issue(ctx, ["states", byId.get("WAITING_FOR_RECORD")?.index ?? 0, "next"], "RED must enter RECORDING");
  }
  const recording = byId.get("RECORDING")?.state;
  if (recording && recording.next !== "DREAM") {
    issue(ctx, ["states", byId.get("RECORDING")?.index ?? 0, "next"], "Recording completion must enter DREAM");
  }
  const choiceGate = byId.get("WAITING_FOR_CHOICE")?.state;
  if (choiceGate && choiceGate.next !== "RELIGHT") {
    issue(ctx, ["states", byId.get("WAITING_FOR_CHOICE")?.index ?? 0, "next"], "WHITE must enter RELIGHT");
  }

  const narrowingVoice = byId
    .get("NARROWING")
    ?.state.timeline.filter((event) => event.action === "playVisitorVoice");
  if (
    narrowingVoice?.length !== 1 ||
    narrowingVoice[0]?.action !== "playVisitorVoice" ||
    narrowingVoice[0].preset !== "memoryDecay"
  ) {
    issue(ctx, ["states", byId.get("NARROWING")?.index ?? 0, "timeline"], "NARROWING must play memoryDecay once");
  }

  const relightVoice = byId
    .get("RELIGHT")
    ?.state.timeline.filter((event) => event.action === "playVisitorVoice");
  if (
    relightVoice?.length !== 1 ||
    relightVoice[0]?.action !== "playVisitorVoice" ||
    relightVoice[0].preset !== "clean"
  ) {
    issue(ctx, ["states", byId.get("RELIGHT")?.index ?? 0, "timeline"], "RELIGHT must play the clean voice once");
  }

  if (recording?.durationMs !== config.experience.recordingDurationMs) {
    issue(
      ctx,
      ["experience", "recordingDurationMs"],
      "Recording duration must match the protected RECORDING state",
    );
  }

  const end = byId.get("END")?.state;
  if (end?.durationMs !== config.experience.endHoldMs) {
    issue(ctx, ["experience", "endHoldMs"], "End hold must match the protected END state");
  }

  if (config.experience.minimumEarlyStopMs > config.experience.recordingDurationMs) {
    issue(
      ctx,
      ["experience", "minimumEarlyStopMs"],
      "Minimum early-stop time cannot exceed the recording duration",
    );
  }

  if (!byId.has("BOOT")) {
    return;
  }

  const visited = new Set<string>();
  const orderedPath: string[] = [];
  let cursor = "BOOT";
  let repeatedState: string | undefined;
  for (let step = 0; step <= byId.size; step += 1) {
    if (visited.has(cursor)) {
      repeatedState = cursor;
      break;
    }
    const entry = byId.get(cursor);
    if (!entry) {
      break;
    }
    visited.add(cursor);
    orderedPath.push(cursor);
    cursor = entry.state.next;
  }

  if (repeatedState !== "IDLE") {
    issue(ctx, ["states"], "The only allowed experience cycle must return RESETTING to IDLE");
  }

  if (visited.size !== byId.size) {
    const unreachable = [...byId.keys()].filter((id) => !visited.has(id));
    issue(ctx, ["states"], `Unreachable or branched states: ${unreachable.join(", ")}`);
  }

  const protectedOrder = orderedPath.filter((id): id is ReservedStateId =>
    RESERVED_STATE_IDS.includes(id as ReservedStateId),
  );
  if (protectedOrder.join("|") !== RESERVED_STATE_IDS.join("|")) {
    issue(ctx, ["states"], `Protected states must remain in order: ${RESERVED_STATE_IDS.join(" -> ")}`);
  }
};

const ExperienceConfigStructuralSchema = z
  .object({
    schemaVersion: z.literal(1),
    experience: z
      .object({
        title: z.string().min(1).max(120),
        recordingDurationMs: PositiveMillisecondsSchema.max(MAX_RECORDING_DURATION_MS),
        minimumEarlyStopMs: NonNegativeMillisecondsSchema
          .min(MINIMUM_EARLY_STOP_MS)
          .max(MAX_RECORDING_DURATION_MS),
        endHoldMs: PositiveMillisecondsSchema.max(60_000),
        visitorWaitTimeoutMs: PositiveMillisecondsSchema.max(3_600_000).nullable(),
      })
      .strict(),
    audioBuses: z
      .object({
        master: GainSchema,
        film: GainSchema,
        narration: GainSchema,
        ambience: GainSchema,
        sfx: GainSchema,
        visitorVoice: GainSchema,
      })
      .strict(),
    voiceEffects: VoiceEffectsSchema,
    audience: z
      .object({
        idleTitle: z.string().min(1).max(120),
        idleSubtitle: z.string().min(1).max(240),
        privacyNotice: z.string().min(1).max(500),
        recordPrompt: z.string().min(1).max(500),
        recordPurpose: z.string().min(1).max(240),
        choicePrompt: z.string().min(1).max(500),
        choicePurpose: z.string().min(1).max(240),
      })
      .strict(),
    states: z.array(ExperienceStateSchema).min(RESERVED_STATE_IDS.length).max(128),
  })
  .strict();

export const ExperienceConfigSchema = ExperienceConfigStructuralSchema.superRefine(validateProtectedGraph);
export type ExperienceConfig = z.infer<typeof ExperienceConfigSchema>;

export class ExperienceConfigError extends Error {
  readonly issues: z.core.$ZodIssue[];

  constructor(error: z.ZodError) {
    super(z.prettifyError(error));
    this.name = "ExperienceConfigError";
    this.issues = error.issues;
  }
}

export const parseExperienceConfig = (value: unknown): ExperienceConfig => {
  const result = ExperienceConfigSchema.safeParse(value);
  if (!result.success) {
    throw new ExperienceConfigError(result.error);
  }
  return result.data;
};

export const validateExperienceConfig = (
  value: unknown,
): { success: true; data: ExperienceConfig } | { success: false; error: ExperienceConfigError } => {
  const result = ExperienceConfigSchema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: new ExperienceConfigError(result.error) };
};

export const stateMapFromConfig = (config: ExperienceConfig): ReadonlyMap<StateId, ExperienceState> =>
  new Map(config.states.map((state) => [state.id, state]));
