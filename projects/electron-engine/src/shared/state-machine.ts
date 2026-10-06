import type {
  InputEventMessage,
  OperatorCommand,
  RecordingStatus,
  RuntimeRunMode,
  RuntimeSnapshot,
  RuntimeStatus,
} from "./contracts";
import { RuntimeSnapshotSchema } from "./contracts";
import type { ExperienceConfig, ExperienceState, StateId } from "./experience-config";
import { stateMapFromConfig } from "./experience-config";
import type { SystemCheckGate } from "./system-check";

export type MachineEvent =
  | { readonly type: "BOOT_COMPLETE"; readonly atMs: number }
  | { readonly type: "SYSTEM_CHECK"; readonly atMs: number; readonly gate: SystemCheckGate }
  | {
      readonly type: "COMMAND";
      readonly atMs: number;
      readonly command: OperatorCommand;
      readonly sessionId?: string;
    }
  | {
      readonly type: "INPUT";
      readonly input: InputEventMessage;
      readonly elapsedInStateMs?: number;
    }
  | {
      readonly type: "TIMELINE_TRANSITION";
      readonly atMs: number;
      readonly target: StateId;
      readonly stateRevision: number;
      readonly sessionId: string | null;
    }
  | {
      readonly type: "RECORDING_COMPLETE";
      readonly atMs: number;
      readonly stateRevision: number;
      readonly sessionId: string;
      readonly hasAudio: boolean;
    }
  | {
      readonly type: "RECORDING_ERROR";
      readonly atMs: number;
      readonly stateRevision: number;
      readonly sessionId: string;
      readonly code: string;
      readonly message: string;
    }
  | {
      readonly type: "RESET_COMPLETE";
      readonly atMs: number;
      readonly stateRevision: number;
      readonly sessionId: string | null;
    }
  | {
      readonly type: "TEST_JUMP";
      readonly atMs: number;
      readonly target: StateId;
      readonly clearVisitorAudio: boolean;
    }
  | {
      readonly type: "FAULT";
      readonly atMs: number;
      readonly code: string;
      readonly message: string;
      readonly recoverable: boolean;
    };

export type EngineEffect =
  | {
      readonly type: "ENTER_STATE";
      readonly state: StateId;
      readonly stateRevision: number;
      readonly sessionId: string | null;
    }
  | {
      readonly type: "START_RECORDING";
      readonly stateRevision: number;
      readonly sessionId: string;
      readonly maximumDurationMs: number;
    }
  | {
      readonly type: "STOP_RECORDING";
      readonly stateRevision: number;
      readonly sessionId: string;
      readonly reason: "EARLY_STOP" | "RESET";
    }
  | {
      readonly type: "SET_RUN_MODE";
      readonly runMode: RuntimeRunMode;
      readonly stateRevision: number;
      readonly sessionId: string | null;
    }
  | {
      readonly type: "RESET_RUNTIME";
      readonly emergency: boolean;
      readonly stateRevision: number;
      readonly sessionId: string | null;
    }
  | {
      readonly type: "DISPOSE_RECORDING";
      readonly stateRevision: number;
      readonly sessionId: string | null;
    };

export interface MachineDispatchResult {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly snapshot: RuntimeSnapshot;
  readonly effects: readonly EngineEffect[];
}

export interface ExperienceStateMachineOptions {
  readonly initialAtMs?: number;
  readonly sessionIdFactory?: (sequence: number) => string;
}

const SYSTEM_STATES = new Set<StateId>(["BOOT", "SYSTEM_CHECK", "IDLE", "RESETTING"]);
const GATE_STATES = new Set<StateId>(["WAITING_FOR_RECORD", "WAITING_FOR_CHOICE"]);

const defaultSessionIdFactory = (sequence: number): string => `session-${sequence.toString().padStart(6, "0")}`;

const statusFor = (state: StateId, runMode: RuntimeRunMode): RuntimeStatus => {
  if (state === "BOOT" || state === "SYSTEM_CHECK") {
    return "CHECKING";
  }
  if (state === "IDLE") {
    return "IDLE";
  }
  if (state === "RESETTING") {
    return "RESETTING";
  }
  return runMode === "PAUSED" ? "PAUSED" : "RUNNING";
};

