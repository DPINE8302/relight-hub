import type { AudienceCommandMessage, AudienceRuntimeEvent, InputSource, RuntimeSnapshot } from "../shared/contracts";
import { AudienceCommandMessageSchema } from "../shared/contracts";
import type { ExperienceConfig, ExperienceState, StateId } from "../shared/experience-config";
import { ExperienceStateMachine, type EngineEffect, type MachineDispatchResult, type MachineEvent } from "../shared/state-machine";
import type { SystemCheckGate } from "../shared/system-check";
import { IPC } from "./ipc-contracts";
import { logger } from "./logger";
import type { EngineCommand, EngineCoordinatorLike, WindowRegistry } from "./types";

const RESET_WATCHDOG_MS = 8_000;
const RECORDING_WATCHDOG_GRACE_MS = 2_000;
const MEDIA_WATCHDOG_GRACE_MS = 5_000;
const ACCELERATED_STEP_MS = 45;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface EngineCoordinatorOptions {
  configuration: ExperienceConfig;
  windows: WindowRegistry;
  accelerated: boolean;
  inputSource: InputSource;
}

/** Serializes every state mutation and owns deterministic main-process timers. */
export class EngineCoordinator implements EngineCoordinatorLike {
  private machine: ExperienceStateMachine;
  private configuration: ExperienceConfig;
  private readonly listeners = new Set<(snapshot: RuntimeSnapshot) => void>();
  private operation: Promise<void> = Promise.resolve();
  private stateTimer: NodeJS.Timeout | null = null;
  private timerDeadline = 0;
  private remainingTimerMs: number | null = null;
  private currentGate: SystemCheckGate | null = null;
  private disposed = false;
  private verificationRunning = false;
  private readonly verificationRendererStates = new Set<StateId>();
  private sceneTestActive = false;
  private sceneTestSequence = 0;
  private audienceReady = false;
  private readonly audienceReadyWaiters = new Set<() => void>();

  constructor(private readonly options: EngineCoordinatorOptions) {
    this.configuration = options.configuration;
    this.machine = new ExperienceStateMachine(this.configuration, { initialAtMs: Date.now() });
  }

  getSnapshot(): RuntimeSnapshot {
    return structuredClone(this.machine.snapshot);
  }

  boot(): Promise<void> {
    return this.enqueue(async () => {
      this.applyMachineEvent({ type: "BOOT_COMPLETE", atMs: Date.now() });
    });
  }

  dispatch(command: EngineCommand): Promise<{ accepted: boolean; reason?: string }> {
    return this.enqueue(async () => this.dispatchNow(command));
  }

