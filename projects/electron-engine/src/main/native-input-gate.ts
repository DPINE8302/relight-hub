import type { ProductionInputRole } from "./types";
import { logger } from "./logger";

export interface NativeHidEdge {
  role: ProductionInputRole;
  deviceId: string;
  elementId: string;
  edge: "down" | "up";
  occurredAt: number;
}

export interface NativeInputReport {
  source: "NATIVE_HID";
  role: ProductionInputRole;
  deviceId: string;
  elementId: string;
  edge: "down" | "up";
  occurredAt: number;
  accepted: boolean;
  completedPressRelease: boolean;
  state: string;
  reason?: string;
}

/** Main-authoritative edge, held-value and bounce gate for assigned HID controls. */
export class NativeInputGate {
  private readonly held = new Set<string>();
  private readonly lastRisingAt = new Map<ProductionInputRole, number>();

  constructor(
    private readonly dispatch: (role: ProductionInputRole, occurredAt: number) => Promise<{
      accepted: boolean;
      state: string;
      reason?: string;
    }>,
    private readonly canAccept: () => { accepted: boolean; reason?: string },
    private readonly onObserved: (report: NativeInputReport) => void,
    private readonly debounceMs = 250,
  ) {}

  async handle(edge: NativeHidEdge): Promise<NativeInputReport> {
    const key = `${edge.deviceId}:${edge.elementId}`;
    const gate = this.canAccept();
    if (!gate.accepted) {
      this.held.delete(key);
      return this.report(edge, false, false, "UNCHANGED", gate.reason ?? "Native input unavailable");
    }

    if (edge.edge === "up") {
      const completed = this.held.delete(key);
      return this.report(
        edge,
        false,
        completed,
        "UNCHANGED",
        completed ? "Assigned control released" : "Release without a matching press ignored",
      );
    }
    if (this.held.has(key)) {
      return this.report(edge, false, false, "UNCHANGED", "Held HID value ignored");
    }
    this.held.add(key);

    const previousAt = this.lastRisingAt.get(edge.role) ?? 0;
    if (edge.occurredAt - previousAt < this.debounceMs) {
      return this.report(edge, false, false, "UNCHANGED", `Debounced within ${this.debounceMs}ms`);
    }
    this.lastRisingAt.set(edge.role, edge.occurredAt);
    try {
      const result = await this.dispatch(edge.role, edge.occurredAt);
      return this.report(edge, result.accepted, false, result.state, result.reason);
    } catch (error) {
      logger.error("Native HID input dispatch failed", error, { role: edge.role });
      return this.report(
        edge,
        false,
        false,
        "ERROR",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  reset(): void {
    this.held.clear();
    this.lastRisingAt.clear();
  }

  private report(
    edge: NativeHidEdge,
    accepted: boolean,
    completedPressRelease: boolean,
    state: string,
    reason?: string,
  ): NativeInputReport {
    const report: NativeInputReport = {
      source: "NATIVE_HID",
      ...edge,
      accepted,
      completedPressRelease,
      state,
      ...(reason === undefined ? {} : { reason }),
    };
    logger.info(accepted ? "Native HID input accepted" : "Native HID input observed", {
      role: report.role,
      edge: report.edge,
      accepted,
      completedPressRelease,
      state,
      ...(reason === undefined ? {} : { reason }),
    });
    this.onObserved(report);
    return report;
  }
}
