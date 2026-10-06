import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "./logger";

export async function cleanupStaleRecordings(temporaryDirectory: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(temporaryDirectory);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const name of entries) {
    if (!/^relight-recording-[A-Za-z0-9_-]+\.(?:webm|wav|m4a|tmp)$/.test(name)) continue;
    try {
      await rm(join(temporaryDirectory, name), { force: true });
      removed += 1;
    } catch (error) {
      logger.warn("Unable to remove stale temporary recording", {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (removed > 0) logger.info("Removed stale temporary recordings", { count: removed });
  return removed;
}
