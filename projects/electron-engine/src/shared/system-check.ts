import { z } from "zod";

export const SYSTEM_CHECK_IDS = [
  "audienceDisplay",
  "microphonePermission",
  "microphoneDevice",
  "microphoneSignal",
  "recordButton",
  "choiceButton",
  "audioOutput",
  "videoEngine",
  "storage",
  "acPower",
  "contentConfig",
  "inputMonitoring",
] as const;

export const SystemCheckIdSchema = z.enum(SYSTEM_CHECK_IDS);
export type SystemCheckId = z.infer<typeof SystemCheckIdSchema>;

export const SystemCheckStatusSchema = z.enum(["untested", "running", "pass", "warning", "fail", "simulated"]);
export type SystemCheckStatus = z.infer<typeof SystemCheckStatusSchema>;
export const CheckStatusSchema = SystemCheckStatusSchema;
export type CheckStatus = SystemCheckStatus;

export const SystemCheckEvidenceSchema = z.enum([
  "NONE",
  "AUTOMATED",
  "OPERATOR_CONFIRMED",
  "PHYSICAL_INPUT",
  "SIMULATED",
]);
export type SystemCheckEvidence = z.infer<typeof SystemCheckEvidenceSchema>;

export const SystemCheckResultSchema = z
  .object({
    id: SystemCheckIdSchema,
    status: SystemCheckStatusSchema,
    evidence: SystemCheckEvidenceSchema,
    summary: z.string().max(500),
    updatedAtMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.status === "simulated" && result.evidence !== "SIMULATED") {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "Simulated results require simulated evidence" });
    }
    if (result.status === "pass" && ["NONE", "SIMULATED"].includes(result.evidence)) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "A real PASS requires automated, operator-confirmed, or physical evidence",
      });
    }
    if ((result.status === "untested" || result.status === "running") && result.evidence !== "NONE") {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${result.status} checks cannot claim completed evidence`,
      });
    }
  });
export type SystemCheckResult = z.infer<typeof SystemCheckResultSchema>;

export const SystemCheckResultsSchema = z.record(SystemCheckIdSchema, SystemCheckResultSchema).superRefine(
  (results, ctx) => {
    for (const id of SYSTEM_CHECK_IDS) {
      if (!results[id]) {
        ctx.addIssue({ code: "custom", path: [id], message: `Missing system check: ${id}` });
      } else if (results[id].id !== id) {
        ctx.addIssue({ code: "custom", path: [id, "id"], message: "Check key and result ID must match" });
      }
    }
  },
);
export type SystemCheckResults = Record<SystemCheckId, SystemCheckResult>;

export interface SystemCheckDefinition {
  readonly id: SystemCheckId;
  readonly label: string;
  readonly critical: true;
  readonly acceptedEvidence: readonly Exclude<SystemCheckEvidence, "NONE" | "SIMULATED">[];
}

export const SYSTEM_CHECK_DEFINITIONS: Readonly<Record<SystemCheckId, SystemCheckDefinition>> = {
  audienceDisplay: {
    id: "audienceDisplay",
    label: "Audience Display",
    critical: true,
    acceptedEvidence: ["AUTOMATED", "OPERATOR_CONFIRMED"],
  },
  microphonePermission: {
    id: "microphonePermission",
    label: "Microphone Permission",
    critical: true,
    acceptedEvidence: ["AUTOMATED"],
  },
  microphoneDevice: {
    id: "microphoneDevice",
    label: "Microphone Device",
    critical: true,
    acceptedEvidence: ["AUTOMATED"],
  },
  microphoneSignal: {
    id: "microphoneSignal",
    label: "Microphone Signal",
    critical: true,
    acceptedEvidence: ["AUTOMATED"],
  },
  recordButton: {
    id: "recordButton",
    label: "Red Record Button",
    critical: true,
    acceptedEvidence: ["PHYSICAL_INPUT"],
  },
  choiceButton: {
    id: "choiceButton",
    label: "White Choice Button",
    critical: true,
    acceptedEvidence: ["PHYSICAL_INPUT"],
  },
  audioOutput: {
    id: "audioOutput",
    label: "Audio Output",
    critical: true,
    acceptedEvidence: ["AUTOMATED", "OPERATOR_CONFIRMED"],
  },
  videoEngine: {
    id: "videoEngine",
    label: "Video Engine",
    critical: true,
    acceptedEvidence: ["AUTOMATED"],
  },
  storage: {
    id: "storage",
    label: "Temporary Storage",
    critical: true,
    acceptedEvidence: ["AUTOMATED"],
  },
  acPower: {
    id: "acPower",
    label: "AC Power",
    critical: true,
    acceptedEvidence: ["AUTOMATED"],
  },
  contentConfig: {
    id: "contentConfig",
    label: "Content and Configuration",
    critical: true,
    acceptedEvidence: ["AUTOMATED"],
  },
  inputMonitoring: {
    id: "inputMonitoring",
    label: "Input Monitoring",
    critical: true,
    acceptedEvidence: ["AUTOMATED"],
  },
};

export const createInitialSystemCheckResults = (): SystemCheckResults =>
  Object.fromEntries(
    SYSTEM_CHECK_IDS.map((id) => [
      id,
      { id, status: "untested", evidence: "NONE", summary: "Not tested", updatedAtMs: 0 } satisfies SystemCheckResult,
    ]),
  ) as SystemCheckResults;

export const updateSystemCheckResult = (
  current: SystemCheckResults,
  update: SystemCheckResult,
): SystemCheckResults => {
  const parsed = SystemCheckResultSchema.parse(update);
  return { ...current, [parsed.id]: parsed };
};

export type SystemCheckMode = "exhibition" | "development";
export const SystemReadinessSchema = z.enum(["READY", "DEGRADED", "BLOCKED"]);
export type SystemReadiness = z.infer<typeof SystemReadinessSchema>;

export interface SystemCheckGate {
  readonly mode: SystemCheckMode;
  readonly readiness: SystemReadiness;
  readonly canStart: boolean;
  readonly blockingChecks: readonly SystemCheckId[];
  readonly warnings: readonly SystemCheckId[];
  readonly completed: number;
  readonly total: number;
}

const isRealPass = (result: SystemCheckResult): boolean => {
  if (result.status !== "pass") {
    return false;
  }
  return SYSTEM_CHECK_DEFINITIONS[result.id].acceptedEvidence.includes(
    result.evidence as Exclude<SystemCheckEvidence, "NONE" | "SIMULATED">,
  );
};

export const deriveSystemCheckGate = (
  results: SystemCheckResults,
  mode: SystemCheckMode = "exhibition",
): SystemCheckGate => {
  const parsed = SystemCheckResultsSchema.parse(results) as SystemCheckResults;
  const blockingChecks: SystemCheckId[] = [];
  const warnings: SystemCheckId[] = [];
  let completed = 0;

  for (const id of SYSTEM_CHECK_IDS) {
    const result = parsed[id];
    if (["pass", "warning", "fail", "simulated"].includes(result.status)) {
      completed += 1;
    }

    if (isRealPass(result)) {
      continue;
    }

    if (mode === "development" && result.status === "simulated" && result.evidence === "SIMULATED") {
      warnings.push(id);
      continue;
    }

    blockingChecks.push(id);
  }

  const canStart = blockingChecks.length === 0;
  const readiness: SystemReadiness = !canStart ? "BLOCKED" : warnings.length > 0 ? "DEGRADED" : "READY";
  return {
    mode,
    readiness,
    canStart,
    blockingChecks,
    warnings,
    completed,
    total: SYSTEM_CHECK_IDS.length,
  };
};

export const markAllChecksForDevelopment = (
  current: SystemCheckResults,
  atMs: number,
): SystemCheckResults => {
  let next = current;
  for (const id of SYSTEM_CHECK_IDS) {
    if (isRealPass(next[id])) {
      continue;
    }
    next = updateSystemCheckResult(next, {
      id,
      status: "simulated",
      evidence: "SIMULATED",
      summary: "Simulated for development; not a physical exhibition pass",
      updatedAtMs: atMs,
    });
  }
  return next;
};
