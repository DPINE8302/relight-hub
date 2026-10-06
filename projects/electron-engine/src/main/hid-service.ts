import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  HidAccessStatus,
  HidDeviceDescriptor,
  HidElementBinding,
  HidLastInput,
  HidState,
  ProductionInputRole,
} from "./types";
import {
  HID_MAX_LINE_BYTES,
  HidDeviceDescriptorSchema,
  HidElementBindingSchema,
  HidHelperEventSchema,
  parseHidHelperLine,
  serializeHidCommand,
  type HidHelperCommand,
  type HidHelperEvent,
  type HidHelperResponse,
} from "./hid-protocol";
import { logger } from "./logger";

const FIXTURE_ENVIRONMENT_FLAG = "RELIGHT_E2E_HID_FIXTURE";
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 7_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const ACCESS_REQUEST_TIMEOUT_MS = 60_000;
const INPUT_DEBOUNCE_MS = 250;
const RELEASE_SETTLE_MS = 35;

const SAFE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  accessDenied: "Input Monitoring permission is not available.",
  deviceLimit: "Too many USB input devices are connected.",
  helperExited: "The USB input service stopped unexpectedly.",
  helperSpawnFailed: "The USB input service could not start.",
  heartbeatTimeout: "The USB input service stopped responding.",
  invalidBinding: "The input assignment was rejected.",
  invalidCommand: "The USB input request was rejected.",
  learningUnavailable: "Input learning requires the foreground app.",
  managerOpenFailed: "The USB input service could not access devices.",
  messageTooLarge: "The USB input service sent an oversized message.",
  protocolViolation: "The USB input service returned invalid data.",
  requestTimeout: "The USB input service did not respond in time.",
  staleLearningToken: "The input-learning session is no longer active.",
  unsupportedCommand: "The USB input request is not supported.",
};

export interface HidServiceOptions {
  helperPath: string;
  e2e: boolean;
  initialBindings?: Readonly<Record<ProductionInputRole, HidElementBinding | null>> | undefined;
  heartbeatTimeoutMs?: number | undefined;
  startupTimeoutMs?: number | undefined;
}

export type HidServiceEvent =
  | {
      type: "input";
      source: "NATIVE_HID";
      role: ProductionInputRole;
      deviceId: string;
      elementId: string;
      edge: "down" | "up";
      occurredAt: number;
    }
  | {
      type: "deviceRemoved";
      deviceId: string;
      assignedRoles: ProductionInputRole[];
      occurredAt: number;
    }
  | {
      type: "accessChanged";
      access: HidAccessStatus;
      previousAccess: HidAccessStatus;
      occurredAt: number;
    }
  | {
      type: "fault";
      code: string;
      message: string;
      recoverable: boolean;
      occurredAt: number;
    }
  | { type: "heartbeat"; access: HidAccessStatus; sequence: number; occurredAt: number };

