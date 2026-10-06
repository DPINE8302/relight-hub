import { statfs } from "node:fs/promises";
import type { AudienceRuntimeEvent } from "../shared/contracts";
import {
  createInitialSystemCheckResults,
  deriveSystemCheckGate,
  updateSystemCheckResult,
  type SystemCheckEvidence,
  type SystemCheckGate,
  type SystemCheckId,
} from "../shared/system-check";
import { logger } from "./logger";
import { probeAtomicWritableRoots } from "./storage-probe";
import type { ContentManager } from "./content-manager";
import type { PermissionService } from "./permission-service";
import type { PowerService } from "./power-service";
import type {
  OperationMode,
  HidState,
  MediaDeviceInventory,
  ProductionInputRole,
  RuntimeHealthReport,
  SystemCheckItem,
  SystemCheckSnapshot,
  SystemCheckStatus,
} from "./types";
import type { WindowManager } from "./window-manager";

const MINIMUM_FREE_STORAGE_BYTES = 2 * 1024 * 1024 * 1024;

interface ModeEvidence {
  runtime: RuntimeHealthReport;
  testedMicrophoneDeviceId: string | null;
  speakerConfirmed: boolean | null;
}

function initialModeEvidence(operationMode: OperationMode): ModeEvidence {
  return {
    runtime: {
      operationMode,
      microphoneDevice: "NOT_TESTED",
      microphoneSignal: "NOT_TESTED",
      audioOutput: "NOT_TESTED",
      videoEngine: "NOT_TESTED",
    },
    testedMicrophoneDeviceId: null,
    speakerConfirmed: null,
  };
}

function item(
  id: SystemCheckItem["id"],
  label: string,
  status: SystemCheckStatus,
  detail: string,
): SystemCheckItem {
  return { id, label, status, detail, checkedAt: Date.now() };
}

function simulated(id: SystemCheckItem["id"], label: string, detail: string): SystemCheckItem {
  return item(id, label, "SIMULATED", `${detail} This is not physical exhibition evidence.`);
}

function simulatedWhenNeeded(
  value: SystemCheckItem,
  simulationOverride: boolean,
  simulatedDetail: string,
): SystemCheckItem {
  return value.status === "PASS" || !simulationOverride
    ? value
    : simulated(value.id, value.label, simulatedDetail);
}

const SHARED_CHECK_ID: Readonly<Record<SystemCheckItem["id"], SystemCheckId>> = {
  power: "acPower",
  display: "audienceDisplay",
  content: "contentConfig",
  microphonePermission: "microphonePermission",
  microphoneDevice: "microphoneDevice",
  microphoneSignal: "microphoneSignal",
  redButton: "recordButton",
  whiteButton: "choiceButton",
  audioOutput: "audioOutput",
  videoEngine: "videoEngine",
  storage: "storage",
  inputMonitoring: "inputMonitoring",
};

function evidenceFor(check: SystemCheckItem): SystemCheckEvidence {
  if (check.status === "SIMULATED") return "SIMULATED";
  if (check.status === "NOT_TESTED") return "NONE";
  if (check.id === "redButton" || check.id === "whiteButton") return "PHYSICAL_INPUT";
  if (check.id === "audioOutput") return "OPERATOR_CONFIRMED";
  return "AUTOMATED";
}

export function systemCheckGateFromSnapshot(snapshot: SystemCheckSnapshot): SystemCheckGate {
  let shared = createInitialSystemCheckResults();
  for (const check of snapshot.items) {
    const status = check.status === "PASS"
      ? "pass"
      : check.status === "FAIL"
        ? "fail"
        : check.status === "SIMULATED"
          ? "simulated"
          : check.status === "WARNING" ? "warning" : "untested";
    shared = updateSystemCheckResult(shared, {
      id: SHARED_CHECK_ID[check.id],
      status,
      evidence: evidenceFor(check),
      summary: check.detail,
      updatedAtMs: check.checkedAt,
    });
  }
  return deriveSystemCheckGate(shared, snapshot.simulationOverride ? "development" : "exhibition");
}

