import type { TimelineAction } from "../shared/types";

export class TimelineScheduler {
  private revision = -1;
  private actions: TimelineAction[] = [];
  private readonly fired = new Set<string>();
  private previousMs = -1;

  reset(revision: number, actions: TimelineAction[]): void {
    this.revision = revision;
    this.actions = [...actions].sort((left, right) => left.atMs - right.atMs);
    this.fired.clear();
    this.previousMs = -1;
  }

  notifySeek(revision: number, elapsedMs: number): void {
    if (revision !== this.revision || !Number.isFinite(elapsedMs)) return;
    const currentMs = Math.max(0, elapsedMs);
    if (currentMs > this.previousMs) {
      for (const action of this.actions) {
        if (action.atMs <= currentMs) this.fired.add(action.id);
      }
    }
    this.previousMs = currentMs;
  }

  tick(revision: number, elapsedMs: number, seeking = false): TimelineAction[] {
    if (revision !== this.revision || !Number.isFinite(elapsedMs)) return [];
    if (seeking) {
      this.notifySeek(revision, elapsedMs);
      return [];
    }
    const currentMs = Math.max(0, elapsedMs);
    if (currentMs < this.previousMs) {
      this.previousMs = currentMs;
      return [];
    }
    const lowerBound = this.previousMs;
    const due = this.actions.filter((action) => {
      if (this.fired.has(action.id)) return false;
      return action.atMs > lowerBound && action.atMs <= currentMs;
    });
    for (const action of due) this.fired.add(action.id);
    this.previousMs = currentMs;
    return due;
  }
}
