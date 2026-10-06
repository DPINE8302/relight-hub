import { z } from "zod";

import { AudioBusSchema, StateIdSchema, StateKindSchema } from "./experience-config";
import {
  SystemCheckIdSchema,
  SystemCheckResultsSchema,
  SystemReadinessSchema,
} from "./system-check";

export const IPC_CHANNELS = {
  operatorCommand: "relight:operator-command",
  engineSnapshot: "relight:engine-snapshot",
  inputEvent: "relight:input-event",
  audienceCommand: "relight:audience-command",
  audienceRuntimeEvent: "relight:audience-runtime-event",
  runtimeSnapshot: "relight:runtime-snapshot",
  systemCheckSnapshot: "relight:system-check-snapshot",
} as const;

export const InputActionSchema = z.enum(["RECORD_BUTTON", "CHOICE_BUTTON"]);
export type InputAction = z.infer<typeof InputActionSchema>;

export const OperatorCommandSchema = z.enum([
  "START",
  "PAUSE",
  "RESUME",
  "RESTART_SCENE",
  "SKIP_SCENE",
  "RESET",
  "EMERGENCY_RESET",
  "RETURN_TO_IDLE",
  "TEST_SCENE",
  "STOP_SCENE_TEST",
  "UPDATE_SETTINGS",
  "VALIDATE_CONFIGURATION",
  "RELOAD_CONFIGURATION",
  "RESTORE_DEFAULT_CONFIGURATION",
  "CHOOSE_CONTENT_FOLDER",
  "OPEN_CONTENT_FOLDER",
  "EXPORT_LOGS",
  "RUN_SYSTEM_CHECKS",
  "RUN_SYSTEM_CHECK",
  "SIMULATE_INPUT",
]);
export type OperatorCommand = z.infer<typeof OperatorCommandSchema>;

const OperatorCommandBaseSchema = z.object({
  requestId: z.string().min(1).max(120),
  issuedAtMs: z.number().int().nonnegative(),
});

export const OperatorCommandMessageSchema = z.discriminatedUnion("command", [
  OperatorCommandBaseSchema.extend({ command: z.literal("START") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("PAUSE") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("RESUME") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("RESTART_SCENE") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("SKIP_SCENE") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("RESET") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("EMERGENCY_RESET") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("RETURN_TO_IDLE") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("STOP_SCENE_TEST") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("VALIDATE_CONFIGURATION") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("RELOAD_CONFIGURATION") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("RESTORE_DEFAULT_CONFIGURATION") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("CHOOSE_CONTENT_FOLDER") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("OPEN_CONTENT_FOLDER") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("EXPORT_LOGS") }).strict(),
  OperatorCommandBaseSchema.extend({ command: z.literal("RUN_SYSTEM_CHECKS") }).strict(),
  OperatorCommandBaseSchema.extend({
    command: z.literal("TEST_SCENE"),
    state: StateIdSchema,
    loop: z.boolean().default(false),
  }).strict(),
  OperatorCommandBaseSchema.extend({
    command: z.literal("UPDATE_SETTINGS"),
    changes: z.record(z.string().min(1).max(120), z.json()),
  }).strict(),
  OperatorCommandBaseSchema.extend({
    command: z.literal("RUN_SYSTEM_CHECK"),
    checkId: SystemCheckIdSchema,
  }).strict(),
  OperatorCommandBaseSchema.extend({
    command: z.literal("SIMULATE_INPUT"),
    action: InputActionSchema,
  }).strict(),
]);
export type OperatorCommandMessage = z.infer<typeof OperatorCommandMessageSchema>;

export const InputSourceSchema = z.enum([
  "NATIVE_HID",
  "TEST_KEYBOARD",
  "SIMULATION",
]);
export type InputSource = z.infer<typeof InputSourceSchema>;
export const OperationModeSchema = z.enum(["production", "test"]);
export type OperationMode = z.infer<typeof OperationModeSchema>;
export const ProductionInputRoleSchema = z.enum(["RECORD_BUTTON", "CHOICE_BUTTON"]);
export type ProductionInputRole = z.infer<typeof ProductionInputRoleSchema>;
export const HidAccessStatusSchema = z.enum(["unknown", "granted", "denied", "restartRequired"]);
export type HidAccessStatus = z.infer<typeof HidAccessStatusSchema>;
export const HidIdentityQualitySchema = z.enum(["serial", "physical", "port", "session"]);
export type HidIdentityQuality = z.infer<typeof HidIdentityQualitySchema>;