export class SystemCheckService {
  private redButton: SystemCheckItem = item("redButton", "Red button", "NOT_TESTED", "Press the physical red button");
  private whiteButton: SystemCheckItem = item("whiteButton", "White button", "NOT_TESTED", "Press the physical white button");
  private readonly evidenceByMode: Record<OperationMode, ModeEvidence> = {
    production: initialModeEvidence("production"),
    test: initialModeEvidence("test"),
  };
  private mediaDeviceInventory: {
    observed: boolean;
    audioInputDeviceIds: Set<string>;
    audioOutputDeviceIds: Set<string>;
    sinkSelectionSupported: boolean;
    observedAt: number;
  } = {
    observed: false,
    audioInputDeviceIds: new Set(),
    audioOutputDeviceIds: new Set(),
    sinkSelectionSupported: false,
    observedAt: 0,
  };
  private modeReady: Record<OperationMode, boolean> = { production: false, test: false };
  private readonly awaitingNativeRoles = new Set<ProductionInputRole>();
  private snapshot: SystemCheckSnapshot = {
    ready: false,
    productionReady: false,
    testReady: false,
    operationMode: "test",
    canStart: false,
    simulationOverride: false,
    checkedAt: 0,
    items: [],
  };

  constructor(
    private readonly userDataDirectory: string,
    private readonly logDirectory: string,
    private readonly windows: WindowManager,
    private readonly content: ContentManager,
    private readonly permissions: PermissionService,
    private readonly power: PowerService,
    private readonly onChange: (snapshot: SystemCheckSnapshot) => void,
    private readonly isSimulationOverrideEnabled: () => boolean,
    private readonly getSelectedMicrophoneDeviceId: (mode?: OperationMode) => string | null,
    private readonly getOperationMode: () => OperationMode,
    private readonly getSelectedAudioOutputDeviceId: (mode?: OperationMode) => string | null = () => null,
    private readonly isVerificationOverride: () => boolean = () => false,
    private readonly getHidState: () => HidState = () => ({
      access: "unknown",
      helperAvailable: false,
      devices: [],
      bindings: { RECORD_BUTTON: null, CHOICE_BUTTON: null },
      learn: null,
      lastInput: null,
      error: null,
    }),
  ) {}

  get(): SystemCheckSnapshot {
    return structuredClone(this.snapshot);
  }

  isAwaitingPhysicalInput(): boolean {
    if (this.getOperationMode() !== "production" || this.isSimulationOverrideEnabled()) return false;
    return this.redButton.status !== "PASS" || this.whiteButton.status !== "PASS";
  }

  prepareMicrophoneTest(mode: OperationMode = this.getOperationMode()): void {
    const evidence = this.evidenceByMode[mode];
    evidence.testedMicrophoneDeviceId = null;
    evidence.runtime = {
      ...evidence.runtime,
      microphoneDevice: "NOT_TESTED",
      microphoneSignal: "NOT_TESTED",
    };
    this.modeReady[mode] = false;
  }

  prepareAudioOutputTest(mode: OperationMode = this.getOperationMode()): void {
    const evidence = this.evidenceByMode[mode];
    evidence.speakerConfirmed = null;
    evidence.runtime = { ...evidence.runtime, audioOutput: "NOT_TESTED" };
    this.modeReady[mode] = false;
  }

  confirmAudioOutput(heard: boolean): void {
    const mode = this.getOperationMode();
    const evidence = this.evidenceByMode[mode];
    evidence.speakerConfirmed = heard;
    if (!heard) evidence.runtime = { ...evidence.runtime, audioOutput: "FAIL" };
  }

  prepareVideoEngineTest(): void {
    const mode = this.getOperationMode();
    const evidence = this.evidenceByMode[mode];
    evidence.runtime = { ...evidence.runtime, videoEngine: "NOT_TESTED" };
    this.modeReady[mode] = false;
  }

  prepareNativeButtonTests(roles: readonly ProductionInputRole[] = ["RECORD_BUTTON", "CHOICE_BUTTON"]): void {
    for (const role of roles) {
      this.awaitingNativeRoles.add(role);
      if (role === "RECORD_BUTTON") {
        this.redButton = item("redButton", "Record control", "NOT_TESTED", "Press and release the assigned control once");
      } else {
        this.whiteButton = item("whiteButton", "Choose Again control", "NOT_TESTED", "Press and release the assigned control once");
      }
    }
    this.modeReady.production = false;
  }

  audioPlaybackSucceeded(): boolean {
    return this.evidenceByMode[this.getOperationMode()].runtime.audioOutput === "PASS";
  }

  async waitForMicrophoneEvidence(timeoutMs: number): Promise<void> {
    await this.waitFor(
      () => {
        const mode = this.getOperationMode();
        const evidence = this.evidenceByMode[mode];
        const selected = this.getSelectedMicrophoneDeviceId(mode);
        return selected !== null &&
          evidence.testedMicrophoneDeviceId === selected &&
          evidence.runtime.microphoneDevice === "PASS" &&
          evidence.runtime.microphoneSignal === "PASS";
      },
      timeoutMs,
    );
  }