export class ExperienceStateMachine {
  readonly config: ExperienceConfig;

  private readonly states: ReadonlyMap<StateId, ExperienceState>;
  private readonly sessionIdFactory: (sequence: number) => string;
  private current: RuntimeSnapshot;
  private sessionSequence = 0;
  private recordingStopRequested = false;

  constructor(config: ExperienceConfig, options: ExperienceStateMachineOptions = {}) {
    this.config = config;
    this.states = stateMapFromConfig(config);
    this.sessionIdFactory = options.sessionIdFactory ?? defaultSessionIdFactory;
    const initialAtMs = options.initialAtMs ?? 0;
    this.current = RuntimeSnapshotSchema.parse({
      state: "BOOT",
      status: "CHECKING",
      runMode: "STOPPED",
      sessionId: null,
      stateRevision: 0,
      stateEnteredAtMs: initialAtMs,
      recording: "NONE",
      systemReadiness: "BLOCKED",
      lastTransition: null,
      error: null,
    });
  }

  get snapshot(): RuntimeSnapshot {
    return this.current;
  }

  get state(): ExperienceState {
    const state = this.states.get(this.current.state);
    if (!state) {
      throw new Error(`State ${this.current.state} is absent from the validated configuration`);
    }
    return state;
  }

  dispatch(event: MachineEvent): MachineDispatchResult {
    switch (event.type) {
      case "BOOT_COMPLETE":
        return this.handleBootComplete(event.atMs);
      case "SYSTEM_CHECK":
        return this.handleSystemCheck(event.gate, event.atMs);
      case "COMMAND":
        return this.handleCommand(event);
      case "INPUT":
        return this.handleInput(event.input, event.elapsedInStateMs);
      case "TIMELINE_TRANSITION":
        return this.handleTimelineTransition(event);
      case "RECORDING_COMPLETE":
        return this.handleRecordingComplete(event);
      case "RECORDING_ERROR":
        return this.handleRecordingError(event);
      case "RESET_COMPLETE":
        return this.handleResetComplete(event);
      case "TEST_JUMP":
        return this.handleTestJump(event);
      case "FAULT":
        return this.handleFault(event);
    }
  }

  private handleBootComplete(atMs: number): MachineDispatchResult {
    if (this.current.state !== "BOOT") {
      return this.reject("BOOT_COMPLETE is only valid while booting");
    }
    return this.enterState("SYSTEM_CHECK", "BOOT_COMPLETE", atMs);
  }

  private handleSystemCheck(gate: SystemCheckGate, atMs: number): MachineDispatchResult {
    this.current = RuntimeSnapshotSchema.parse({ ...this.current, systemReadiness: gate.readiness });

    if (this.current.state === "SYSTEM_CHECK") {
      return gate.canStart
        ? this.enterState("IDLE", "SYSTEM_CHECK_READY", atMs)
        : this.accept([], "System check remains blocked");
    }

    if (this.hasActiveSession() && gate.readiness === "BLOCKED") {
      return this.beginReset(atMs, false, "SYSTEM_CHECK_LOST");
    }

    return this.accept([], "System readiness updated");
  }

