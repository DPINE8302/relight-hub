import { createHash } from "node:crypto";
import { access, mkdir, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { ExperienceConfigSchema, type ExperienceConfig } from "../shared/experience-config";
import { atomicWriteJson, readJson } from "./atomic-store";
import { logger } from "./logger";
import { resolveExistingContained } from "./safe-path";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function validationIssues(error: unknown): string[] {
  if (error !== null && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    return error.issues.slice(0, 50).map((issue: unknown) => {
      if (issue !== null && typeof issue === "object" && "message" in issue) {
        const path = "path" in issue && Array.isArray(issue.path)
          ? issue.path.map((segment) => String(segment)).join(".")
          : "";
        return `${path.length > 0 ? path : "configuration"}: ${String(issue.message)}`;
      }
      return "Invalid content configuration";
    });
  }
  return [error instanceof Error ? error.message : "Invalid content configuration"];
}

export interface ContentValidationResult {
  valid: boolean;
  issues: string[];
}

export interface LoadedContent {
  configuration: ExperienceConfig;
  source: "current" | "last-known-good" | "seed";
  contentDirectory: string;
  mediaDirectory: string;
  warning?: string;
}

export interface MediaReadiness {
  ready: boolean;
  detail: string;
  referencedAssetCount: number;
}

/** Owns the operator-editable content pack and its recoverable last-known-good copy. */
export class ContentManager {
  private selectedDirectory: string;
  private loaded: LoadedContent | null = null;
  private readonly recoveryDirectory: string;

  constructor(
    defaultContentDirectory: string,
    private readonly seedDirectory: string,
    recoveryDirectory: string,
  ) {
    this.selectedDirectory = this.normalizeDirectory(defaultContentDirectory);
    this.recoveryDirectory = join(resolve(recoveryDirectory), "content-recovery");
  }

  get contentDirectory(): string {
    return this.selectedDirectory;
  }

  get mediaDirectory(): string {
    return join(this.selectedDirectory, "media");
  }

  get experiencePath(): string {
    return join(this.selectedDirectory, "experience.json");
  }

  get lastKnownGoodPath(): string {
    const rootKey = createHash("sha256").update(this.selectedDirectory).digest("hex");
    return join(this.recoveryDirectory, `${rootKey}.lkg.json`);
  }

  async initialize(): Promise<LoadedContent> {
    return this.loadWithFallback();
  }

  get(): LoadedContent {
    if (this.loaded === null) throw new Error("ContentManager has not been initialized");
    return structuredClone(this.loaded);
  }

  async selectDirectory(directory: string): Promise<LoadedContent> {
    const previousDirectory = this.selectedDirectory;
    const previousLoaded = this.loaded;
    this.selectedDirectory = this.normalizeDirectory(directory);
    this.loaded = null;
    try {
      return await this.loadWithFallback();
    } catch (error) {
      this.selectedDirectory = previousDirectory;
      this.loaded = previousLoaded;
      throw error;
    }
  }

  async validateCurrent(): Promise<ContentValidationResult> {
    try {
      ExperienceConfigSchema.parse(await readJson(this.experiencePath));
      return { valid: true, issues: [] };
    } catch (error) {
      return { valid: false, issues: validationIssues(error) };
    }
  }

  async inspectMediaReadiness(): Promise<MediaReadiness> {
    const configuration = this.get().configuration;
    const passiveStates = configuration.states.filter((state) => state.kind === "passive");
    const missingVideoCount = passiveStates.filter((state) => !("media" in state) || state.media === undefined).length;
    const referenced = new Set<string>();
    for (const state of configuration.states) {
      if ("media" in state && state.media !== undefined) referenced.add(state.media);
      for (const action of state.timeline) {
        if (action.action === "playSound") referenced.add(action.asset);
      }
    }
    if (missingVideoCount > 0 || referenced.size === 0) {
      return {
        ready: false,
        detail: "The active pack is placeholder-only; production passive scenes do not all reference media",
        referencedAssetCount: referenced.size,
      };
    }
    try {
      for (const path of referenced) {
        const filePath = await resolveExistingContained(this.contentDirectory, path);
        if ((await stat(filePath)).size === 0) throw new Error("Referenced media is empty");
      }
      return {
        ready: true,
        detail: `${referenced.size} referenced media assets are present; renderer decode confirmation is still required`,
        referencedAssetCount: referenced.size,
      };
    } catch {
      return {
        ready: false,
        detail: "One or more referenced media assets are missing, empty, or outside the selected content root",
        referencedAssetCount: referenced.size,
      };
    }
  }

  /** Reloads only a valid current file; the active runtime remains unchanged on failure. */
  async reloadCurrent(): Promise<LoadedContent> {
    const configuration = ExperienceConfigSchema.parse(await readJson(this.experiencePath));
    await atomicWriteJson(this.lastKnownGoodPath, configuration);
    this.loaded = this.makeLoaded(configuration, "current");
    return this.get();
  }

  async restoreLastKnownGood(): Promise<LoadedContent> {
    const configuration = ExperienceConfigSchema.parse(await readJson(this.lastKnownGoodPath));
    await atomicWriteJson(this.experiencePath, configuration);
    this.loaded = this.makeLoaded(configuration, "last-known-good");
    logger.info("Restored the content configuration from its last-known-good copy");
    return this.get();
  }

  async updateExperience(configuration: unknown): Promise<LoadedContent> {
    const validated = ExperienceConfigSchema.parse(configuration);
    await atomicWriteJson(this.experiencePath, validated);
    await atomicWriteJson(this.lastKnownGoodPath, validated);
    this.loaded = this.makeLoaded(validated, "current");
    return this.get();
  }

  private async loadWithFallback(): Promise<LoadedContent> {
    await mkdir(this.mediaDirectory, { recursive: true, mode: 0o700 });
    const seeded = !(await exists(this.experiencePath));
    if (seeded) {
      const seed = ExperienceConfigSchema.parse(await readJson(join(this.seedDirectory, "experience.json")));
      await atomicWriteJson(this.experiencePath, seed);
    }

    try {
      const configuration = ExperienceConfigSchema.parse(await readJson(this.experiencePath));
      await atomicWriteJson(this.lastKnownGoodPath, configuration);
      this.loaded = this.makeLoaded(configuration, seeded ? "seed" : "current");
      return this.get();
    } catch (error) {
      logger.error("Experience configuration is invalid; trying last-known-good content", error);
    }

    try {
      const configuration = ExperienceConfigSchema.parse(await readJson(this.lastKnownGoodPath));
      this.loaded = this.makeLoaded(
        configuration,
        "last-known-good",
        "The edited experience.json is invalid. Running the last-known-good configuration.",
      );
      return this.get();
    } catch (error) {
      logger.error("Last-known-good experience is unavailable; using the bundled seed without overwriting edits", error);
    }

    const configuration = ExperienceConfigSchema.parse(await readJson(join(this.seedDirectory, "experience.json")));
    await atomicWriteJson(this.lastKnownGoodPath, configuration);
    this.loaded = this.makeLoaded(
      configuration,
      "seed",
      "The edited and last-known-good configurations are invalid. Running the bundled seed; use Restore to repair experience.json.",
    );
    return this.get();
  }

  private makeLoaded(
    configuration: ExperienceConfig,
    source: LoadedContent["source"],
    warning?: string,
  ): LoadedContent {
    return {
      configuration,
      source,
      contentDirectory: this.contentDirectory,
      mediaDirectory: this.mediaDirectory,
      ...(warning === undefined ? {} : { warning }),
    };
  }

  private normalizeDirectory(directory: string): string {
    if (directory.includes("\0") || directory.trim().length === 0) throw new Error("Content folder path is invalid");
    const normalized = resolve(directory);
    if (!isAbsolute(normalized)) throw new Error("Content folder must be an absolute path");
    return normalized;
  }
}
