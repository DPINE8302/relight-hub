import { access } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { atomicWriteJson, readJson } from "./atomic-store";
import { logger } from "./logger";
import type { AppSettings, AppSettingsPatch } from "./types";

const volume = z.number().finite().min(0).max(1);
const nullableIdentifier = z.string().max(1024).nullable();
const identityQuality = z.enum(["serial", "physical", "port", "session"]);
const productionInputRole = z.enum(["RECORD_BUTTON", "CHOICE_BUTTON"]);

const hidBindingSchema = z
  .object({
    role: productionInputRole,
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
    identityQuality,
    locationBound: z.boolean(),
    assignedAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((binding, context) => {
    if (binding.logicalMinimum > binding.logicalMaximum) {
      context.addIssue({ code: "custom", path: ["logicalMinimum"], message: "Logical minimum exceeds maximum" });
    }
    if (binding.pressedValue === binding.releasedValue) {
      context.addIssue({ code: "custom", path: ["pressedValue"], message: "Pressed and released values must differ" });
    }
  });

const deviceProfileSchema = z
  .object({
    audienceDisplayId: z.string().max(128).nullable(),
    audienceFullscreen: z.boolean(),
    microphoneDeviceId: nullableIdentifier,
    microphoneDeviceLabel: z.string().max(256).nullable(),
    audioOutputDeviceId: nullableIdentifier,
  })
  .strict();

const keyboardBindingsSchema = z
  .object({
    start: z.literal("Space"),
    record: z.literal("KeyR"),
    chooseAgain: z.literal("KeyW"),
    previous: z.literal("ArrowLeft"),
    next: z.literal("ArrowRight"),
    restart: z.literal("Alt+KeyR"),
  })
  .strict();

export const settingsSchema: z.ZodType<AppSettings> = z
  .object({
    schemaVersion: z.literal(2),
    contentRoot: z.string().min(1).max(4096).nullable(),
    developerMode: z.boolean(),
    operationMode: z.enum(["production", "test"]),
    production: deviceProfileSchema
      .extend({
        inputBindings: z
          .object({
            RECORD_BUTTON: hidBindingSchema.nullable(),
            CHOICE_BUTTON: hidBindingSchema.nullable(),
          })
          .strict(),
      })
      .strict(),
    test: deviceProfileSchema
      .extend({
        speed: z.union([z.literal(1), z.literal(2), z.literal(4)]),
        keyboardBindings: keyboardBindingsSchema,
      })
      .strict(),
    audio: z
      .object({
        master: volume,
        film: volume,
        narration: volume,
        ambience: volume,
        sfx: volume,
        visitorVoice: volume,
      })
      .strict(),
  })
  .strict()
  .superRefine((settings, context) => {
    for (const role of productionInputRole.options) {
      const binding = settings.production.inputBindings[role];
      if (binding !== null && binding.role !== role) {
        context.addIssue({ code: "custom", path: ["production", "inputBindings", role, "role"], message: "Binding role does not match its settings slot" });
      }
    }
    const record = settings.production.inputBindings.RECORD_BUTTON;
    const choice = settings.production.inputBindings.CHOICE_BUTTON;
    if (record !== null && choice !== null && record.deviceId === choice.deviceId && record.elementId === choice.elementId) {
      context.addIssue({ code: "custom", path: ["production", "inputBindings", "CHOICE_BUTTON"], message: "One physical control cannot serve both roles" });
    }
  });

const EMPTY_PROFILE = {
  audienceDisplayId: null,
  audienceFullscreen: false,
  microphoneDeviceId: null,
  microphoneDeviceLabel: null,
  audioOutputDeviceId: null,
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 2,
  contentRoot: null,
  developerMode: false,
  operationMode: "test",
  production: {
    ...EMPTY_PROFILE,
    audienceFullscreen: true,
    inputBindings: { RECORD_BUTTON: null, CHOICE_BUTTON: null },
  },
  test: {
    ...EMPTY_PROFILE,
    speed: 4,
    keyboardBindings: {
      start: "Space",
      record: "KeyR",
      chooseAgain: "KeyW",
      previous: "ArrowLeft",
      next: "ArrowRight",
      restart: "Alt+KeyR",
    },
  },
  audio: {
    master: 0.85,
    film: 0.8,
    narration: 0.85,
    ambience: 0.65,
    sfx: 0.7,
    visitorVoice: 0.9,
  },
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Converts the V1 flat simulation settings without inventing physical HID identity. */
export function migrateSettings(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const legacy = value as Record<string, unknown>;
  if (legacy.schemaVersion === 2) return value;
  if (legacy.schemaVersion !== 1) return value;

  const oldProfile = {
    audienceDisplayId: typeof legacy.audienceDisplayId === "string" ? legacy.audienceDisplayId : null,
    audienceFullscreen: typeof legacy.audienceFullscreen === "boolean" ? legacy.audienceFullscreen : true,
    microphoneDeviceId: typeof legacy.microphoneDeviceId === "string" ? legacy.microphoneDeviceId : null,
    microphoneDeviceLabel: typeof legacy.microphoneDeviceLabel === "string" ? legacy.microphoneDeviceLabel : null,
    audioOutputDeviceId: typeof legacy.audioOutputDeviceId === "string" ? legacy.audioOutputDeviceId : null,
  };
  const testMode = legacy.simulationMode === true;
  const migrated = structuredClone(DEFAULT_SETTINGS);
  migrated.contentRoot = typeof legacy.contentRoot === "string" ? legacy.contentRoot : null;
  migrated.developerMode = legacy.developerMode === true;
  migrated.operationMode = testMode ? "test" : "production";
  if (testMode) migrated.test = { ...migrated.test, ...oldProfile, audienceDisplayId: null, audienceFullscreen: false };
  else migrated.production = { ...migrated.production, ...oldProfile };
  if (legacy.audio !== null && typeof legacy.audio === "object") {
    migrated.audio = { ...migrated.audio, ...(legacy.audio as Partial<AppSettings["audio"]>) };
  }
  return migrated;
}

export class SettingsStore {
  readonly path: string;
  readonly lastKnownGoodPath: string;
  private current: AppSettings = structuredClone(DEFAULT_SETTINGS);

  constructor(userDataDirectory: string) {
    this.path = join(userDataDirectory, "settings.json");
    this.lastKnownGoodPath = join(userDataDirectory, "settings.lkg.json");
  }

  async initialize(): Promise<AppSettings> {
    if (!(await exists(this.path))) {
      await this.persist(DEFAULT_SETTINGS);
      this.current = structuredClone(DEFAULT_SETTINGS);
      return this.get();
    }

    try {
      this.current = settingsSchema.parse(migrateSettings(await readJson(this.path)));
      await atomicWriteJson(this.lastKnownGoodPath, this.current);
      return this.get();
    } catch (error) {
      logger.error("Settings validation failed; trying last-known-good settings", error);
    }

    try {
      this.current = settingsSchema.parse(migrateSettings(await readJson(this.lastKnownGoodPath)));
      await atomicWriteJson(this.path, this.current);
      return this.get();
    } catch (error) {
      logger.error("Last-known-good settings unavailable; restoring defaults", error);
      await this.persist(DEFAULT_SETTINGS);
      this.current = structuredClone(DEFAULT_SETTINGS);
      return this.get();
    }
  }

  get(): AppSettings {
    return structuredClone(this.current);
  }

  async update(patch: AppSettingsPatch): Promise<AppSettings> {
    const productionPatch = patch.production ?? {};
    const testPatch = patch.test ?? {};
    const candidate = settingsSchema.parse({
      ...this.current,
      ...(patch.contentRoot === undefined ? {} : { contentRoot: patch.contentRoot }),
      ...(patch.developerMode === undefined ? {} : { developerMode: patch.developerMode }),
      ...(patch.operationMode === undefined ? {} : { operationMode: patch.operationMode }),
      schemaVersion: 2,
      production: {
        ...this.current.production,
        ...productionPatch,
        inputBindings: {
          ...this.current.production.inputBindings,
          ...(productionPatch.inputBindings ?? {}),
        },
      },
      test: {
        ...this.current.test,
        ...testPatch,
        keyboardBindings: {
          ...this.current.test.keyboardBindings,
          ...(testPatch.keyboardBindings ?? {}),
        },
      },
      audio: { ...this.current.audio, ...(patch.audio ?? {}) },
    });
    await this.persist(candidate);
    this.current = candidate;
    return this.get();
  }

  private async persist(settings: AppSettings): Promise<void> {
    const validated = settingsSchema.parse(settings);
    await atomicWriteJson(this.path, validated);
    await atomicWriteJson(this.lastKnownGoodPath, validated);
  }
}
