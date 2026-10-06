import { Buffer } from "node:buffer";
import { z } from "zod";

export const HID_PROTOCOL_VERSION = 1 as const;
export const HID_MAX_LINE_BYTES = 65_536;
export const HID_MAX_DEVICES = 64;

const requestIdSchema = z.string().uuid();
const tokenSchema = z.string().uuid();
const timestampSchema = z.number().int().nonnegative();
const roleSchema = z.enum(["RECORD_BUTTON", "CHOICE_BUTTON"]);
const identityQualitySchema = z.enum(["serial", "physical", "port", "session"]);
const accessSchema = z.enum(["unknown", "granted", "denied", "restartRequired"]);
const deviceIdSchema = z.string().regex(/^hid_[a-f0-9]{16,40}$/).max(48);
const elementIdSchema = z.string().regex(/^element_[a-f0-9]{16,48}$/).max(64);
const deviceLabelSchema = z.string().regex(/^USB input [A-F0-9]{4}:[A-F0-9]{4}$/).max(80);
const elementLabelSchema = z.string().regex(/^(?:Button|Keyboard control) [0-9]{1,5}$/).max(80);

export const HidDeviceDescriptorSchema = z
  .object({
    id: deviceIdSchema,
    label: deviceLabelSchema,
    manufacturer: z.null(),
    vendorId: z.number().int().min(0).max(65_535),
    productId: z.number().int().min(0).max(65_535),
    transport: z.literal("USB"),
    identityQuality: identityQualitySchema,
    identityNote: z.enum([
      "Stable device identity",
      "Stable physical identity",
      "Bound to this USB port",
      "Available for this startup only",
    ]),
    locationBound: z.boolean(),
    internal: z.boolean(),
    connected: z.boolean(),
    assignable: z.boolean(),
    assignableElementCount: z.number().int().min(0).max(2_048),
    reason: z
      .enum([
        "Internal input devices cannot be assigned",
        "Pointing devices cannot be assigned",
        "Sensor devices cannot be assigned",
        "No compatible momentary controls",
      ])
      .nullable(),
    lastSeenAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((device, context) => {
    const expectedNote = {
      serial: "Stable device identity",
      physical: "Stable physical identity",
      port: "Bound to this USB port",
      session: "Available for this startup only",
    }[device.identityQuality];
    if (device.identityNote !== expectedNote || device.locationBound !== (device.identityQuality === "port")) {
      context.addIssue({ code: "custom", path: ["identityNote"], message: "Identity metadata is inconsistent" });
    }
    if (device.assignable !== (device.assignableElementCount > 0 && device.reason === null)) {
      context.addIssue({ code: "custom", path: ["assignable"], message: "Assignment status is inconsistent" });
    }
    if (device.internal && (device.assignable || device.reason !== "Internal input devices cannot be assigned")) {
      context.addIssue({ code: "custom", path: ["internal"], message: "Internal devices cannot be assigned" });
    }
  });

export const HidElementBindingSchema = z
  .object({
    role: roleSchema,
    deviceId: deviceIdSchema,
    deviceLabel: deviceLabelSchema,
    elementId: elementIdSchema,
    elementLabel: elementLabelSchema,
    usagePage: z.number().int().min(0).max(65_535),
    usage: z.number().int().min(0).max(65_535),
    reportId: z.number().int().min(0).max(255),
    logicalMinimum: z.number().int().min(-2_147_483_648).max(2_147_483_647),
    logicalMaximum: z.number().int().min(-2_147_483_648).max(2_147_483_647),
    releasedValue: z.number().int().min(-2_147_483_648).max(2_147_483_647),
    pressedValue: z.number().int().min(-2_147_483_648).max(2_147_483_647),
    identityQuality: identityQualitySchema,
    locationBound: z.boolean(),
    assignedAt: timestampSchema,
    lastSeenAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((binding, context) => {
    if (binding.logicalMaximum - binding.logicalMinimum !== 1) {
      context.addIssue({ code: "custom", path: ["logicalMaximum"], message: "HID input must be binary" });
    }
    if (binding.releasedValue === binding.pressedValue) {
      context.addIssue({ code: "custom", path: ["pressedValue"], message: "Pressed and released values must differ" });
    }
    if (
      binding.releasedValue < binding.logicalMinimum ||
      binding.releasedValue > binding.logicalMaximum ||
      binding.pressedValue < binding.logicalMinimum ||
      binding.pressedValue > binding.logicalMaximum
    ) {
      context.addIssue({ code: "custom", path: ["pressedValue"], message: "Edge values must be in the logical range" });
    }
    const compatibleButton = binding.usagePage === 9 && binding.usage > 0;
    const compatibleKey = binding.usagePage === 7 && binding.usage >= 4 &&
      !(binding.usage >= 0xe0 && binding.usage <= 0xe7);
    if (!compatibleButton && !compatibleKey) {
      context.addIssue({ code: "custom", path: ["usagePage"], message: "HID input usage cannot be assigned" });
    }
    const expectedLabel = compatibleButton ? `Button ${binding.usage}` : `Keyboard control ${binding.usage}`;
    if (binding.elementLabel !== expectedLabel) {
      context.addIssue({ code: "custom", path: ["elementLabel"], message: "HID element label is inconsistent" });
    }
  });

const commandBase = {
  version: z.literal(HID_PROTOCOL_VERSION),
  kind: z.literal("command"),
  requestId: requestIdSchema,
} as const;

export const HidHelperCommandSchema = z.union([
  z.object({ ...commandBase, command: z.literal("inventory.refresh") }).strict(),
  z.object({ ...commandBase, command: z.literal("access.request") }).strict(),
  z.object({ ...commandBase, command: z.literal("foreground.set"), active: z.boolean() }).strict(),
  z.object({ ...commandBase, command: z.literal("learn.start"), role: roleSchema }).strict(),
  z.object({ ...commandBase, command: z.literal("learn.cancel"), token: tokenSchema.optional() }).strict(),
  z
    .object({
      ...commandBase,
      command: z.literal("assignments.set"),
      bindings: z.array(HidElementBindingSchema).max(2),
    })
    .strict()
    .superRefine((value, context) => {
      const roles = new Set(value.bindings.map((binding) => binding.role));
      if (roles.size !== value.bindings.length) {
        context.addIssue({ code: "custom", path: ["bindings"], message: "Each role may be assigned once" });
      }
      const elements = new Set(value.bindings.map((binding) => `${binding.deviceId}:${binding.elementId}`));
      if (elements.size !== value.bindings.length) {
        context.addIssue({ code: "custom", path: ["bindings"], message: "One element cannot serve two roles" });
      }
    }),
  z.object({ ...commandBase, command: z.literal("ping") }).strict(),
  z.object({ ...commandBase, command: z.literal("shutdown") }).strict(),
]);

const responseBase = {
  version: z.literal(HID_PROTOCOL_VERSION),
  kind: z.literal("response"),
  requestId: requestIdSchema,
  ok: z.literal(true),
} as const;

const successfulResponseSchema = z.union([
  z
    .object({
      ...responseBase,
      command: z.literal("inventory.refresh"),
      devices: z.array(HidDeviceDescriptorSchema).max(HID_MAX_DEVICES),
    })
    .strict(),
  z.object({ ...responseBase, command: z.literal("access.request"), access: accessSchema }).strict(),
  z.object({ ...responseBase, command: z.literal("foreground.set") }).strict(),
  z.object({ ...responseBase, command: z.literal("learn.start"), token: tokenSchema }).strict(),
  z.object({ ...responseBase, command: z.literal("learn.cancel") }).strict(),
  z.object({ ...responseBase, command: z.literal("assignments.set") }).strict(),
  z.object({ ...responseBase, command: z.literal("ping"), occurredAt: timestampSchema }).strict(),
  z.object({ ...responseBase, command: z.literal("shutdown") }).strict(),
]);

const failedResponseSchema = z
  .object({
    version: z.literal(HID_PROTOCOL_VERSION),
    kind: z.literal("response"),
    command: z.enum([
      "inventory.refresh",
      "access.request",
      "foreground.set",
      "learn.start",
      "learn.cancel",
      "assignments.set",
      "ping",
      "shutdown",
    ]),
    requestId: requestIdSchema,
    ok: z.literal(false),
    error: z
      .object({ code: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/), message: z.string().max(160) })
      .strict(),
  })
  .strict();

export const HidHelperResponseSchema = z.union([successfulResponseSchema, failedResponseSchema]);

const eventBase = {
  version: z.literal(HID_PROTOCOL_VERSION),
  kind: z.literal("event"),
  occurredAt: timestampSchema,
} as const;

export const HidHelperEventSchema = z.discriminatedUnion("event", [
  z.object({ ...eventBase, event: z.literal("ready"), access: accessSchema }).strict(),
  z.object({ ...eventBase, event: z.literal("device.added"), device: HidDeviceDescriptorSchema }).strict(),
  z.object({ ...eventBase, event: z.literal("device.removed"), deviceId: deviceIdSchema }).strict(),
  z.object({ ...eventBase, event: z.literal("access.changed"), access: accessSchema }).strict(),
  z
    .object({
      ...eventBase,
      event: z.literal("learn.progress"),
      token: tokenSchema,
      role: roleSchema,
      phase: z.enum(["waiting", "firstPress"]),
      pressCount: z.union([z.literal(0), z.literal(1)]),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      event: z.literal("learn.candidate"),
      token: tokenSchema,
      role: roleSchema,
      binding: HidElementBindingSchema,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      event: z.literal("input.edge"),
      role: roleSchema,
      deviceId: deviceIdSchema,
      elementId: elementIdSchema,
      edge: z.enum(["down", "up"]),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      event: z.literal("heartbeat"),
      sequence: z.number().int().nonnegative(),
      access: accessSchema,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      event: z.literal("error"),
      code: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/),
      message: z.string().max(160),
      recoverable: z.boolean(),
    })
    .strict(),
]);

export const HidHelperMessageSchema = z.union([HidHelperResponseSchema, HidHelperEventSchema]);

export type HidHelperCommand = z.infer<typeof HidHelperCommandSchema>;
export type HidHelperResponse = z.infer<typeof HidHelperResponseSchema>;
export type HidHelperEvent = z.infer<typeof HidHelperEventSchema>;
export type HidHelperMessage = z.infer<typeof HidHelperMessageSchema>;

export function parseHidHelperLine(line: Uint8Array | string): HidHelperMessage {
  const data = typeof line === "string" ? Buffer.from(line, "utf8") : Buffer.from(line);
  if (data.byteLength === 0 || data.byteLength > HID_MAX_LINE_BYTES) {
    throw new Error("HID helper message violates the size limit");
  }
  if (data.includes(0x0a) || data.includes(0x0d)) {
    throw new Error("HID helper message must contain exactly one JSON value");
  }
  let value: unknown;
  try {
    value = JSON.parse(data.toString("utf8"));
  } catch {
    throw new Error("HID helper message is not valid JSON");
  }
  return HidHelperMessageSchema.parse(value);
}

export function serializeHidCommand(command: HidHelperCommand): Buffer {
  const value = HidHelperCommandSchema.parse(command);
  const data = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  if (data.byteLength > HID_MAX_LINE_BYTES) throw new Error("HID helper command violates the size limit");
  return data;
}