interface PendingRequest {
  command: HidHelperCommand["command"];
  resolve: (response: HidHelperResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface PendingRelease {
  event: Extract<HidHelperEvent, { event: "input.edge" }>;
  timer: NodeJS.Timeout;
}

export class HidServiceError extends Error {
  constructor(
    public readonly code: string,
    message = safeErrorMessage(code),
  ) {
    super(message);
    this.name = "HidServiceError";
  }
}

export class HidService {
  private state: HidState;
  private readonly stateListeners = new Set<(state: HidState) => void>();
  private readonly eventListeners = new Set<(event: HidServiceEvent) => void>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly fixtureMode: boolean;
  private readonly heartbeatTimeoutMs: number;
  private readonly startupTimeoutMs: number;
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = Buffer.alloc(0);
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private lastHeartbeatAt = 0;
  private started = false;
  private stopping = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private readonly inputDown: Record<ProductionInputRole, boolean> = {
    RECORD_BUTTON: false,
    CHOICE_BUTTON: false,
  };
  private readonly lastInputDownAt: Record<ProductionInputRole, number> = {
    RECORD_BUTTON: 0,
    CHOICE_BUTTON: 0,
  };
  private readonly pendingReleases = new Map<ProductionInputRole, PendingRelease>();

  constructor(private readonly options: HidServiceOptions) {
    const fixtureRequested = process.env[FIXTURE_ENVIRONMENT_FLAG] === "1";
    if (fixtureRequested && !options.e2e) {
      throw new Error("Native HID fixtures require explicit E2E runtime mode");
    }
    this.fixtureMode = fixtureRequested && options.e2e;
    this.heartbeatTimeoutMs = boundedTimeout(options.heartbeatTimeoutMs, DEFAULT_HEARTBEAT_TIMEOUT_MS);
    this.startupTimeoutMs = boundedTimeout(options.startupTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    this.state = {
      access: "unknown",
      helperAvailable: false,
      devices: [],
      bindings: copyBindings(options.initialBindings),
      learn: null,
      lastInput: null,
      error: null,
    };
  }

  async start(): Promise<void> {
    if (this.readyPromise !== null) return this.readyPromise;
    this.started = true;
    this.stopping = false;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    if (this.fixtureMode) {
      this.state.helperAvailable = true;
      this.state.error = null;
      this.lastHeartbeatAt = Date.now();
      this.emitState();
      this.readyResolve?.();
    } else {
      try {
        await this.spawnHelper();
      } catch (error) {
        const startupError = error instanceof Error ? error : new HidServiceError("helperSpawnFailed");
        this.failStartup(startupError);
        await this.readyPromise.catch(() => undefined);
        throw startupError;
      }
    }

    await this.readyPromise;
    await this.setBindings(this.state.bindings);
  }

  getState(): HidState {
    return structuredClone(this.state);
  }

  subscribeState(listener: (state: HidState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  subscribeEvents(listener: (event: HidServiceEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  recordResolvedInput(
    source: HidLastInput["source"],
    role: HidLastInput["role"],
    accepted: boolean,
    occurredAt: number,
    detail: string,
  ): void {
    this.state.lastInput = { source, role, accepted, occurredAt, detail: safeInputDetail(detail) };
    this.emitState();
  }

  async refreshDevices(): Promise<HidDeviceDescriptor[]> {
    const response = await this.sendRequest({
      version: 1,
      kind: "command",
      command: "inventory.refresh",
      requestId: randomUUID(),
    });
    if (!response.ok || response.command !== "inventory.refresh") throw responseError(response);

    const connected = new Map<string, HidDeviceDescriptor>(
      response.devices.map((device) => [device.id, device]),
    );
    for (const existing of this.state.devices) {
      if (connected.has(existing.id) || !this.bindingUsesDevice(existing.id)) continue;
      connected.set(existing.id, { ...existing, connected: false });
    }
    this.state.devices = [...connected.values()].sort((left, right) => left.label.localeCompare(right.label));
    this.state.error = null;
    this.emitState();
    return structuredClone(this.state.devices);
  }

  async requestAccess(): Promise<HidAccessStatus> {
    const response = await this.sendRequest(
      { version: 1, kind: "command", command: "access.request", requestId: randomUUID() },
      ACCESS_REQUEST_TIMEOUT_MS,
    );
    if (!response.ok || response.command !== "access.request") throw responseError(response);
    this.updateAccess(response.access, Date.now());
    if (response.access === "granted") await this.refreshDevices();
    return response.access;
  }

  async setForeground(active: boolean): Promise<void> {
    const response = await this.sendRequest({
      version: 1,
      kind: "command",
      command: "foreground.set",
      requestId: randomUUID(),
      active,
    });
    if (!response.ok || response.command !== "foreground.set") throw responseError(response);
    if (!active) {
      this.clearPendingReleases();
      this.inputDown.RECORD_BUTTON = false;
      this.inputDown.CHOICE_BUTTON = false;
      if (this.state.learn !== null) {
        this.state.learn = null;
        this.emitState();
      }
    }
  }

  async beginLearning(role: ProductionInputRole): Promise<string> {
    const response = await this.sendRequest({
      version: 1,
      kind: "command",
      command: "learn.start",
      requestId: randomUUID(),
      role,
    });
    if (!response.ok || response.command !== "learn.start") throw responseError(response);
    this.state.learn = {
      token: response.token,
      role,
      phase: "waiting",
      pressCount: 0,
      candidate: null,
      message: "Press and release the control twice.",
    };
    this.emitState();
    return response.token;
  }

  async cancelLearning(): Promise<void> {
    const token = this.state.learn?.token;
    const command: HidHelperCommand = token === undefined
      ? { version: 1, kind: "command", command: "learn.cancel", requestId: randomUUID() }
      : { version: 1, kind: "command", command: "learn.cancel", requestId: randomUUID(), token };
    const response = await this.sendRequest(command);
    if (!response.ok || response.command !== "learn.cancel") throw responseError(response);
    this.state.learn = null;
    this.emitState();
  }

  async confirmBinding(binding: HidElementBinding): Promise<void> {
    const validated = HidElementBindingSchema.parse(binding) as HidElementBinding;
    const learning = this.state.learn;
    if (
      learning === null ||
      learning.phase !== "ready" ||
      learning.role !== validated.role ||
      learning.candidate?.deviceId !== validated.deviceId ||
      learning.candidate.elementId !== validated.elementId
    ) {
      throw new HidServiceError("staleLearningToken");
    }
    const otherRole = validated.role === "RECORD_BUTTON" ? "CHOICE_BUTTON" : "RECORD_BUTTON";
    const other = this.state.bindings[otherRole];
    if (other?.deviceId === validated.deviceId && other.elementId === validated.elementId) {
      throw new HidServiceError("invalidBinding");
    }
    await this.setBindings({ ...this.state.bindings, [validated.role]: validated });
    this.state.learn = null;
    this.emitState();
  }

  async forgetBinding(role: ProductionInputRole): Promise<void> {
    await this.setBindings({ ...this.state.bindings, [role]: null });
  }

  async setBindings(bindings: Readonly<Record<ProductionInputRole, HidElementBinding | null>>): Promise<void> {
    const next = copyBindings(bindings);
    const compact = [next.RECORD_BUTTON, next.CHOICE_BUTTON].filter(
      (binding): binding is HidElementBinding => binding !== null,
    );
    const response = await this.sendRequest({
      version: 1,
      kind: "command",
      command: "assignments.set",
      requestId: randomUUID(),
      bindings: compact,
    });
    if (!response.ok || response.command !== "assignments.set") throw responseError(response);
    this.state.bindings = next;
    this.clearPendingReleases();
    this.inputDown.RECORD_BUTTON = false;
    this.inputDown.CHOICE_BUTTON = false;
    this.emitState();
  }

  injectFixtureEvent(event: HidHelperEvent): void {
    if (!this.fixtureMode) throw new Error("Native HID fixture injection is unavailable outside explicit E2E mode");
    this.handleEvent(HidHelperEventSchema.parse(event));
  }

  async dispose(): Promise<void> {
    if (!this.started) return;
    this.stopping = true;
    this.clearPendingReleases();
    this.stopTimers();
    this.rejectPending(new HidServiceError("helperExited"));
    if (this.child !== null) {
      const child = this.child;
      try {
        child.stdin.write(
          serializeHidCommand({ version: 1, kind: "command", command: "shutdown", requestId: randomUUID() }),
        );
      } catch {
        // The process is already gone.
      }
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.killed) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve();
        }, 300);
        timer.unref();
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.child = null;
    this.state.helperAvailable = false;
    this.state.learn = null;
    this.started = false;
    this.readyPromise = null;
    this.emitState();
  }

  private async spawnHelper(): Promise<void> {
    if (!isAbsolute(this.options.helperPath)) throw new Error("Native HID helper path must be absolute");
    try {
      await access(this.options.helperPath, fsConstants.X_OK);
    } catch {
      throw new HidServiceError("helperSpawnFailed");
    }

    const child = spawn(this.options.helperPath, ["--stdio"], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: { LANG: "en_US.UTF-8" },
      windowsHide: true,
    });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.receiveStdout(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      logger.warn("Native HID helper wrote to stderr", { byteCount: Math.min(chunk.byteLength, HID_MAX_LINE_BYTES) });
    });
    child.on("error", () => this.protocolFault("helperSpawnFailed"));
    child.on("exit", () => {
      this.child = null;
      if (!this.stopping) this.protocolFault("helperExited");
    });
    this.startupTimer = setTimeout(() => this.protocolFault("requestTimeout"), this.startupTimeoutMs);
    this.startupTimer.unref();
  }

  private receiveStdout(chunk: Buffer): void {
    if (this.stopping) return;
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (true) {
      const newline = this.stdoutBuffer.indexOf(0x0a);
      if (newline === -1) break;
      const line = this.stdoutBuffer.subarray(0, newline);
      this.stdoutBuffer = this.stdoutBuffer.subarray(newline + 1);
      if (line.byteLength === 0) continue;
      if (line.byteLength > HID_MAX_LINE_BYTES) {
        this.protocolFault("messageTooLarge");
        return;
      }
      try {
        this.handleMessage(parseHidHelperLine(line));
      } catch {
        this.protocolFault("protocolViolation");
        return;
      }
    }
    if (this.stdoutBuffer.byteLength > HID_MAX_LINE_BYTES) this.protocolFault("messageTooLarge");
  }

  private handleMessage(message: ReturnType<typeof parseHidHelperLine>): void {
    if (message.kind === "response") {
      const request = this.pending.get(message.requestId);
      if (request === undefined || request.command !== message.command) {
        this.protocolFault("protocolViolation");
        return;
      }
      clearTimeout(request.timer);
      this.pending.delete(message.requestId);
      request.resolve(message);
      return;
    }
    this.handleEvent(message);
  }

  private handleEvent(event: HidHelperEvent): void {
    switch (event.event) {
      case "ready":
        this.lastHeartbeatAt = Date.now();
        this.state.helperAvailable = true;
        this.state.error = null;
        this.updateAccess(event.access, event.occurredAt);
        if (this.startupTimer !== null) clearTimeout(this.startupTimer);
        this.startupTimer = null;
        this.startHeartbeatWatchdog();
        this.readyResolve?.();
        break;
      case "device.added": {
        const index = this.state.devices.findIndex((device) => device.id === event.device.id);
        if (index === -1) this.state.devices = [...this.state.devices, event.device];
        else this.state.devices[index] = event.device;
        this.state.devices.sort((left, right) => left.label.localeCompare(right.label));
        this.emitState();
        break;
      }
      case "device.removed": {
        this.state.devices = this.state.devices.map((device) =>
          device.id === event.deviceId ? { ...device, connected: false } : device,
        );
        const assignedRoles = roles().filter((role) => this.state.bindings[role]?.deviceId === event.deviceId);
        for (const role of assignedRoles) {
          this.cancelPendingRelease(role);
          this.inputDown[role] = false;
        }
        this.emitState();
        this.emitEvent({
          type: "deviceRemoved",
          deviceId: event.deviceId,
          assignedRoles,
          occurredAt: event.occurredAt,
        });
        break;
      }
      case "access.changed":
        this.updateAccess(event.access, event.occurredAt);
        break;
      case "learn.progress":
        if (this.state.learn?.token !== event.token || this.state.learn.role !== event.role) break;
        this.state.learn = {
          ...this.state.learn,
          phase: event.phase,
          pressCount: event.pressCount,
          message: event.pressCount === 0 ? "Release, then press the same control again." : "Press once more.",
        };
        this.emitState();
        break;
      case "learn.candidate":
        if (this.state.learn?.token !== event.token || this.state.learn.role !== event.role) break;
        this.state.learn = {
          ...this.state.learn,
          phase: "ready",
          pressCount: 2,
          candidate: event.binding as HidElementBinding,
          message: "Control recognized. Confirm this assignment.",
        };
        this.emitState();
        break;
      case "input.edge":
        this.handleInputEdge(event);
        break;
      case "heartbeat":
        this.lastHeartbeatAt = Date.now();
        this.updateAccess(event.access, event.occurredAt);
        this.emitEvent({
          type: "heartbeat",
          access: event.access,
          sequence: event.sequence,
          occurredAt: event.occurredAt,
        });
        break;
      case "error":
        this.emitFault(event.code, event.recoverable, event.occurredAt);
        if (!event.recoverable) this.child?.kill("SIGTERM");
        break;
    }
  }

  private handleInputEdge(event: Extract<HidHelperEvent, { event: "input.edge" }>): void {
    const binding = this.state.bindings[event.role];
    if (binding?.deviceId !== event.deviceId || binding.elementId !== event.elementId) return;
    const down = event.edge === "down";
    if (!down) {
      if (!this.inputDown[event.role] || this.pendingReleases.has(event.role)) return;
      const timer = setTimeout(() => this.flushPendingRelease(event.role), RELEASE_SETTLE_MS);
      timer.unref();
      this.pendingReleases.set(event.role, { event, timer });
      return;
    }

    const pendingRelease = this.pendingReleases.get(event.role);
    if (pendingRelease !== undefined) {
      if (event.occurredAt - pendingRelease.event.occurredAt < RELEASE_SETTLE_MS) {
        this.cancelPendingRelease(event.role);
        return;
      }
      this.flushPendingRelease(event.role);
    }
    if (this.inputDown[event.role]) return;
    if (event.occurredAt - this.lastInputDownAt[event.role] < INPUT_DEBOUNCE_MS) return;
    this.inputDown[event.role] = true;
    this.lastInputDownAt[event.role] = event.occurredAt;
    this.emitAcceptedInputEdge(event, binding);
  }

  private flushPendingRelease(role: ProductionInputRole): void {
    const pending = this.pendingReleases.get(role);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pendingReleases.delete(role);
    const binding = this.state.bindings[role];
    if (
      !this.inputDown[role] ||
      binding?.deviceId !== pending.event.deviceId ||
      binding.elementId !== pending.event.elementId
    ) return;
    this.inputDown[role] = false;
    this.emitAcceptedInputEdge(pending.event, binding);
  }

  private emitAcceptedInputEdge(
    event: Extract<HidHelperEvent, { event: "input.edge" }>,
    binding: HidElementBinding,
  ): void {
    this.state.bindings[event.role] = { ...binding, lastSeenAt: event.occurredAt };
    this.emitState();
    this.emitEvent({
      type: "input",
      source: "NATIVE_HID",
      role: event.role,
      deviceId: event.deviceId,
      elementId: event.elementId,
      edge: event.edge,
      occurredAt: event.occurredAt,
    });
  }

  private cancelPendingRelease(role: ProductionInputRole): void {
    const pending = this.pendingReleases.get(role);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pendingReleases.delete(role);
  }

  private clearPendingReleases(): void {
    for (const role of this.pendingReleases.keys()) this.cancelPendingRelease(role);
  }

  private updateAccess(accessStatus: HidAccessStatus, occurredAt: number): void {
    const previousAccess = this.state.access;
    if (previousAccess === accessStatus) return;
    this.state.access = accessStatus;
    this.emitState();
    this.emitEvent({ type: "accessChanged", access: accessStatus, previousAccess, occurredAt });
  }

  private async sendRequest(command: HidHelperCommand, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<HidHelperResponse> {
    if (!this.started) throw new HidServiceError("helperExited");
    if (this.fixtureMode) return this.fixtureResponse(command);
    const child = this.child;
    if (child === null || child.stdin.destroyed) throw new HidServiceError("helperExited");
    const payload = serializeHidCommand(command);
    return new Promise<HidHelperResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.requestId);
        reject(new HidServiceError("requestTimeout"));
      }, timeoutMs);
      timer.unref();
      this.pending.set(command.requestId, { command: command.command, resolve, reject, timer });
      child.stdin.write(payload, (error) => {
        if (error === null || error === undefined) return;
        const pending = this.pending.get(command.requestId);
        if (pending === undefined) return;
        clearTimeout(pending.timer);
        this.pending.delete(command.requestId);
        pending.reject(new HidServiceError("helperExited"));
      });
    });
  }

  private fixtureResponse(command: HidHelperCommand): HidHelperResponse {
    const base = { version: 1 as const, kind: "response" as const, requestId: command.requestId, ok: true as const };
    switch (command.command) {
      case "inventory.refresh":
        return {
          ...base,
          command: command.command,
          devices: this.state.devices
            .filter((device) => device.connected)
            .map((device) => HidDeviceDescriptorSchema.parse(device)),
        };
      case "access.request":
        this.updateAccess("granted", Date.now());
        return { ...base, command: command.command, access: "granted" };
      case "learn.start":
        return { ...base, command: command.command, token: randomUUID() };
      case "ping":
        return { ...base, command: command.command, occurredAt: Date.now() };
      case "foreground.set":
      case "learn.cancel":
      case "assignments.set":
      case "shutdown":
        return { ...base, command: command.command };
    }
  }

  private startHeartbeatWatchdog(): void {
    if (this.fixtureMode || this.heartbeatTimer !== null) return;
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastHeartbeatAt > this.heartbeatTimeoutMs) this.protocolFault("heartbeatTimeout");
    }, Math.min(1_000, Math.max(250, Math.floor(this.heartbeatTimeoutMs / 3))));
    this.heartbeatTimer.unref();
  }

  private protocolFault(code: string): void {
    if (this.stopping) return;
    const error = new HidServiceError(code);
    this.state.helperAvailable = false;
    this.state.error = error.message;
    this.state.learn = null;
    this.clearPendingReleases();
    this.emitState();
    this.emitFault(code, false, Date.now());
    this.rejectPending(error);
    this.readyReject?.(error);
    this.stopTimers();
    this.child?.kill("SIGTERM");
  }

  private emitFault(code: string, recoverable: boolean, occurredAt: number): void {
    const message = safeErrorMessage(code);
    if (!recoverable) {
      this.state.error = message;
      this.emitState();
    }
    logger.warn("Native HID service fault", { code, recoverable });
    this.emitEvent({ type: "fault", code, message, recoverable, occurredAt });
  }

  private failStartup(error: Error): void {
    this.state.helperAvailable = false;
    this.state.error = error.message;
    this.emitState();
    this.readyReject?.(error);
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  private stopTimers(): void {
    if (this.startupTimer !== null) clearTimeout(this.startupTimer);
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.startupTimer = null;
    this.heartbeatTimer = null;
  }

  private emitState(): void {
    const snapshot = this.getState();
    for (const listener of this.stateListeners) listener(snapshot);
  }

  private emitEvent(event: HidServiceEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  private bindingUsesDevice(deviceId: string): boolean {
    return roles().some((role) => this.state.bindings[role]?.deviceId === deviceId);
  }
}

function copyBindings(
  bindings?: Readonly<Record<ProductionInputRole, HidElementBinding | null>>,
): Record<ProductionInputRole, HidElementBinding | null> {
  return {
    RECORD_BUTTON: bindings?.RECORD_BUTTON === null || bindings?.RECORD_BUTTON === undefined
      ? null
      : structuredClone(bindings.RECORD_BUTTON),
    CHOICE_BUTTON: bindings?.CHOICE_BUTTON === null || bindings?.CHOICE_BUTTON === undefined
      ? null
      : structuredClone(bindings.CHOICE_BUTTON),
  };
}

function roles(): ProductionInputRole[] {
  return ["RECORD_BUTTON", "CHOICE_BUTTON"];
}

function boundedTimeout(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Math.min(120_000, Math.max(250, Math.floor(value)));
}

function safeErrorMessage(code: string): string {
  return SAFE_ERROR_MESSAGES[code] ?? "The USB input service encountered an error.";
}

function responseError(response: HidHelperResponse): HidServiceError {
  return response.ok ? new HidServiceError("protocolViolation") : new HidServiceError(response.error.code);
}

function safeInputDetail(detail: string): string {
  if (/(?:data|blob|https?):|(?:^|\s)\/(?:Users|Volumes|private|tmp|var)\/|\\/i.test(detail)) {
    return "Input observed";
  }
  const printable = [...detail]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return printable.length === 0 ? "Input observed" : printable.slice(0, 500);
}

export { FIXTURE_ENVIRONMENT_FLAG as HID_FIXTURE_ENVIRONMENT_FLAG };