  async waitForAudioPlayback(timeoutMs: number): Promise<void> {
    const mode = this.getOperationMode();
    await this.waitFor(() => this.evidenceByMode[mode].runtime.audioOutput !== "NOT_TESTED", timeoutMs);
  }

  async waitForVideoEvidence(timeoutMs: number): Promise<void> {
    const mode = this.getOperationMode();
    await this.waitFor(() => this.evidenceByMode[mode].runtime.videoEngine !== "NOT_TESTED", timeoutMs);
  }

  async run(): Promise<SystemCheckSnapshot> {
    const simulationOverride = this.isSimulationOverrideEnabled();
    const operationMode = this.getOperationMode();
    const evidence = this.evidenceByMode[operationMode];
    const runtime = evidence.runtime;
    const verificationOverride = this.isVerificationOverride();
    const [content, mediaReadiness, storage] = await Promise.all([
      this.checkContent(),
      this.content.inspectMediaReadiness(),
      this.checkStorage(),
    ]);
    const permission = this.permissions.getMicrophoneStatus();
    const microphonePermission = simulatedWhenNeeded(
      permission === "granted"
        ? item("microphonePermission", "Microphone permission", "PASS", "Microphone access granted")
        : item(
            "microphonePermission",
            "Microphone permission",
            permission === "not-determined" ? "NOT_TESTED" : "FAIL",
            permission === "not-determined" ? "Permission has not been requested" : `Microphone access is ${permission}`,
          ),
      verificationOverride,
      "Microphone permission is simulated only by the packaged verification harness.",
    );

    const audiencePresentation = this.windows.getAudiencePresentationStatus();
    const display = simulatedWhenNeeded(
      item(
        "display",
        "Audience display",
        audiencePresentation.ready ? "PASS" : "FAIL",
        audiencePresentation.detail,
      ),
      simulationOverride,
      "External audience display is simulated; the audience preview remains on the primary display.",
    );

    const hid = this.getHidState();
    const inputMonitoringStatus: SystemCheckStatus = !hid.helperAvailable || hid.access === "denied"
      ? "FAIL"
      : hid.access === "granted" ? "PASS" : "NOT_TESTED";
    const inputMonitoring = simulatedWhenNeeded(
      item(
        "inputMonitoring",
        "Input Monitoring",
        inputMonitoringStatus,
        !hid.helperAvailable
          ? "The signed RE:Light HID helper is unavailable"
          : hid.access === "granted"
            ? "Input Monitoring access is granted to the native HID helper"
            : hid.access === "restartRequired"
              ? "Permission changed; restart RE:Light before Production"
              : hid.access === "denied"
                ? "Input Monitoring access is denied"
                : "Grant Input Monitoring explicitly from Setup",
      ),
      simulationOverride,
      "Native HID and Input Monitoring are not used in Test mode.",
    );

    const selectedMicrophoneDeviceId = this.getSelectedMicrophoneDeviceId(operationMode);
    const selectedMicrophoneAvailable = selectedMicrophoneDeviceId !== null && (
      !this.mediaDeviceInventory.observed || this.mediaDeviceInventory.audioInputDeviceIds.has(selectedMicrophoneDeviceId)
    );
    const testedSelectedMicrophone = selectedMicrophoneDeviceId !== null &&
      evidence.testedMicrophoneDeviceId === selectedMicrophoneDeviceId;
    const microphoneDeviceStatus: SystemCheckStatus = selectedMicrophoneDeviceId === null
      ? "FAIL"
      : !selectedMicrophoneAvailable
        ? "FAIL"
      : testedSelectedMicrophone && runtime.microphoneDevice === "PASS"
        ? "PASS"
        : runtime.microphoneDevice === "NOT_TESTED" ? "NOT_TESTED" : "FAIL";
    const microphoneDevice = simulatedWhenNeeded(
      item(
        "microphoneDevice",
        "Microphone device",
        microphoneDeviceStatus,
        selectedMicrophoneDeviceId === null
          ? "Select a microphone before running the guided test"
          : !selectedMicrophoneAvailable
            ? "The selected microphone is disconnected; reconnect it or explicitly choose another device"
          : microphoneDeviceStatus === "PASS"
            ? "The persisted selected microphone completed the guided test"
            : "The selected microphone has not completed a matching guided test",
      ),
      verificationOverride,
      "Microphone device availability is simulated only by the packaged verification harness.",
    );
    const microphoneSignal = simulatedWhenNeeded(
      item(
        "microphoneSignal",
        "Microphone signal",
        !selectedMicrophoneAvailable ? "FAIL" : testedSelectedMicrophone ? runtime.microphoneSignal : "NOT_TESTED",
        !selectedMicrophoneAvailable
          ? "The selected microphone is disconnected; a fresh guided signal test is required after reconnection"
          : testedSelectedMicrophone && runtime.microphoneSignal === "PASS"
          ? "Live signal detected from the selected microphone"
          : "Speak into the persisted selected microphone during its guided test",
      ),
      verificationOverride,
      "Microphone signal is simulated only by the packaged verification harness.",
    );
    const selectedAudioOutputDeviceId = this.getSelectedAudioOutputDeviceId(operationMode);
    const selectedAudioOutputAvailable = selectedAudioOutputDeviceId === null || (
      this.mediaDeviceInventory.observed &&
      this.mediaDeviceInventory.sinkSelectionSupported &&
      this.mediaDeviceInventory.audioOutputDeviceIds.has(selectedAudioOutputDeviceId)
    );
    const confirmedAudioStatus: SystemCheckStatus = !selectedAudioOutputAvailable
      ? "FAIL"
      : evidence.speakerConfirmed === true && runtime.audioOutput === "PASS"
      ? "PASS"
      : evidence.speakerConfirmed === false || runtime.audioOutput === "FAIL"
        ? "FAIL"
        : "NOT_TESTED";
    const audioOutput = !selectedAudioOutputAvailable
      ? item(
          "audioOutput",
          "Audio output",
          "FAIL",
          "The selected sound output is disconnected; reconnect it or explicitly choose another output",
        )
      : simulatedWhenNeeded(
          item(
            "audioOutput",
            "Audio output",
            confirmedAudioStatus,
            confirmedAudioStatus === "PASS" ? "Operator confirmed hearing the speaker test" : "Run and confirm the speaker test",
          ),
          simulationOverride,
          "Audio output is simulated.",
        );
    const videoEngine = simulatedWhenNeeded(
      item(
        "videoEngine",
        "Video engine",
        mediaReadiness.ready ? runtime.videoEngine : "FAIL",
        !mediaReadiness.ready
          ? mediaReadiness.detail
          : runtime.videoEngine === "PASS" ? "Referenced media decoded in the audience renderer" : "Run the video engine test",
      ),
      simulationOverride,
      "Video playback readiness is simulated.",
    );
    const redButton = simulatedWhenNeeded(
      this.productionButtonItem("RECORD_BUTTON", this.redButton),
      simulationOverride,
      "Red button input is simulated.",
    );
    const whiteButton = simulatedWhenNeeded(
      this.productionButtonItem("CHOICE_BUTTON", this.whiteButton),
      simulationOverride,
      "White button input is simulated.",
    );

    const powerStatus = this.power.get();
    const power = simulatedWhenNeeded(
      item(
        "power",
        "AC power",
        powerStatus.onAcPower ? "PASS" : "FAIL",
        powerStatus.detail,
      ),
      simulationOverride,
      "AC power is simulated for test execution.",
    );
    const items = [
      power,
      display,
      content,
      microphonePermission,
      microphoneDevice,
      microphoneSignal,
      inputMonitoring,
      redButton,
      whiteButton,
      audioOutput,
      videoEngine,
      storage,
    ];
    const activeReady = operationMode === "production"
      ? items.every((entry) => entry.status === "PASS")
      : items.every((entry) => entry.status === "PASS" || entry.status === "SIMULATED");
    if (content.status !== "PASS" || storage.status !== "PASS" || permission !== "granted") {
      this.modeReady.production = false;
      this.modeReady.test = false;
    }
    if (
      !audiencePresentation.ready ||
      !mediaReadiness.ready ||
      !powerStatus.onAcPower ||
      hid.access !== "granted" ||
      !hid.helperAvailable ||
      hid.bindings.RECORD_BUTTON === null ||
      hid.bindings.CHOICE_BUTTON === null
    ) {
      this.modeReady.production = false;
    }
    this.modeReady[operationMode] = activeReady;
    const productionReady = this.modeReady.production;
    const testReady = this.modeReady.test;
    const canStart = operationMode === "production" ? productionReady : testReady;
    const ready = productionReady;
    this.snapshot = {
      ready,
      productionReady,
      testReady,
      operationMode,
      canStart,
      simulationOverride,
      checkedAt: Date.now(),
      items,
    };
    logger.info("System check evaluated", {
      ready,
      productionReady,
      testReady,
      operationMode,
      canStart,
      simulationOverride,
      items: items.map(({ id, status }) => ({ id, status })),
    });
    this.onChange(this.get());
    return this.get();
  }