  private handleCommand(event: Extract<MachineEvent, { type: "COMMAND" }>): MachineDispatchResult {
    switch (event.command) {
      case "START": {
        if (this.current.state !== "IDLE") {
          return this.reject("START is only accepted from IDLE");
        }
        if (this.current.systemReadiness === "BLOCKED") {
          return this.reject("System Check blocks the visitor experience");
        }
        this.sessionSequence += 1;
        const sessionId = event.sessionId ?? this.sessionIdFactory(this.sessionSequence);
        if (sessionId.length === 0) {
          return this.reject("Session ID cannot be empty");
        }
        this.current = RuntimeSnapshotSchema.parse({
          ...this.current,
          sessionId,
          runMode: "RUNNING",
          recording: "NONE",
          error: null,
        });
        return this.enterState(this.state.next, "OPERATOR_START", event.atMs);
      }
      case "PAUSE": {
        if (!this.hasActiveSession() || this.current.runMode !== "RUNNING") {
          return this.reject("PAUSE requires a running visitor session");
        }
        if (this.current.state === "RECORDING") {
          return this.reject("Recording cannot be paused; reset if recovery is required");
        }
        return this.setRunMode("PAUSED");
      }
      case "RESUME": {
        if (!this.hasActiveSession() || this.current.runMode !== "PAUSED") {
          return this.reject("RESUME requires a paused visitor session");
        }
        return this.setRunMode("RUNNING");
      }
      case "RESTART_SCENE": {
        if (!this.hasActiveSession()) {
          return this.reject("RESTART_SCENE requires an active visitor session");
        }
        const effects: EngineEffect[] = [];
        if (this.current.state === "RECORDING" && this.current.sessionId) {
          effects.push({
            type: "STOP_RECORDING",
            stateRevision: this.current.stateRevision,
            sessionId: this.current.sessionId,
            reason: "RESET",
          });
        }
        this.recordingStopRequested = false;
        return this.reenterCurrentState("OPERATOR_RESTART_SCENE", event.atMs, effects);
      }
      case "SKIP_SCENE": {
        if (!this.hasActiveSession() || this.current.runMode !== "RUNNING") {
          return this.reject("SKIP_SCENE requires a running visitor session");
        }
        if (GATE_STATES.has(this.current.state) || this.current.state === "RECORDING") {
          return this.reject("Protected input and recording gates cannot be skipped");
        }
        return this.enterState(this.state.next, "OPERATOR_SKIP_SCENE", event.atMs);
      }
      case "RESET":
        return this.beginReset(event.atMs, false, "OPERATOR_RESET");
      case "EMERGENCY_RESET":
        return this.beginReset(event.atMs, true, "EMERGENCY_RESET");
      case "RETURN_TO_IDLE":
        return this.beginReset(event.atMs, false, "RETURN_TO_IDLE");
      case "TEST_SCENE":
      case "STOP_SCENE_TEST":
      case "UPDATE_SETTINGS":
      case "VALIDATE_CONFIGURATION":
      case "RELOAD_CONFIGURATION":
      case "RESTORE_DEFAULT_CONFIGURATION":
      case "CHOOSE_CONTENT_FOLDER":
      case "OPEN_CONTENT_FOLDER":
      case "EXPORT_LOGS":
      case "RUN_SYSTEM_CHECKS":
      case "RUN_SYSTEM_CHECK":
      case "SIMULATE_INPUT":
        return this.reject(`${event.command} is coordinator-owned and does not mutate the visitor state machine`);
    }
  }

  private handleInput(input: InputEventMessage, elapsedOverride?: number): MachineDispatchResult {
    if (input.phase !== "PRESSED" || input.repeat) {
      return this.reject("Only a non-repeating rising edge can trigger an experience input");
    }
    if (this.current.runMode === "PAUSED" || this.current.status === "FAULTED") {
      return this.reject("Experience input is disabled while paused or faulted");
    }

    if (input.action === "RECORD_BUTTON") {
      if (this.current.state === "WAITING_FOR_RECORD") {
        this.recordingStopRequested = false;
        this.current = RuntimeSnapshotSchema.parse({ ...this.current, recording: "RECORDING" });
        return this.enterState("RECORDING", "RED_BUTTON", input.atMs);
      }

      if (this.current.state === "RECORDING") {
        const elapsed = elapsedOverride ?? Math.max(0, input.atMs - this.current.stateEnteredAtMs);
        if (elapsed < this.config.experience.minimumEarlyStopMs) {
          return this.reject("RED early-stop guard has not elapsed");
        }
        if (this.recordingStopRequested) {
          return this.reject("Recording stop has already been requested");
        }
        if (!this.current.sessionId) {
          return this.reject("Recording state has no active session");
        }
        this.recordingStopRequested = true;
        return this.accept([
          {
            type: "STOP_RECORDING",
            stateRevision: this.current.stateRevision,
            sessionId: this.current.sessionId,
            reason: "EARLY_STOP",
          },
        ]);
      }

      return this.reject("RED is only accepted at the record gate or as a guarded recording stop");
    }

    if (this.current.state !== "WAITING_FOR_CHOICE") {
      return this.reject("WHITE is only accepted at the final choice gate");
    }
    return this.enterState("RELIGHT", "WHITE_BUTTON", input.atMs);
  }

