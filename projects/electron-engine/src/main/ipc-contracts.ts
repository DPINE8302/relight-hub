import { z } from "zod";
import {
  AudienceRuntimeEventSchema,
  OperatorCommandMessageSchema,
} from "../shared/contracts";

export const IPC = {
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
  audience: {
    getBootstrap: "relight:audience:get-bootstrap",
    runtimeEvent: "relight:audience-runtime-event",
    runtimeHealth: "relight:audience:runtime-health",
    command: "relight:audience-command",
    snapshot: "relight:runtime-snapshot",
    settings: "relight:audience-settings",
    mediaCheck: "relight:audience-media-check",
    reportMediaDeviceCatalog: "relight:audience:report-media-device-catalog",
    refreshMediaDevices: "relight:audience:refresh-media-devices",
  },
} as const;

export const operatorCommandMessageSchema = OperatorCommandMessageSchema;

const volumeSchema = z.number().finite().min(0).max(1);
const productionInputRoleSchema = z.enum(["RECORD_BUTTON", "CHOICE_BUTTON"]);

const hidBindingSchema = z
  .object({
    role: productionInputRoleSchema,
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
    identityQuality: z.enum(["serial", "physical", "port", "session"]),
    locationBound: z.boolean(),
    assignedAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative().nullable(),
  })
  .strict();

const deviceProfilePatchSchema = z
  .object({
    audienceDisplayId: z.string().max(128).nullable().optional(),
    audienceFullscreen: z.boolean().optional(),
    microphoneDeviceId: z.string().max(1024).nullable().optional(),
    microphoneDeviceLabel: z.string().max(256).nullable().optional(),
    audioOutputDeviceId: z.string().max(1024).nullable().optional(),
  })
  .strict();

export const settingsPatchSchema = z
  .object({
    developerMode: z.boolean().optional(),
    operationMode: z.enum(["production", "test"]).optional(),
    production: deviceProfilePatchSchema
      .extend({
        inputBindings: z
          .object({
            RECORD_BUTTON: hidBindingSchema.nullable().optional(),
            CHOICE_BUTTON: hidBindingSchema.nullable().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    test: deviceProfilePatchSchema
      .extend({
        speed: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
        keyboardBindings: z
          .object({
            start: z.literal("Space").optional(),
            record: z.literal("KeyR").optional(),
            chooseAgain: z.literal("KeyW").optional(),
            previous: z.literal("ArrowLeft").optional(),
            next: z.literal("ArrowRight").optional(),
            restart: z.literal("Alt+KeyR").optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    audio: z
      .object({
        master: volumeSchema.optional(),
        film: volumeSchema.optional(),
        narration: volumeSchema.optional(),
        ambience: volumeSchema.optional(),
        sfx: volumeSchema.optional(),
        visitorVoice: volumeSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const hidRoleRequestSchema = z.object({ role: productionInputRoleSchema }).strict();
export const hidTokenRequestSchema = z.object({ token: z.string().uuid() }).strict();
export const testKeyRequestSchema = z
  .object({
    code: z.enum(["Space", "KeyR", "KeyW", "ArrowLeft", "ArrowRight"]),
    phase: z.enum(["PRESSED", "RELEASED"]),
    repeat: z.boolean(),
    alt: z.boolean(),
    interactive: z.boolean(),
    atMs: z.number().int().nonnegative(),
  })
  .strict();
export const testTransportRequestSchema = z
  .object({ action: z.enum(["start", "togglePause", "previous", "next", "restart"]) })
  .strict();

export const mediaDeviceInventorySchema = z
  .object({
    operationMode: z.enum(["production", "test"]),
    audioInputDeviceIds: z.array(z.string().min(1).max(1_024)).max(128),
    audioOutputDeviceIds: z.array(z.string().min(1).max(1_024)).max(128),
    sinkSelectionSupported: z.boolean(),
    observedAt: z.number().int().nonnegative(),
  })
  .strict();

const mediaDeviceOptionSchema = z
  .object({
    id: z.string().min(1).max(1_024).refine(
      (id) => id !== "default" && id !== "communications",
      "Pseudo-default devices cannot be persisted as exact hardware",
    ),
    label: z.string().max(256).refine(
      (label) => [...label].every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 32 && codePoint !== 127;
      }),
      "Device labels cannot contain control characters",
    ),
    isDefault: z.boolean(),
  })
  .strict();

export const mediaDeviceCatalogSchema = z
  .object({
    operationMode: z.enum(["production", "test"]),
    audioInputs: z.array(mediaDeviceOptionSchema).max(128),
    audioOutputs: z.array(mediaDeviceOptionSchema).max(128),
    sinkSelectionSupported: z.boolean(),
    observedAt: z.number().int().nonnegative(),
  })
  .strict();

export const audienceRuntimeEventSchema = AudienceRuntimeEventSchema;

export const runtimeHealthSchema = z
  .object({
    operationMode: z.enum(["production", "test"]),
    microphoneDevice: z.enum(["PASS", "FAIL", "NOT_TESTED"]).optional(),
    microphoneSignal: z.enum(["PASS", "FAIL", "NOT_TESTED"]),
    audioOutput: z.enum(["PASS", "FAIL", "NOT_TESTED"]),
    videoEngine: z.enum(["PASS", "FAIL", "NOT_TESTED"]),
    detail: z.string().max(1000).optional(),
  })
  .strict();

export const systemCheckRequestSchema = z
  .object({
    checkId: z.enum([
      "power",
      "display",
      "content",
      "microphonePermission",
      "microphoneDevice",
      "microphoneSignal",
      "redButton",
      "whiteButton",
      "audioOutput",
      "videoEngine",
      "storage",
      "inputMonitoring",
    ]).optional(),
  })
  .strict()
  .optional();

export const audienceMediaCheckRequestSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["mic.test", "audio.test"]),
    sessionId: z.string().min(1).max(120).nullable(),
    stateRevision: z.number().int().nonnegative(),
    durationMs: z.number().int().min(250).max(10_000).optional(),
    microphoneDeviceId: z.string().min(1).max(1_024).optional(),
  })
  .strict();
