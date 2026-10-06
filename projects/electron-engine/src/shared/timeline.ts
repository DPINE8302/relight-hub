import type { StateId, TimelineAction } from "./experience-config";

export interface TimelineIdentity {
  readonly sessionId: string | null;
  readonly state: StateId;
  readonly stateRevision: number;
}

export interface TimelineEntry extends TimelineIdentity {
  readonly events: readonly TimelineAction[];
  readonly initialPositionMs?: number;
}

export interface TimelineProgress extends TimelineIdentity {
  readonly currentTimeMs: number;
  readonly mode?: "frame" | "seek";
}

export interface FiredTimelineAction {
  readonly key: string;
  readonly index: number;
  readonly event: TimelineAction;
}

export interface TimelineAdvanceResult {
  readonly accepted: boolean;
  readonly stale: boolean;
  readonly reason?: string;
  readonly fired: readonly FiredTimelineAction[];
  readonly currentTimeMs: number;
}

interface ActiveTimeline extends TimelineIdentity {
  readonly events: readonly TimelineAction[];
  readonly firedIndexes: Set<number>;
  previousTimeMs: number;
}

const sameIdentity = (left: TimelineIdentity, right: TimelineIdentity): boolean =>
  left.sessionId === right.sessionId &&
  left.state === right.state &&
  left.stateRevision === right.stateRevision;

export class TimelineFireOnce {
  private active: ActiveTimeline | null = null;

  enter(entry: TimelineEntry): void {
    const initialPositionMs = entry.initialPositionMs ?? 0;
    if (!Number.isFinite(initialPositionMs) || initialPositionMs < 0) {
      throw new RangeError("Timeline initial position must be finite and non-negative");
    }

    this.active = {
      sessionId: entry.sessionId,
      state: entry.state,
      stateRevision: entry.stateRevision,
      events: [...entry.events],
      firedIndexes: new Set<number>(),
      previousTimeMs: initialPositionMs === 0 ? -1 : initialPositionMs,
    };

    if (initialPositionMs > 0) {
      this.markSkippedThrough(initialPositionMs);
    }
  }

  advance(progress: TimelineProgress): TimelineAdvanceResult {
    if (!Number.isFinite(progress.currentTimeMs) || progress.currentTimeMs < 0) {
      return {
        accepted: false,
        stale: false,
        reason: "Timeline position must be finite and non-negative",
        fired: [],
        currentTimeMs: this.active?.previousTimeMs ?? 0,
      };
    }

    if (!this.active) {
      return {
        accepted: false,
        stale: true,
        reason: "No state timeline is active",
        fired: [],
        currentTimeMs: progress.currentTimeMs,
      };
    }

    const active = this.active;

    if (!sameIdentity(active, progress)) {
      return {
        accepted: false,
        stale: true,
        reason: "Stale timeline progress ignored",
        fired: [],
        currentTimeMs: active.previousTimeMs,
      };
    }

    const mode = progress.mode ?? "frame";
    if (mode === "seek") {
      if (progress.currentTimeMs > active.previousTimeMs) {
        this.markSkippedThrough(progress.currentTimeMs);
      }
      active.previousTimeMs = progress.currentTimeMs;
      return {
        accepted: true,
        stale: false,
        fired: [],
        currentTimeMs: progress.currentTimeMs,
      };
    }

    if (progress.currentTimeMs < active.previousTimeMs) {
      active.previousTimeMs = progress.currentTimeMs;
      return {
        accepted: true,
        stale: false,
        fired: [],
        currentTimeMs: progress.currentTimeMs,
      };
    }

    const previousTimeMs = active.previousTimeMs;
    const fired: FiredTimelineAction[] = [];
    this.active.events.forEach((event, index) => {
      if (
        !active.firedIndexes.has(index) &&
        event.atMs > previousTimeMs &&
        event.atMs <= progress.currentTimeMs
      ) {
        active.firedIndexes.add(index);
        fired.push({
          key: `${active.stateRevision}:${index}`,
          index,
          event,
        });
      }
    });
    active.previousTimeMs = progress.currentTimeMs;

    return {
      accepted: true,
      stale: false,
      fired,
      currentTimeMs: progress.currentTimeMs,
    };
  }

  clear(): void {
    this.active = null;
  }

  get firedCount(): number {
    return this.active?.firedIndexes.size ?? 0;
  }

  get pendingCount(): number {
    return this.active ? this.active.events.length - this.active.firedIndexes.size : 0;
  }

  private markSkippedThrough(positionMs: number): void {
    if (!this.active) {
      return;
    }
    this.active.events.forEach((event, index) => {
      if (event.atMs <= positionMs) {
        this.active?.firedIndexes.add(index);
      }
    });
  }
}
