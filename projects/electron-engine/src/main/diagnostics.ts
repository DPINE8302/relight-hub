import { readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { basename } from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import { logger, redactForDiagnostics } from "./logger";
import type { AppSettings, DisplayDescriptor, PowerStatus, SystemCheckSnapshot } from "./types";

const MAX_LOG_EXPORT_BYTES = 1024 * 1024;

async function readLogTail(): Promise<string> {
  try {
    const contents = await readFile(logger.getLogPath());
    return contents.subarray(Math.max(0, contents.byteLength - MAX_LOG_EXPORT_BYTES)).toString("utf8");
  } catch (error) {
    return `Log unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export interface DiagnosticsContext {
  settings: AppSettings;
  displays: DisplayDescriptor[];
  systemCheck: SystemCheckSnapshot;
  power: PowerStatus;
  engineSnapshot: unknown;
}

export async function exportDiagnostics(
  parent: BrowserWindow,
  context: DiagnosticsContext,
): Promise<{ exported: boolean; fileName?: string }> {
  const date = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const result = await dialog.showSaveDialog(parent, {
    title: "Export RE:Light Diagnostics",
    defaultPath: `RELight-Diagnostics-${date}.json`,
    filters: [{ name: "JSON diagnostic bundle", extensions: ["json"] }],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });
  if (result.canceled || result.filePath === undefined) return { exported: false };

  const bundle = redactForDiagnostics({
    formatVersion: 1,
    exportedAt: Date.now(),
    application: { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged },
    runtime: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    system: {
      platform: platform(),
      release: release(),
      architecture: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      memoryBytes: totalmem(),
    },
    settings: context.settings,
    displays: context.displays.map(({ label: _label, ...display }) => display),
    power: context.power,
    systemCheck: context.systemCheck,
    engine: context.engineSnapshot,
    logTail: await readLogTail(),
  });
  await writeFile(result.filePath, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  logger.info("Diagnostics exported", { fileName: basename(result.filePath) });
  return { exported: true, fileName: basename(result.filePath) };
}
