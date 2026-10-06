import { logger } from "./logger";

export type TestKeyboardCode = "Space" | "KeyR" | "KeyW" | "ArrowLeft" | "ArrowRight";
export type TestControlAction =
  | "START_PAUSE_RESUME"
  | "RECORD_BUTTON"
  | "CHOICE_BUTTON"
  | "PREVIOUS"
  | "NEXT"
  | "RESTART";

export interface TestKeyEvent {
  code: TestKeyboardCode;
  phase: "PRESSED" | "RELEASED";
  repeat: boolean;
  alt: boolean;
  interactive: boolean;
  atMs: number;
}

export interface InputDispatchResult {
  accepted: boolean;
  state: string;
  reason?: string;
}

export interface InputEventReport extends InputDispatchResult {
  action: TestControlAction;
  occurredAt: number;
  sourceWindowId: number;
  source: "TEST_KEYBOARD";
}

/**
 * Owns the Test profile keyboard edge lifecycle. The renderer reports whether
 * an editable or ordinary control owns the event; main remains authoritative
 * for mode, foreground, held-key, repeat and debounce decisions.
 */
export class InputManager {
  private readonly lastAcceptedAt = new Map<TestControlAction, number>();
  private readonly pressed = new Set<string>();

  constructor(
    private readonly dispatch: (action: TestControlAction, occurredAt: number) => Promise<InputDispatchResult>,
    private readonly onObserved: (report: InputEventReport) => void,
    private readonly canAcceptTestKeyboard: () => { accepted: boolean; reason?: string },
    private readonly debounceMs = 250,
  ) {}

  async handleKey(input: TestKeyEvent, sourceWindowId: number): Promise<InputEventReport> {
    const chord = `${input.alt ? "Alt+" : ""}${input.code}`;
    const action = this.actionFor(input);

    if (input.phase === "RELEASED") {
      this.pressed.delete(chord);
      return this.report(action ?? "START_PAUSE_RESUME", input.atMs, sourceWindowId, false, "Key released", "UNCHANGED", false);
    }

    if (action === null) {
      return this.report("START_PAUSE_RESUME", input.atMs, sourceWindowId, false, "Unassigned Test shortcut");
    }
    if (input.interactive) {
      return this.report(action, input.atMs, sourceWindowId, false, "Focused control keeps ordinary keyboard behavior");
    }
    const modeGate = this.canAcceptTestKeyboard();
    if (!modeGate.accepted) {
      return this.report(action, input.atMs, sourceWindowId, false, modeGate.reason ?? "Test keyboard is unavailable");
    }
    if (input.repeat) {
      return this.report(action, input.atMs, sourceWindowId, false, "Auto-repeat ignored");
    }
    if (this.pressed.has(chord)) {
      return this.report(action, input.atMs, sourceWindowId, false, "Key remains held");
    }
    this.pressed.add(chord);
    return this.dispatchAcceptedEdge(action, input.atMs, sourceWindowId);
  }

  async handleTransport(
    action: Exclude<TestControlAction, "RECORD_BUTTON" | "CHOICE_BUTTON">,
    occurredAt: number,
    sourceWindowId: number,
  ): Promise<InputEventReport> {
    const modeGate = this.canAcceptTestKeyboard();
    if (!modeGate.accepted) {
      return this.report(action, occurredAt, sourceWindowId, false, modeGate.reason ?? "Test transport is unavailable");
    }
    return this.dispatchAcceptedEdge(action, occurredAt, sourceWindowId);
  }

  reset(): void {
    this.pressed.clear();
    this.lastAcceptedAt.clear();
  }

  dispose(): void {
    this.reset();
  }

  private async dispatchAcceptedEdge(
    action: TestControlAction,
    occurredAt: number,
    sourceWindowId: number,
  ): Promise<InputEventReport> {
    const previousAt = this.lastAcceptedAt.get(action) ?? 0;
    if (occurredAt - previousAt < this.debounceMs) {
      return this.report(action, occurredAt, sourceWindowId, false, `Debounced within ${this.debounceMs}ms`);
    }
    this.lastAcceptedAt.set(action, occurredAt);

    try {
      const result = await this.dispatch(action, occurredAt);
      return this.report(action, occurredAt, sourceWindowId, result.accepted, result.reason, result.state);
    } catch (error) {
      logger.error("Test input dispatch failed", error, { action, sourceWindowId });
      return this.report(
        action,
        occurredAt,
        sourceWindowId,
        false,
        error instanceof Error ? error.message : String(error),
        "ERROR",
      );
    }
  }

  private report(
    action: TestControlAction,
    occurredAt: number,
    sourceWindowId: number,
    accepted: boolean,
    reason?: string,
    state = "UNCHANGED",
    notify = true,
  ): InputEventReport {
    const report: InputEventReport = {
      action,
      occurredAt,
      sourceWindowId,
      source: "TEST_KEYBOARD",
      accepted,
      state,
      ...(reason === undefined ? {} : { reason }),
    };
    if (notify) {
      logger.info(accepted ? "Test input accepted" : "Test input ignored", { ...report });
      this.onObserved(report);
    }
    return report;
  }

  private actionFor(input: TestKeyEvent): TestControlAction | null {
    if (input.code === "KeyR" && input.alt) return "RESTART";
    if (input.alt) return null;
    if (input.code === "Space") return "START_PAUSE_RESUME";
    if (input.code === "KeyR") return "RECORD_BUTTON";
    if (input.code === "KeyW") return "CHOICE_BUTTON";
    if (input.code === "ArrowLeft") return "PREVIOUS";
    if (input.code === "ArrowRight") return "NEXT";
    return null;
  }
}