  handleAudienceEvent(event: AudienceRuntimeEvent): Promise<void> {
    return this.enqueue(async () => {
      if (event.event === "READY") {
        this.audienceReady = true;
        for (const resolve of this.audienceReadyWaiters) resolve();
        this.audienceReadyWaiters.clear();
        this.sendRuntimeSync();
        return;
      }

      if (event.event === "MEDIA_ENDED") {
        const snapshot = this.machine.snapshot;
        if (!this.matchesAudienceIdentity(event.state, event.stateRevision, event.sessionId)) return;
        if (this.verificationRunning) this.verificationRendererStates.add(event.state);
        const state = this.stateById(snapshot.state);
        this.applyMachineEvent({
          type: "TIMELINE_TRANSITION",
          atMs: event.atMs,
          target: state.next,
          stateRevision: event.stateRevision,
          sessionId: event.sessionId,
        });
        return;
      }

      if (event.event === "MEDIA_PROGRESS") {
        if (!event.seeking && this.matchesAudienceIdentity(event.state, event.stateRevision, event.sessionId)) {
          const state = this.stateById(event.state);
          if (state.kind === "passive" && state.durationMs !== undefined && this.machine.snapshot.runMode === "RUNNING") {
            const remaining = Math.max(0, state.durationMs - event.mediaTimeMs);
            this.setMediaWatchdog(remaining + MEDIA_WATCHDOG_GRACE_MS, this.machine.snapshot);
          }
        }
        return;
      }

      if (event.event === "RECORDING_COMPLETE") {
        if (event.sessionId === null) return;
        if (this.verificationRunning && this.matchesAudienceIdentity(event.state, event.stateRevision, event.sessionId)) {
          this.verificationRendererStates.add(event.state);
        }
        this.applyMachineEvent({
          type: "RECORDING_COMPLETE",
          atMs: event.atMs,
          stateRevision: event.stateRevision,
          sessionId: event.sessionId,
          hasAudio: event.hasAudio,
        });
        return;
      }

      if (event.event === "RECORDING_ERROR") {
        if (event.sessionId === null) return;
        logger.warn("Audience recording capture failed; cinematic playback will continue without visitor voice", {
          code: event.code,
          message: event.message,
          stateRevision: event.stateRevision,
        });
        if (this.verificationRunning && this.matchesAudienceIdentity(event.state, event.stateRevision, event.sessionId)) {
          this.verificationRendererStates.add(event.state);
        }
        this.applyMachineEvent({
          type: "RECORDING_ERROR",
          atMs: event.atMs,
          stateRevision: event.stateRevision,
          sessionId: event.sessionId,
          code: event.code,
          message: event.message,
        });
        return;
      }

      if (event.event === "RESET_COMPLETE") {
        if (this.verificationRunning && this.matchesAudienceIdentity("RESETTING", event.stateRevision, event.sessionId)) {
          this.verificationRendererStates.add("RESETTING");
        }
        this.applyMachineEvent({
          type: "RESET_COMPLETE",
          atMs: event.atMs,
          stateRevision: event.stateRevision,
          sessionId: event.sessionId,
        });
        return;
      }

      if (event.event === "MEDIA_ERROR") {
        if (event.sessionId === null || !this.matchesAudienceIdentity(event.state, event.stateRevision, event.sessionId)) return;
        this.beginSafeRuntimeReset(event.atMs, event.code, "Audience media playback failed");
        return;
      }

      if (event.event === "AUDIO_STATUS" && event.status === "ERROR") {
        if (event.sessionId === null || !this.matchesAudienceIdentity(
          this.machine.snapshot.state,
          event.stateRevision,
          event.sessionId,
        )) return;
        this.beginSafeRuntimeReset(event.atMs, "AUDIO_RUNTIME_ERROR", "Audience audio runtime failed");
      }
    });
  }

  applySystemCheckGate(gate: SystemCheckGate): Promise<void> {
    return this.enqueue(async () => {
      this.currentGate = gate;
      this.applyMachineEvent({ type: "SYSTEM_CHECK", atMs: Date.now(), gate });
    });
  }

  reloadConfiguration(configuration: ExperienceConfig): Promise<void> {
    return this.enqueue(async () => {
      if (this.machine.snapshot.state !== "IDLE" && this.machine.snapshot.state !== "SYSTEM_CHECK") {
        throw new Error("Experience configuration can only be reloaded outside a visitor session");
      }
      this.clearStateTimer();
      this.configuration = configuration;
      this.machine = new ExperienceStateMachine(configuration, { initialAtMs: Date.now() });
      this.applyMachineEvent({ type: "BOOT_COMPLETE", atMs: Date.now() });
      if (this.currentGate !== null) {
        this.applyMachineEvent({ type: "SYSTEM_CHECK", atMs: Date.now(), gate: this.currentGate });
      }
      this.sendRuntimeSync();
      logger.info("Validated experience configuration reloaded outside a visitor session", {
        stateCount: configuration.states.length,
      });
    });
  }

  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isSceneTestActive(): boolean {
    return this.sceneTestActive;
  }

  syncWindows(): Promise<void> {
    return this.enqueue(async () => {
      this.broadcastSnapshot(this.machine.snapshot);
      this.sendRuntimeSync();
    });
  }

