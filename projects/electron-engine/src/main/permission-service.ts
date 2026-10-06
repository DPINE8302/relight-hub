import { shell, systemPreferences } from "electron";
import { logger } from "./logger";

export type MicrophonePermissionStatus = "not-determined" | "granted" | "denied" | "restricted" | "unknown";

export class PermissionService {
  getMicrophoneStatus(): MicrophonePermissionStatus {
    if (process.platform !== "darwin") return "unknown";
    return systemPreferences.getMediaAccessStatus("microphone");
  }

  canUseMicrophone(): boolean {
    return this.getMicrophoneStatus() === "granted";
  }

  async requestMicrophonePermission(): Promise<{ granted: boolean; status: MicrophonePermissionStatus; restartRequired: boolean }> {
    const before = this.getMicrophoneStatus();
    if (before === "denied" || before === "restricted") {
      logger.warn("Microphone permission cannot be prompted again", { status: before });
      return { granted: false, status: before, restartRequired: before === "denied" };
    }
    if (before === "granted") return { granted: true, status: before, restartRequired: false };
    if (process.platform !== "darwin") return { granted: false, status: "unknown", restartRequired: false };

    const granted = await systemPreferences.askForMediaAccess("microphone");
    const status = this.getMicrophoneStatus();
    logger.info("Microphone permission request completed", { granted, status });
    return { granted, status, restartRequired: false };
  }

  async openMicrophoneSettings(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      { activate: true },
    );
    logger.info("Opened macOS microphone privacy settings");
    return true;
  }
}