  async recordNativeButtonInput(
    role: ProductionInputRole,
    deviceId: string,
    elementId: string,
  ): Promise<boolean> {
    if (this.getOperationMode() !== "production" || !this.awaitingNativeRoles.has(role)) return false;
    const hid = this.getHidState();
    const binding = hid.bindings[role];
    const matching = hid.access === "granted" && binding !== null && binding.deviceId === deviceId &&
      binding.elementId === elementId && hid.devices.some((device) => device.id === deviceId && device.connected);
    if (!matching) return false;
    const now = Date.now();
    if (role === "RECORD_BUTTON") {
      this.redButton = { id: "redButton", label: "Record control", status: "PASS", detail: "Fresh assigned HID press-release verified", checkedAt: now };
    } else {
      this.whiteButton = { id: "whiteButton", label: "Choose Again control", status: "PASS", detail: "Fresh assigned HID press-release verified", checkedAt: now };
    }
    this.awaitingNativeRoles.delete(role);
    await this.run();
    return true;
  }

  async invalidateNativeInputs(detail = "Run a fresh guided press-release check"): Promise<void> {
    this.redButton = item("redButton", "Record control", "NOT_TESTED", detail);
    this.whiteButton = item("whiteButton", "Choose Again control", "NOT_TESTED", detail);
    this.awaitingNativeRoles.clear();
    this.modeReady.production = false;
    await this.run();
  }