export const InputEventMessageSchema = z
  .object({
    action: InputActionSchema,
    source: InputSourceSchema,
    phase: z.enum(["PRESSED", "RELEASED"]),
    repeat: z.boolean(),
    atMs: z.number().int().nonnegative(),
  })
  .strict();
export type InputEventMessage = z.infer<typeof InputEventMessageSchema>;

export const RuntimeStatusSchema = z.enum(["CHECKING", "IDLE", "RUNNING", "PAUSED", "RESETTING", "FAULTED"]);
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;

/** Public operator run mode from the locked IPC contract. */
export const RunModeSchema = z.enum(["stopped", "running", "paused"]);
export type RunMode = z.infer<typeof RunModeSchema>;

/** Uppercase machine representation kept private to the deterministic core. */
export const RuntimeRunModeSchema = z.enum(["STOPPED", "RUNNING", "PAUSED"]);
export type RuntimeRunMode = z.infer<typeof RuntimeRunModeSchema>;

export const AppReadinessSchema = z.enum(["checking", "ready", "degraded", "faulted"]);
export type AppReadiness = z.infer<typeof AppReadinessSchema>;

export const RecordingStatusSchema = z.enum(["NONE", "RECORDING", "CAPTURED", "UNAVAILABLE", "ERROR"]);
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;

export const LastTransitionSchema = z
  .object({
    from: StateIdSchema,
    to: StateIdSchema,
    cause: z.string().min(1).max(120),
    atMs: z.number().int().nonnegative(),
    stateRevision: z.number().int().nonnegative(),
  })
  .strict();
export type LastTransition = z.infer<typeof LastTransitionSchema>;

export const RuntimeErrorSchema = z
  .object({
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(1_000),
    recoverable: z.boolean(),
  })
  .strict();
export type RuntimeError = z.infer<typeof RuntimeErrorSchema>;

export const RuntimeSnapshotSchema = z
  .object({
    state: StateIdSchema,
    status: RuntimeStatusSchema,
    runMode: RuntimeRunModeSchema,
    sessionId: z.string().min(1).max(120).nullable(),
    stateRevision: z.number().int().nonnegative(),
    stateEnteredAtMs: z.number().int().nonnegative(),
    recording: RecordingStatusSchema,
    systemReadiness: SystemReadinessSchema,
    lastTransition: LastTransitionSchema.nullable(),
    error: RuntimeErrorSchema.nullable(),
  })
  .strict();
export type RuntimeSnapshot = z.infer<typeof RuntimeSnapshotSchema>;

export const RuntimeIdentitySchema = z
  .object({
    sessionId: z.string().min(1).max(120).nullable(),
    stateRevision: z.number().int().nonnegative(),
  })
  .strict();
export type RuntimeIdentity = z.infer<typeof RuntimeIdentitySchema>;

const AudienceIdentityShape = {
  sessionId: z.string().min(1).max(120).nullable(),
  stateRevision: z.number().int().nonnegative(),
};

const StatefulRuntimeIdentityShape = {
  ...AudienceIdentityShape,
  state: StateIdSchema,
  atMs: z.number().int().nonnegative(),
};

export const isCurrentRuntimeIdentity = (
  identity: RuntimeIdentity,
  current: Pick<RuntimeSnapshot, "sessionId" | "stateRevision">,
): boolean => identity.sessionId === current.sessionId && identity.stateRevision === current.stateRevision;

export const isStaleRuntimeIdentity = (
  identity: RuntimeIdentity,
  current: Pick<RuntimeSnapshot, "sessionId" | "stateRevision">,
): boolean => !isCurrentRuntimeIdentity(identity, current);