  private handleTimelineTransition(
    event: Extract<MachineEvent, { type: "TIMELINE_TRANSITION" }>,
  ): MachineDispatchResult {
    if (!this.matchesRuntimeIdentity(event.stateRevision, event.sessionId)) {
      return this.reject("Stale timeline transition ignored");
    }
    if (this.current.runMode !== "RUNNING") {
      return this.reject("Timeline transitions are suspended unless running");
    }
    if (this.state.kind !== "passive") {
      return this.reject("Only passive states accept timeline transitions");
    }
    if (event.target !== this.state.next) {
      return this.reject("Timeline target does not match the deterministic next state");
    }
    return this.enterState(event.target, "TIMELINE_TRANSITION", event.atMs);
  }

  private handleRecordingComplete(
    event: Extract<MachineEvent, { type: "RECORDING_COMPLETE" }>,
  ): MachineDispatchResult {
    if (!this.matchesRuntimeIdentity(event.stateRevision, event.sessionId) || this.current.state !== "RECORDING") {
      return this.reject("Stale or out-of-state recording completion ignored");
    }
    this.recordingStopRequested = false;
    const recording: RecordingStatus = event.hasAudio ? "CAPTURED" : "UNAVAILABLE";
    this.current = RuntimeSnapshotSchema.parse({ ...this.current, recording });
    return this.enterState("DREAM", "RECORDING_COMPLETE", event.atMs);
  }

  private handleRecordingError(
    event: Extract<MachineEvent, { type: "RECORDING_ERROR" }>,
  ): MachineDispatchResult {
    if (!this.matchesRuntimeIdentity(event.stateRevision, event.sessionId) || this.current.state !== "RECORDING") {
      return this.reject("Stale or out-of-state recording error ignored");
    }
    this.recordingStopRequested = false;
    this.current = RuntimeSnapshotSchema.parse({
      ...this.current,
      recording: "ERROR",
      error: { code: event.code, message: event.message, recoverable: true },
    });
    return this.enterState("DREAM", "RECORDING_ERROR_CONTINUE", event.atMs);
  }

  private handleResetComplete(event: Extract<MachineEvent, { type: "RESET_COMPLETE" }>): MachineDispatchResult {
    if (this.current.state !== "RESETTING") {
      return this.reject("RESET_COMPLETE is only valid while resetting");
    }
    if (!this.matchesRuntimeIdentity(event.stateRevision, event.sessionId)) {
      return this.reject("Stale reset completion ignored");
    }
    return this.enterState("IDLE", "RESET_COMPLETE", event.atMs);
  }

  private handleTestJump(event: Extract<MachineEvent, { type: "TEST_JUMP" }>): MachineDispatchResult {
    if (!this.hasActiveSession()) return this.reject("Test navigation requires an active session");
    if (SYSTEM_STATES.has(event.target) || event.target === "RECORDING") {
      return this.reject("Test navigation cannot jump into a system or active recording state");
    }

    const effects: EngineEffect[] = [];
    if (this.current.state === "RECORDING" && this.current.sessionId !== null) {
      effects.push({
        type: "STOP_RECORDING",
        stateRevision: this.current.stateRevision,
        sessionId: this.current.sessionId,
        reason: "RESET",
      });
    }
    if (event.clearVisitorAudio) {
      effects.push({
        type: "DISPOSE_RECORDING",
        stateRevision: this.current.stateRevision,
        sessionId: this.current.sessionId,
      });
      this.current = RuntimeSnapshotSchema.parse({ ...this.current, recording: "NONE" });
      this.recordingStopRequested = false;
    }
    return this.enterState(event.target, "TEST_MANUAL_NAVIGATION", event.atMs, effects);
  }

