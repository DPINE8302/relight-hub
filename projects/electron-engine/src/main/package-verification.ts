import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { atomicWriteJson } from "./atomic-store";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);
export const MICROPHONE_PURPOSE = "RE:Light uses the microphone to temporarily record the participant's response as part of the interactive experience.";

export interface NetworkAudit {
  remoteRequestsAttempted: number;
  remoteRequestsAllowed: number;
}

/** Offline verification means the packaged renderers made no remote request at all. */
export function hasNoRemoteRequests(audit: NetworkAudit): boolean {
  return audit.remoteRequestsAttempted === 0 && audit.remoteRequestsAllowed === 0;
}

async function readPackagedInfoValue(key: string): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  try {
    const infoPlist = join(process.resourcesPath, "..", "Info.plist");
    const { stdout } = await execFileAsync(
      "/usr/bin/plutil",
      ["-extract", key, "raw", "-o", "-", infoPlist],
      { timeout: 3_000 },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function hasExactMicrophonePurposeString(): Promise<boolean> {
  return (await readPackagedInfoValue("NSMicrophoneUsageDescription")) === MICROPHONE_PURPOSE;
}

export async function readBundleIdentifier(): Promise<string> {
  return (await readPackagedInfoValue("CFBundleIdentifier")) ?? "unknown";
}

export async function runPackageVerification(
  sentinelPath: string,
  placeholderCycle: boolean,
  metadata: {
    audienceReady: boolean;
    bundleId: string;
    microphonePurposeStringPresent: boolean;
    microphonePermissionStatus: string;
    mediaDevices: {
      audioInputCount: number;
      audioOutputCount: number;
      namedAudioInputAvailable: boolean;
    };
    networkAudit: NetworkAudit;
  },
): Promise<void> {
  try {
    const offline = hasNoRemoteRequests(metadata.networkAudit);
    const ok = placeholderCycle &&
      metadata.audienceReady &&
      offline &&
      metadata.bundleId === "com.relight.engine" &&
      metadata.microphonePurposeStringPresent &&
      metadata.microphonePermissionStatus === "granted" &&
      metadata.mediaDevices.audioInputCount > 0 &&
      metadata.mediaDevices.audioOutputCount > 0 &&
      metadata.mediaDevices.namedAudioInputAvailable;
    await atomicWriteJson(sentinelPath, {
      ok,
      offline,
      placeholderCycle,
      ...metadata,
    });
    logger.info("Packaged offline placeholder verification completed", { ok });
  } catch (error) {
    await atomicWriteJson(sentinelPath, {
      ok: false,
      offline: hasNoRemoteRequests(metadata.networkAudit),
      placeholderCycle: false,
      ...metadata,
      error: error instanceof Error ? error.message : "Verification failed",
    });
    logger.error("Packaged offline placeholder verification failed", error);
  }
}
