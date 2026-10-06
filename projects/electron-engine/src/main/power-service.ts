import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { powerMonitor } from "electron";
import { logger } from "./logger";
import type { PowerStatus } from "./types";

const execFileAsync = promisify(execFile);

export class PowerService {
  private current: PowerStatus = { onAcPower: false, detail: "Power status has not been checked", checkedAt: 0 };

  constructor(private readonly onChange: (status: PowerStatus) => void) {}

  async initialize(): Promise<PowerStatus> {
    this.current = await this.readCurrent();
    powerMonitor.on("on-ac", this.onAc);
    powerMonitor.on("on-battery", this.onBattery);
    return this.get();
  }

  get(): PowerStatus {
    return { ...this.current };
  }

  async refresh(): Promise<PowerStatus> {
    this.current = await this.readCurrent();
    this.onChange(this.get());
    return this.get();
  }

  dispose(): void {
    powerMonitor.off("on-ac", this.onAc);
    powerMonitor.off("on-battery", this.onBattery);
  }

  private readonly onAc = (): void => {
    this.current = { onAcPower: true, detail: "Connected to AC power", checkedAt: Date.now() };
    logger.info("Power source changed", { ...this.current });
    this.onChange(this.get());
  };

  private readonly onBattery = (): void => {
    this.current = { onAcPower: false, detail: "Running on battery; connect AC power before exhibition use", checkedAt: Date.now() };
    logger.warn("Power source changed", { ...this.current });
    this.onChange(this.get());
  };

  private async readCurrent(): Promise<PowerStatus> {
    if (process.platform !== "darwin") {
      return { onAcPower: true, detail: "AC status is only checked on macOS", checkedAt: Date.now() };
    }
    try {
      const { stdout } = await execFileAsync("/usr/bin/pmset", ["-g", "batt"], { timeout: 3000 });
      const onAcPower = stdout.includes("'AC Power'");
      return {
        onAcPower,
        detail: onAcPower ? "Connected to AC power" : "Running on battery; connect AC power before exhibition use",
        checkedAt: Date.now(),
      };
    } catch (error) {
      logger.error("Unable to determine current power source", error);
      return { onAcPower: false, detail: "Unable to verify AC power", checkedAt: Date.now() };
    }
  }
}