  /**
   * Records the renderer's sanitized Chromium device inventory. A missing
   * explicitly selected device invalidates only that profile's evidence. A
   * reconnect never restores PASS: the operator must run the guided check
   * again. Inventory is physical app state, so one fresh observation protects
   * both profiles even while only one mode is visible.
   */
  async updateMediaDeviceInventory(inventory: MediaDeviceInventory): Promise<SystemCheckSnapshot> {
    this.mediaDeviceInventory = {
      observed: true,
      audioInputDeviceIds: new Set(inventory.audioInputDeviceIds),
      audioOutputDeviceIds: new Set(inventory.audioOutputDeviceIds),
      sinkSelectionSupported: inventory.sinkSelectionSupported,
      observedAt: inventory.observedAt,
    };

    for (const mode of ["production", "test"] as const) {
      const microphoneDeviceId = this.getSelectedMicrophoneDeviceId(mode);
      if (microphoneDeviceId !== null && !this.mediaDeviceInventory.audioInputDeviceIds.has(microphoneDeviceId)) {
        this.prepareMicrophoneTest(mode);
      }
      const audioOutputDeviceId = this.getSelectedAudioOutputDeviceId(mode);
      if (
        audioOutputDeviceId !== null &&
        (!inventory.sinkSelectionSupported || !this.mediaDeviceInventory.audioOutputDeviceIds.has(audioOutputDeviceId))
      ) {
        this.prepareAudioOutputTest(mode);
      }
    }

    logger.info("Media device inventory updated", {
      operationMode: inventory.operationMode,
      audioInputCount: this.mediaDeviceInventory.audioInputDeviceIds.size,
      audioOutputCount: this.mediaDeviceInventory.audioOutputDeviceIds.size,
      sinkSelectionSupported: inventory.sinkSelectionSupported,
    });
    return this.run();
  }

  async updateRuntimeHealth(report: RuntimeHealthReport): Promise<void> {
    const evidence = this.evidenceByMode[report.operationMode];
    const previous = evidence.runtime;
    const next: RuntimeHealthReport = {
      operationMode: report.operationMode,
      microphoneDevice: report.microphoneDevice ?? previous.microphoneDevice,
      microphoneSignal: report.microphoneSignal,
      audioOutput: report.audioOutput,
      videoEngine: report.videoEngine,
    };
    if (
      next.microphoneDevice === previous.microphoneDevice &&
      next.microphoneSignal === previous.microphoneSignal &&
      next.audioOutput === previous.audioOutput &&
      next.videoEngine === previous.videoEngine
    ) {
      return;
    }
    evidence.runtime = next;
    if (
      next.microphoneDevice === "FAIL" ||
      next.microphoneSignal === "FAIL" ||
      next.audioOutput === "FAIL" ||
      next.videoEngine === "FAIL"
    ) {
      this.modeReady[report.operationMode] = false;
    }
    await this.run();
  }