const DeviceSnapshotSchema = z
  .object({
    status: z.enum(["untested", "ready", "warning", "unavailable", "error", "simulated"]),
    id: z.string().max(500).nullable(),
    label: z.string().max(500).nullable(),
    detail: z.string().max(1_000),
    lastSeenAtMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

const EngineRecordingSnapshotSchema = z
  .object({
    status: RecordingStatusSchema,
    durationMs: z.number().finite().nonnegative().nullable(),
    inputLevel: z.number().finite().min(0).max(1).nullable(),
    hasAudio: z.boolean(),
  })
  .strict();

const SceneSnapshotSchema = z
  .object({
    id: StateIdSchema,
    kind: StateKindSchema,
    title: z.string().min(1).max(160),
    media: z.string().min(1).max(512).nullable(),
    loop: z.boolean(),
  })
  .strict();

const MediaSnapshotSchema = z
  .object({
    status: z.enum(["idle", "loading", "ready", "playing", "paused", "ended", "error"]),
    currentTimeMs: z.number().finite().nonnegative(),
    durationMs: z.number().finite().nonnegative().nullable(),
    progress: z.number().finite().min(0).max(1).nullable(),
  })
  .strict();

const EngineModeSchema = z
  .object({
    operation: OperationModeSchema,
    developer: z.boolean(),
    simulation: z.boolean(),
    sceneTest: z.boolean(),
    singleDisplayFallback: z.boolean(),
  })
  .strict();

const HidDeviceSnapshotSchema = z
  .object({
    id: z.string().min(1).max(160),
    label: z.string().min(1).max(160),
    manufacturer: z.string().max(160).nullable(),
    vendorId: z.number().int().min(0).max(0xffff),
    productId: z.number().int().min(0).max(0xffff),
    transport: z.enum(["USB", "Bluetooth", "Other"]),
    identityQuality: HidIdentityQualitySchema,
    identityNote: z.string().max(240),
    locationBound: z.boolean(),
    internal: z.boolean(),
    connected: z.boolean(),
    assignable: z.boolean(),
    assignableElementCount: z.number().int().nonnegative().max(1_024),
    reason: z.string().max(500).nullable(),
    lastSeenAt: z.number().int().nonnegative().nullable(),
  })
  .strict();

const HidBindingSnapshotSchema = z
  .object({
    role: ProductionInputRoleSchema,
    deviceId: z.string().min(1).max(160),
    deviceLabel: z.string().min(1).max(160),
    elementId: z.string().min(1).max(160),
    elementLabel: z.string().min(1).max(160),
    usagePage: z.number().int().min(0).max(0xffff),
    usage: z.number().int().min(0).max(0xffff),
    reportId: z.number().int().min(0).max(0xff),
    logicalMinimum: z.number().int(),
    logicalMaximum: z.number().int(),
    releasedValue: z.number().int(),
    pressedValue: z.number().int(),
    identityQuality: HidIdentityQualitySchema,
    locationBound: z.boolean(),
    assignedAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative().nullable(),
  })
  .strict();

const HidLastInputSnapshotSchema = z
  .object({
    source: InputSourceSchema,
    role: z.union([
      ProductionInputRoleSchema,
      z.enum(["START", "PREVIOUS", "NEXT", "RESTART", "PAUSE_RESUME"]),
    ]),
    accepted: z.boolean(),
    occurredAt: z.number().int().nonnegative(),
    detail: z.string().max(500),
  })
  .strict();

const EngineWarningSchema = z
  .object({
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(1_000),
    sinceMs: z.number().int().nonnegative(),
  })
  .strict();

export const EngineSnapshotSchema = z
  .object({
    state: StateIdSchema,
    status: RuntimeStatusSchema,
    readiness: AppReadinessSchema,
    readinessByMode: z
      .object({
        production: AppReadinessSchema,
        test: AppReadinessSchema,
      })
      .strict(),
    runMode: RunModeSchema,
    sessionId: z.string().min(1).max(120).nullable(),
    stateRevision: z.number().int().nonnegative(),
    stateEnteredAtMs: z.number().int().nonnegative(),
    scene: SceneSnapshotSchema,
    media: MediaSnapshotSchema,
    recording: EngineRecordingSnapshotSchema,
    devices: z
      .object({
        audienceDisplay: DeviceSnapshotSchema,
        microphone: DeviceSnapshotSchema,
        audioOutput: DeviceSnapshotSchema,
        recordButton: DeviceSnapshotSchema,
        choiceButton: DeviceSnapshotSchema,
      })
      .strict(),
    inputs: z
      .object({
        access: HidAccessStatusSchema,
        helperAvailable: z.boolean(),
        devices: z.array(HidDeviceSnapshotSchema).max(256),
        bindings: z
          .object({
            RECORD_BUTTON: HidBindingSnapshotSchema.nullable(),
            CHOICE_BUTTON: HidBindingSnapshotSchema.nullable(),
          })
          .strict(),
        lastAcceptedInput: HidLastInputSnapshotSchema.nullable(),
        error: z.string().max(1_000).nullable(),
      })
      .strict(),
    checks: SystemCheckResultsSchema,
    mode: EngineModeSchema,
    warnings: z.array(EngineWarningSchema).max(100),
    lastTransition: LastTransitionSchema.nullable(),
    error: RuntimeErrorSchema.nullable(),
  })
  .strict();
export type EngineSnapshot = z.infer<typeof EngineSnapshotSchema>;

export const AudienceRuntimeEventSchema = z.discriminatedUnion("event", [
  z
    .object({
      event: z.literal("READY"),
      ...AudienceIdentityShape,
      atMs: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      event: z.literal("MEDIA_STARTED"),
      ...StatefulRuntimeIdentityShape,
      durationMs: z.number().finite().nonnegative().nullable(),
    })
    .strict(),
  z
    .object({
      event: z.literal("MEDIA_PROGRESS"),
      ...StatefulRuntimeIdentityShape,
      mediaTimeMs: z.number().finite().nonnegative(),
      durationMs: z.number().finite().nonnegative().nullable(),
      seeking: z.boolean(),
      droppedVideoFrames: z.number().int().nonnegative().optional(),
      totalVideoFrames: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z.object({ event: z.literal("MEDIA_ENDED"), ...StatefulRuntimeIdentityShape }).strict(),
  z
    .object({
      event: z.literal("MEDIA_ERROR"),
      ...StatefulRuntimeIdentityShape,
      code: z.string().min(1).max(120),
      message: z.string().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      event: z.literal("AUDIO_STATUS"),
      ...AudienceIdentityShape,
      atMs: z.number().int().nonnegative(),
      status: z.enum(["READY", "SUSPENDED", "ERROR"]),
      message: z.string().max(1_000).optional(),
    })
    .strict(),
  z
    .object({
      event: z.literal("MICROPHONE_STATUS"),
      ...AudienceIdentityShape,
      operationMode: OperationModeSchema,
      atMs: z.number().int().nonnegative(),
      status: z.enum(["UNAVAILABLE", "PERMISSION_REQUIRED", "READY", "SILENT", "DISCONNECTED", "ERROR"]),
      deviceId: z.string().max(500).nullable(),
      level: z.number().finite().min(0).max(1).nullable(),
    })
    .strict(),
  z.object({ event: z.literal("RECORDING_STARTED"), ...StatefulRuntimeIdentityShape }).strict(),
  z
    .object({
      event: z.literal("RECORDING_COMPLETE"),
      ...StatefulRuntimeIdentityShape,
      durationMs: z.number().finite().nonnegative(),
      hasAudio: z.boolean(),
    })
    .strict(),
  z
    .object({
      event: z.literal("RECORDING_ERROR"),
      ...StatefulRuntimeIdentityShape,
      code: z.string().min(1).max(120),
      message: z.string().min(1).max(1_000),
    })
    .strict(),
  z.object({ event: z.literal("RESET_COMPLETE"), ...StatefulRuntimeIdentityShape }).strict(),
]);
export type AudienceRuntimeEvent = z.infer<typeof AudienceRuntimeEventSchema>;

export const AudienceCommandMessageSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("SYNC_RUNTIME"),
      ...AudienceIdentityShape,
      snapshot: RuntimeSnapshotSchema,
    })
    .strict(),
  z
    .object({
      command: z.literal("ENTER_STATE"),
      ...AudienceIdentityShape,
      state: StateIdSchema,
    })
    .strict(),
  z
    .object({
      command: z.literal("SET_RUN_MODE"),
      ...AudienceIdentityShape,
      runMode: RuntimeRunModeSchema,
    })
    .strict(),
  z
    .object({
      command: z.literal("START_RECORDING"),
      sessionId: z.string().min(1).max(120),
      stateRevision: z.number().int().nonnegative(),
      maximumDurationMs: z.number().int().positive().max(6_000),
    })
    .strict(),
  z
    .object({
      command: z.literal("STOP_RECORDING"),
      sessionId: z.string().min(1).max(120),
      stateRevision: z.number().int().nonnegative(),
      reason: z.enum(["EARLY_STOP", "RESET"]),
    })
    .strict(),
  z.object({ command: z.literal("RESET"), ...AudienceIdentityShape, emergency: z.boolean() }).strict(),
  z.object({ command: z.literal("DISPOSE_RECORDING"), ...AudienceIdentityShape }).strict(),
  z
    .object({
      command: z.literal("SET_BUS_VOLUME"),
      ...AudienceIdentityShape,
      bus: AudioBusSchema,
      value: z.number().finite().min(0).max(1),
    })
    .strict(),
]);
export type AudienceCommandMessage = z.infer<typeof AudienceCommandMessageSchema>;

export const IpcAcknowledgementSchema = z
  .object({
    requestId: z.string().min(1).max(120),
    accepted: z.boolean(),
    reason: z.string().max(500).optional(),
    snapshot: EngineSnapshotSchema,
  })
  .strict();
export type IpcAcknowledgement = z.infer<typeof IpcAcknowledgementSchema>;