  previewSceneForSystemCheck(sceneId: string): Promise<boolean> {
    return this.enqueue(async () => {
      const snapshot = this.machine.snapshot;
      if (snapshot.state !== "IDLE" && snapshot.state !== "SYSTEM_CHECK") return false;
      const state = this.configuration.states.find((candidate) => candidate.id === sceneId);
      if (state === undefined || state.kind !== "passive" || !("media" in state) || state.media === undefined) {
        return false;
      }
      this.sceneTestSequence += 1;
      this.sendAudience({
        command: "ENTER_STATE",
        state: state.id,
        stateRevision: 1_100_000_000 + this.sceneTestSequence,
        sessionId: snapshot.sessionId,
      });
      return true;
    });
  }

  navigateTest(direction: "previous" | "next", occurredAt: number): Promise<{ accepted: boolean; reason?: string }> {
    return this.enqueue(async () => {
      const snapshot = this.machine.snapshot;
      if (snapshot.sessionId === null) return { accepted: false, reason: "Test navigation requires an active flow" };

      const narrative = this.configuration.states
        .map((state) => state.id)
        .filter((state) => state !== "BOOT" && state !== "SYSTEM_CHECK" && state !== "IDLE" &&
          state !== "RESETTING" && state !== "RECORDING");
      let target: StateId | undefined;
      if (snapshot.state === "RECORDING") {
        target = direction === "previous" ? "WAITING_FOR_RECORD" : "DREAM";
      } else {
        const index = narrative.indexOf(snapshot.state);
        if (index < 0) return { accepted: false, reason: "Current state is not Test-navigable" };
        target = narrative[index + (direction === "previous" ? -1 : 1)];
      }
      if (target === undefined) return { accepted: false, reason: `No ${direction} Test scene` };

      const recordingGateIndex = narrative.indexOf("WAITING_FOR_RECORD");
      const targetIndex = narrative.indexOf(target);
      const clearVisitorAudio = snapshot.state === "RECORDING" ||
        target === "WAITING_FOR_RECORD" ||
        (recordingGateIndex >= 0 && targetIndex <= recordingGateIndex);
      const result = this.applyMachineEvent({
        type: "TEST_JUMP",
        atMs: occurredAt,
        target,
        clearVisitorAudio,
      });
      return {
        accepted: result.accepted,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      };
    });
  }