  async updateAudienceEvent(event: AudienceRuntimeEvent): Promise<void> {
    if (event.event !== "MICROPHONE_STATUS") return;
    const evidence = this.evidenceByMode[event.operationMode];
    const selected = this.getSelectedMicrophoneDeviceId(event.operationMode);
    const matchingDevice = selected !== null && event.deviceId !== null && event.deviceId === selected;
    if (event.deviceId !== null) evidence.testedMicrophoneDeviceId = event.deviceId;
    const deviceAvailable = matchingDevice && (event.status === "READY" || event.status === "SILENT");
    const selectedDeviceFailed = matchingDevice && [
      "UNAVAILABLE",
      "PERMISSION_REQUIRED",
      "DISCONNECTED",
      "ERROR",
    ].includes(event.status);
    const next: RuntimeHealthReport = {
      ...evidence.runtime,
      operationMode: event.operationMode,
      microphoneDevice: deviceAvailable
        ? "PASS"
        : selectedDeviceFailed || (event.deviceId !== null && !matchingDevice)
          ? "FAIL"
          : evidence.runtime.microphoneDevice,
      microphoneSignal: matchingDevice && event.status === "READY" && (event.level ?? 0) > 0.015
        ? "PASS"
        : selectedDeviceFailed || (event.deviceId !== null && !matchingDevice)
          ? "FAIL"
          : evidence.runtime.microphoneSignal,
    };
    if (
      next.microphoneDevice === evidence.runtime.microphoneDevice &&
      next.microphoneSignal === evidence.runtime.microphoneSignal
    ) {
      return;
    }
    evidence.runtime = next;
    if (next.microphoneDevice === "FAIL" || next.microphoneSignal === "FAIL") {
      this.modeReady[event.operationMode] = false;
    }
    await this.run();
  }

  private async checkContent(): Promise<SystemCheckItem> {
    const validation = await this.content.validateCurrent();
    if (validation.valid) return item("content", "Content configuration", "PASS", "experience.json is valid");
    return item(
      "content",
      "Content configuration",
      "FAIL",
      validation.issues[0] ?? "experience.json is invalid; last-known-good playback remains available for recovery",
    );
  }

  private productionButtonItem(role: ProductionInputRole, evidence: SystemCheckItem): SystemCheckItem {
    const hid = this.getHidState();
    const binding = hid.bindings[role];
    const label = role === "RECORD_BUTTON" ? "Record control" : "Choose Again control";
    if (binding === null) return item(role === "RECORD_BUTTON" ? "redButton" : "whiteButton", label, "FAIL", "Assign this Production control in Setup");
    const connected = hid.devices.some((device) => device.id === binding.deviceId && device.connected);
    if (!connected) {
      return item(
        role === "RECORD_BUTTON" ? "redButton" : "whiteButton",
        label,
        "FAIL",
        binding.locationBound ? "Assigned control is disconnected; reconnect it to the same USB port" : "Assigned control is disconnected",
      );
    }
    return evidence;
  }

  private async checkStorage(): Promise<SystemCheckItem> {
    try {
      const roots = [this.userDataDirectory, this.logDirectory];
      await probeAtomicWritableRoots(roots);
      const filesystems = await Promise.all(roots.map((root) => statfs(root)));
      const freeBytes = Math.min(...filesystems.map((filesystem) => filesystem.bavail * filesystem.bsize));
      const freeGiB = freeBytes / 1024 / 1024 / 1024;
      return item(
        "storage",
        "Storage",
        freeBytes >= MINIMUM_FREE_STORAGE_BYTES ? "PASS" : "FAIL",
        `${freeGiB.toFixed(1)} GiB free; settings and log roots passed atomic write probes`,
      );
    } catch (error) {
      logger.error("Storage system check failed", error);
      return item("storage", "Storage", "FAIL", "Unable to verify available storage");
    }
  }

  private async waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
    if (predicate()) return;
    await new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const interval = setInterval(() => {
        if (!predicate() && Date.now() - startedAt < timeoutMs) return;
        clearInterval(interval);
        resolve();
      }, 50);
    });
  }
}