  private handleFault(event: Extract<MachineEvent, { type: "FAULT" }>): MachineDispatchResult {
    this.current = RuntimeSnapshotSchema.parse({
      ...this.current,
      status: "FAULTED",
      runMode: "STOPPED",
      error: { code: event.code, message: event.message, recoverable: event.recoverable },
    });
    return this.accept([
      {
        type: "SET_RUN_MODE",
        runMode: "STOPPED",
        stateRevision: this.current.stateRevision,
        sessionId: this.current.sessionId,
      },
    ]);
  }

  private beginReset(atMs: number, emergency: boolean, cause: string): MachineDispatchResult {
    if (this.current.state === "RESETTING") {
      const effects: EngineEffect[] = [{
        type: "RESET_RUNTIME",
        emergency,
        stateRevision: this.current.stateRevision,
        sessionId: this.current.sessionId,
      }];
      return this.accept(effects, "Reset cleanup reissued");
    }

    return this.enterState("RESETTING", cause, atMs, [], emergency);
  }

  private setRunMode(runMode: RuntimeRunMode): MachineDispatchResult {
    this.current = RuntimeSnapshotSchema.parse({
      ...this.current,
      runMode,
      status: statusFor(this.current.state, runMode),
    });
    return this.accept([
      {
        type: "SET_RUN_MODE",
        runMode,
        stateRevision: this.current.stateRevision,
        sessionId: this.current.sessionId,
      },
    ]);
  }

  private reenterCurrentState(
    cause: string,
    atMs: number,
    prefixedEffects: readonly EngineEffect[],
  ): MachineDispatchResult {
    return this.enterState(this.current.state, cause, atMs, prefixedEffects);
  }

  private enterState(
    target: StateId,
    cause: string,
    atMs: number,
    prefixedEffects: readonly EngineEffect[] = [],
    emergencyReset = false,
  ): MachineDispatchResult {
    if (!this.states.has(target)) {
      return this.reject(`Target state ${target} is not configured`);
    }

    const from = this.current.state;
    const stateRevision = this.current.stateRevision + 1;
    let runMode = this.current.runMode;
    let sessionId = this.current.sessionId;
    let recording = this.current.recording;
    let error = this.current.error;

    if (target === "IDLE" || target === "SYSTEM_CHECK" || target === "BOOT" || target === "RESETTING") {
      runMode = "STOPPED";
    } else if (runMode === "STOPPED") {
      runMode = "RUNNING";
    }

    if (target === "IDLE") {
      sessionId = null;
      recording = "NONE";
      error = null;
      this.recordingStopRequested = false;
    }

    if (target === "RECORDING") {
      recording = "RECORDING";
      this.recordingStopRequested = false;
    }

    this.current = RuntimeSnapshotSchema.parse({
      ...this.current,
      state: target,
      status: statusFor(target, runMode),
      runMode,
      sessionId,
      stateRevision,
      stateEnteredAtMs: atMs,
      recording,
      error,
      lastTransition: { from, to: target, cause, atMs, stateRevision },
    });

    const enterEffect: EngineEffect = { type: "ENTER_STATE", state: target, stateRevision, sessionId };
    const effects: EngineEffect[] = target === "RESETTING"
      ? [
          {
            type: "RESET_RUNTIME",
            emergency: emergencyReset,
            stateRevision,
            sessionId,
          },
          ...prefixedEffects,
          enterEffect,
        ]
      : [...prefixedEffects, enterEffect];

    if (target === "RECORDING" && sessionId) {
      effects.push({
        type: "START_RECORDING",
        stateRevision,
        sessionId,
        maximumDurationMs: this.config.experience.recordingDurationMs,
      });
    }

    return this.accept(effects);
  }

  private hasActiveSession(): boolean {
    return this.current.sessionId !== null && !SYSTEM_STATES.has(this.current.state);
  }

  private matchesRuntimeIdentity(stateRevision: number, sessionId: string | null): boolean {
    return stateRevision === this.current.stateRevision && sessionId === this.current.sessionId;
  }

  private accept(effects: readonly EngineEffect[], _note?: string): MachineDispatchResult {
    return { accepted: true, snapshot: this.current, effects };
  }

  private reject(reason: string): MachineDispatchResult {
    return { accepted: false, reason, snapshot: this.current, effects: [] };
  }
}