  async waitForAudienceReady(timeoutMs = 5_000): Promise<boolean> {
    if (this.audienceReady) return true;
    return new Promise((resolve) => {
      let completed = false;
      const finish = (): void => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        this.audienceReadyWaiters.delete(onReady);
        resolve(this.audienceReady);
      };
      const onReady = (): void => finish();
      const timeout = setTimeout(finish, timeoutMs);
      this.audienceReadyWaiters.add(onReady);
    });
  }

  async runVerificationCycle(): Promise<boolean> {
    if (!this.options.accelerated) throw new Error("Placeholder verification requires an accelerated runtime mode");
    if (this.verificationRunning) throw new Error("Placeholder verification is already running");

    const visited = new Set<StateId>();
    const deadline = Date.now() + 20_000;
    let handledGateRevision = -1;
    this.verificationRunning = true;
    this.verificationRendererStates.clear();
    try {
      await this.enqueue(async () => {
        if (this.machine.snapshot.state !== "IDLE" || this.currentGate?.canStart !== true) {
          throw new Error("Placeholder verification requires an idle, explicitly simulated system check");
        }
        const result = this.applyMachineEvent({ type: "COMMAND", atMs: Date.now(), command: "START" });
        if (!result.accepted) throw new Error(result.reason ?? "Verification start was rejected");
      });

      while (Date.now() < deadline) {
        const snapshot = this.getSnapshot();
        visited.add(snapshot.state);
        if (snapshot.status === "FAULTED") {
          throw new Error(snapshot.error?.message ?? `Verification faulted in ${snapshot.state}`);
        }
        if (snapshot.state === "IDLE") break;

        if (snapshot.stateRevision !== handledGateRevision &&
          (snapshot.state === "WAITING_FOR_RECORD" || snapshot.state === "WAITING_FOR_CHOICE")) {
          handledGateRevision = snapshot.stateRevision;
          const action = snapshot.state === "WAITING_FOR_RECORD" ? "RECORD_BUTTON" : "CHOICE_BUTTON";
          await this.enqueue(async () => {
            const current = this.machine.snapshot;
            if (current.stateRevision !== snapshot.stateRevision || current.sessionId !== snapshot.sessionId) return;
            this.applyMachineEvent({
              type: "INPUT",
              input: {
                action,
                source: "SIMULATION",
                phase: "PRESSED",
                repeat: false,
                atMs: Date.now(),
              },
            });
          });
        }
        await delay(ACCELERATED_STEP_MS);
      }

      const finalSnapshot = this.getSnapshot();
      const expected = this.configuration.states
        .map((state) => state.id)
        .filter((state) => state !== "BOOT" && state !== "SYSTEM_CHECK");
      const rendererStates = this.configuration.states
        .filter((state) => state.kind === "passive")
        .map((state) => state.id);
      const completed = finalSnapshot.state === "IDLE" &&
        expected.every((state) => visited.has(state)) &&
        rendererStates.every((state) => this.verificationRendererStates.has(state));
      logger.info("Accelerated renderer-driven placeholder cycle completed", {
        completed,
        visitedStateCount: visited.size,
        rendererDrivenStateCount: this.verificationRendererStates.size,
      });
      return completed;
    } finally {
      this.verificationRunning = false;
      this.verificationRendererStates.clear();
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.clearStateTimer();
    await this.operation.catch(() => undefined);
    this.listeners.clear();
    for (const resolve of this.audienceReadyWaiters) resolve();
    this.audienceReadyWaiters.clear();
  }

  private dispatchNow(command: EngineCommand): { accepted: boolean; reason?: string } {
    if (command.type === "TEST_SCENE") return this.startSceneTest(command.sceneId);
    if (command.type === "STOP_SCENE_TEST") return this.stopSceneTest();

    let result: MachineDispatchResult;
    if (command.type === "RECORD_BUTTON" || command.type === "CHOICE_BUTTON") {
      result = this.applyMachineEvent({
        type: "INPUT",
        input: {
          action: command.type,
          source: command.inputSource ?? this.options.inputSource,
          phase: "PRESSED",
          repeat: false,
          atMs: command.occurredAt,
        },
      });
    } else {
      result = this.applyMachineEvent({
        type: "COMMAND",
        atMs: command.occurredAt,
        command: command.type,
      });
    }
    return {
      accepted: result.accepted,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
    };
  }

  private startSceneTest(sceneId: string | undefined): { accepted: boolean; reason?: string } {
    if (this.machine.snapshot.state !== "IDLE") return { accepted: false, reason: "Scene tests require IDLE" };
    if (sceneId === undefined || !this.configuration.states.some((state) => state.id === sceneId)) {
      return { accepted: false, reason: "Unknown scene test target" };
    }
    this.sceneTestActive = true;
    this.sceneTestSequence += 1;
    this.sendAudience({
      command: "ENTER_STATE",
      state: sceneId,
      stateRevision: 1_000_000_000 + this.sceneTestSequence,
      sessionId: null,
    });
    return { accepted: true };
  }

  private stopSceneTest(): { accepted: boolean; reason?: string } {
    if (!this.sceneTestActive) return { accepted: false, reason: "No scene test is active" };
    this.sceneTestActive = false;
    this.sendRuntimeSync();
    return { accepted: true };
  }

  private applyMachineEvent(event: MachineEvent): MachineDispatchResult {
    if (this.disposed) throw new Error("Engine coordinator is disposed");
    const previous = this.machine.snapshot;
    const result = this.machine.dispatch(event);
    if (!result.accepted) {
      logger.info("Engine event rejected", {
        eventType: event.type,
        state: previous.state,
        reason: result.reason,
      });
      return result;
    }

    for (const effect of result.effects) this.processEffect(effect);
    this.broadcastSnapshot(result.snapshot);
    this.refreshTimer(previous, result.snapshot);
    if (previous.stateRevision !== result.snapshot.stateRevision) {
      logger.info("Engine state transitioned", {
        from: previous.state,
        to: result.snapshot.state,
        stateRevision: result.snapshot.stateRevision,
      });
    }
    return result;
  }

  private processEffect(effect: EngineEffect): void {
    switch (effect.type) {
      case "ENTER_STATE":
        if (effect.state !== "RESETTING") {
          this.options.windows.get("audience")?.webContents.setAudioMuted(false);
        }
        this.sendAudience({
          command: "ENTER_STATE",
          state: effect.state,
          stateRevision: effect.stateRevision,
          sessionId: effect.sessionId,
        });
        return;
      case "START_RECORDING":
        this.sendAudience({
          command: "START_RECORDING",
          stateRevision: effect.stateRevision,
          sessionId: effect.sessionId,
          maximumDurationMs: this.options.accelerated
            ? Math.min(1_000, effect.maximumDurationMs)
            : effect.maximumDurationMs,
        });
        return;
      case "STOP_RECORDING":
        this.sendAudience({
          command: "STOP_RECORDING",
          stateRevision: effect.stateRevision,
          sessionId: effect.sessionId,
          reason: effect.reason,
        });
        return;
      case "SET_RUN_MODE":
        this.sendAudience({
          command: "SET_RUN_MODE",
          runMode: effect.runMode,
          stateRevision: effect.stateRevision,
          sessionId: effect.sessionId,
        });
        return;
      case "RESET_RUNTIME":
        this.options.windows.get("audience")?.webContents.setAudioMuted(true);
        this.sendAudience({
          command: "RESET",
          emergency: effect.emergency,
          stateRevision: effect.stateRevision,
          sessionId: effect.sessionId,
        });
        return;
      case "DISPOSE_RECORDING":
        this.sendAudience({
          command: "DISPOSE_RECORDING",
          stateRevision: effect.stateRevision,
          sessionId: effect.sessionId,
        });
    }
  }

  private sendAudience(command: AudienceCommandMessage): void {
    const validated = AudienceCommandMessageSchema.parse(command);
    this.options.windows.send("audience", IPC.audience.command, validated);
  }

  private sendRuntimeSync(): void {
    const snapshot = this.machine.snapshot;
    this.sendAudience({
      command: "SYNC_RUNTIME",
      sessionId: snapshot.sessionId,
      stateRevision: snapshot.stateRevision,
      snapshot,
    });
  }

  private broadcastSnapshot(snapshot: RuntimeSnapshot): void {
    const copy = structuredClone(snapshot);
    this.options.windows.send("audience", IPC.audience.snapshot, copy);
    for (const listener of this.listeners) listener(structuredClone(copy));
  }

  private refreshTimer(previous: RuntimeSnapshot | null, snapshot: RuntimeSnapshot): void {
    if (this.disposed) return;
    const stateChanged = previous === null || previous.stateRevision !== snapshot.stateRevision;
    if (stateChanged) {
      this.clearStateTimer();
      this.scheduleForCurrentState();
      return;
    }
    if (previous.runMode === "RUNNING" && snapshot.runMode === "PAUSED") {
      if (this.stateTimer !== null) {
        this.remainingTimerMs = Math.max(0, this.timerDeadline - Date.now());
        clearTimeout(this.stateTimer);
        this.stateTimer = null;
      }
      return;
    }
    if (previous.runMode === "PAUSED" && snapshot.runMode === "RUNNING") {
      this.scheduleForCurrentState(this.remainingTimerMs ?? undefined);
    }
  }

  private scheduleForCurrentState(remainingOverride?: number): void {
    const snapshot = this.machine.snapshot;
    const state = this.stateById(snapshot.state);
    if (state.kind === "passive" && snapshot.runMode === "RUNNING" && state.durationMs !== undefined) {
      const delayMs = remainingOverride ?? state.durationMs + MEDIA_WATCHDOG_GRACE_MS;
      this.setMediaWatchdog(delayMs, snapshot);
      return;
    }
    if (snapshot.state === "RECORDING" && snapshot.sessionId !== null) {
      const delayMs = this.options.accelerated
        ? 3_000
        : this.configuration.experience.recordingDurationMs + RECORDING_WATCHDOG_GRACE_MS;
      this.setStateTimer(delayMs, () => {
        this.applyMachineEvent({
          type: "RECORDING_ERROR",
          atMs: Date.now(),
          stateRevision: snapshot.stateRevision,
          sessionId: snapshot.sessionId as string,
          code: "RECORDING_TIMEOUT",
          message: "Recording completion timed out; continuing without captured audio",
        });
      });
      return;
    }
    if (snapshot.state === "RESETTING") {
      const delayMs = this.options.accelerated ? 250 : RESET_WATCHDOG_MS;
      this.setStateTimer(delayMs, () => {
        this.applyMachineEvent({
          type: "RESET_COMPLETE",
          atMs: Date.now(),
          stateRevision: snapshot.stateRevision,
          sessionId: snapshot.sessionId,
        });
      });
      return;
    }
    if (
      (snapshot.state === "WAITING_FOR_RECORD" || snapshot.state === "WAITING_FOR_CHOICE") &&
      snapshot.runMode === "RUNNING" &&
      this.configuration.experience.visitorWaitTimeoutMs !== null
    ) {
      const delayMs = remainingOverride ?? this.configuration.experience.visitorWaitTimeoutMs;
      this.setStateTimer(delayMs, () => {
        if (!this.matchesAudienceIdentity(snapshot.state, snapshot.stateRevision, snapshot.sessionId)) return;
        logger.info("Visitor wait timeout elapsed; starting a safe reset", {
          state: snapshot.state,
          stateRevision: snapshot.stateRevision,
        });
        this.applyMachineEvent({ type: "COMMAND", atMs: Date.now(), command: "RETURN_TO_IDLE" });
      });
    }
  }

  private setStateTimer(delayMs: number, callback: () => void): void {
    this.clearStateTimer();
    this.remainingTimerMs = null;
    this.timerDeadline = Date.now() + delayMs;
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      this.timerDeadline = 0;
      void this.enqueue(async () => callback()).catch((error: unknown) => {
        logger.error("Engine state timer failed", error);
      });
    }, delayMs);
  }

  private setMediaWatchdog(delayMs: number, snapshot: RuntimeSnapshot): void {
    this.setStateTimer(delayMs, () => {
      if (!this.matchesAudienceIdentity(snapshot.state, snapshot.stateRevision, snapshot.sessionId)) return;
      this.beginSafeRuntimeReset(
        Date.now(),
        "MEDIA_TIMELINE_TIMEOUT",
        "Audience media-time transition missed its watchdog deadline",
      );
    });
  }

  private beginSafeRuntimeReset(atMs: number, code: string, summary: string): void {
    const snapshot = this.machine.snapshot;
    if (snapshot.state === "RESETTING") {
      this.options.windows.get("audience")?.webContents.setAudioMuted(true);
      return;
    }
    this.clearStateTimer();
    this.sceneTestActive = false;
    this.options.windows.get("audience")?.webContents.setAudioMuted(true);
    logger.error(summary, undefined, {
      code,
      state: snapshot.state,
      stateRevision: snapshot.stateRevision,
    });
    const result = this.applyMachineEvent({
      type: "COMMAND",
      atMs,
      command: "EMERGENCY_RESET",
    });
    if (!result.accepted) {
      logger.error("Safe runtime reset was rejected", undefined, {
        code,
        state: snapshot.state,
        stateRevision: snapshot.stateRevision,
      });
    }
  }

  private clearStateTimer(): void {
    if (this.stateTimer !== null) clearTimeout(this.stateTimer);
    this.stateTimer = null;
    this.timerDeadline = 0;
    this.remainingTimerMs = null;
  }

  private stateById(stateId: StateId): ExperienceState {
    const state = this.configuration.states.find((candidate) => candidate.id === stateId);
    if (state === undefined) throw new Error(`Validated configuration is missing state ${stateId}`);
    return state;
  }

  private matchesAudienceIdentity(state: StateId, stateRevision: number, sessionId: string | null): boolean {
    const snapshot = this.machine.snapshot;
    return snapshot.state === state && snapshot.stateRevision === stateRevision && snapshot.sessionId === sessionId;
  }

  private enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }
}
