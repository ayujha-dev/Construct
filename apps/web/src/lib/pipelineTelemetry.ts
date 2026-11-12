import type {
  AgentRunEntry,
  AgentStepState,
  AgentStepStatus,
  Document,
  JobExecution,
  PipelineEvent,
} from "../types/bert";

export type PipelineRunBadgeState =
  | "Standby"
  | "Running"
  | "Paused"
  | "Completed"
  | "Failed";

export function derivePipelineBadgeState(params: {
  activeJobStatus?: string | null;
  hasCompletedRun: boolean;
  isSimulating: boolean;
  agentSteps: AgentStepState[];
  agentRunsCount: number;
}): PipelineRunBadgeState {
  const status = params.activeJobStatus;
  if (status === "FAILED" || params.agentSteps.some((s) => s.status === "failed")) {
    return "Failed";
  }
  if (status === "PAUSED" || status === "PAUSING") {
    return "Paused";
  }
  if (
    status === "RUNNING" ||
    status === "RESUMING" ||
    params.isSimulating ||
    params.agentSteps.some((s) => s.status === "running")
  ) {
    return "Running";
  }
  if (
    status === "COMPLETED" ||
    params.hasCompletedRun ||
    params.agentSteps.some((s) => s.status === "done") ||
    params.agentRunsCount > 0
  ) {
    return "Completed";
  }
  return "Standby";
}

export const CANONICAL_AGENTS = [
  "Scout",
  "Quartermaster",
  "Chronos",
  "Vanguard",
  "Ranger",
  "Arbiter",
  "Envoy",
] as const;

export const CANONICAL_AGENT_ROLES = [
  "Vision Rescue",
  "Categorizer",
  "Temporal Tracker",
  "Risk Prioritizer",
  "Fact Extractor",
  "Conflict Resolver",
  "Summary Scribe",
] as const;

export function createInitialAgentSteps(runId: string | null = null): AgentStepState[] {
  return CANONICAL_AGENTS.map((agentName, index) => ({
    agentName,
    index,
    role: CANONICAL_AGENT_ROLES[index],
    status: "pending",
    startedAt: null,
    completedAt: null,
    elapsedMs: null,
    summary: null,
    details: null,
    inputHash: null,
    outputHash: null,
    documentId: null,
    documentFilename: null,
    runId,
  }));
}

export function parseTimestampMs(ts: string | number | null | undefined): number | null {
  if (typeof ts === "number" && Number.isFinite(ts)) {
    return ts;
  }
  if (typeof ts === "string" && ts.trim().length > 0) {
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatElapsedMs(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function computeTotalPipelineElapsedMs(
  steps: AgentStepState[],
  jobStartedAt?: number | null,
  jobCompletedAt?: number | null
): number | null {
  const startTimes = steps
    .map((s) => parseTimestampMs(s.startedAt))
    .filter((v): v is number => v !== null);
  const endTimes = steps
    .map((s) => parseTimestampMs(s.completedAt))
    .filter((v): v is number => v !== null);

  if (startTimes.length > 0 && endTimes.length > 0) {
    const minStart = Math.min(...startTimes);
    const maxEnd = Math.max(...endTimes);
    if (maxEnd > minStart) {
      return maxEnd - minStart;
    }
  }

  if (jobStartedAt && jobCompletedAt && jobCompletedAt > jobStartedAt) {
    return jobCompletedAt - jobStartedAt;
  }

  const summed = steps.reduce((acc, s) => acc + (s.elapsedMs && s.elapsedMs > 0 ? s.elapsedMs : 0), 0);
  return summed > 0 ? summed : null;
}

/**
 * Strips raw Python dict/tuple repr artifacts such as ` ({'outputs': 10}).`
 * and rejects strings that are purely raw dict/JSON literals.
 */
export function sanitizeTelemetryText(text: string | null | undefined): string {
  if (typeof text !== "string") return "";
  let cleaned = text.trim();
  if (!cleaned || cleaned === "[object Object]") return "";

  // Strip trailing parenthesized raw Python dict or JSON blob, e.g. " ({'low_confidence': 1})."
  cleaned = cleaned.replace(/\s*\(\{[\s\S]*\}\)\.?$/, "").trim();
  if (!cleaned) return "";

  // Reject pure raw dict/object strings such as "{'outputs': 10}" or '{"outputs": 10}'
  if (
    (cleaned.startsWith("{") && cleaned.endsWith("}")) ||
    (cleaned.startsWith("[") && cleaned.endsWith("]"))
  ) {
    return "";
  }
  return cleaned;
}

export function formatHumanAgentSummary(opts: {
  summary?: string | null;
  message?: string | null;
  details?: Record<string, unknown> | null;
  agentName: string;
  status: AgentStepStatus;
  documentFilename?: string | null;
}): string {
  const preferred = sanitizeTelemetryText(opts.summary);
  if (preferred) return preferred;

  const fromMessage = sanitizeTelemetryText(opts.message);
  if (fromMessage) return fromMessage;

  const details = opts.details ?? null;
  const idx = CANONICAL_AGENTS.indexOf(opts.agentName as (typeof CANONICAL_AGENTS)[number]);
  const role = idx >= 0 ? CANONICAL_AGENT_ROLES[idx] : "Pipeline Stage";
  const scopeLabel = opts.documentFilename ? ` on ${opts.documentFilename}` : "";

  if (opts.status === "failed") {
    const err = details && typeof details.error === "string" ? details.error : null;
    return err ? `${opts.agentName} failed: ${err}` : `${opts.agentName} (${role}) encountered an error.`;
  }

  if (details) {
    const parts: string[] = [];
    if (typeof details.pages_scanned === "number") {
      parts.push(`${details.pages_scanned} page${details.pages_scanned === 1 ? "" : "s"} scanned`);
    }
    if (typeof details.low_confidence_regions === "number") {
      parts.push(
        `${details.low_confidence_regions} low-confidence region${details.low_confidence_regions === 1 ? "" : "s"} flagged`
      );
    }
    if (typeof details.total_nodes === "number") {
      parts.push(`${details.total_nodes} nodes processed`);
    } else if (typeof details.nodes === "number") {
      parts.push(`${details.nodes} nodes processed`);
    }
    if (typeof details.p0_critical === "number") {
      parts.push(`${details.p0_critical} critical (P0)`);
    }
    if (typeof details.p1_high === "number") {
      parts.push(`${details.p1_high} high (P1)`);
    }
    if (typeof details.findings_extracted === "number") {
      parts.push(`${details.findings_extracted} findings extracted`);
    }
    if (typeof details.verified_97_plus === "number") {
      parts.push(`${details.verified_97_plus} verified ≥97%`);
    }
    if (typeof details.conflicts === "number") {
      parts.push(`${details.conflicts} supersession conflict${details.conflicts === 1 ? "" : "s"}`);
    }
    if (typeof details.defensibility_score === "number") {
      parts.push(`${details.defensibility_score}% defensibility`);
    }
    if (parts.length > 0) {
      return parts.join(" · ");
    }
  }

  if (opts.status === "running") {
    return `${role} active${scopeLabel}…`;
  }
  if (opts.status === "done") {
    return `${role} completed${scopeLabel}.`;
  }
  return `${role} pending`;
}

export function resolveAgentIndex(event: Pick<PipelineEvent, "current_agent_index" | "agent_name">): number {
  if (
    typeof event.current_agent_index === "number" &&
    Number.isFinite(event.current_agent_index) &&
    event.current_agent_index >= 0 &&
    event.current_agent_index < CANONICAL_AGENTS.length
  ) {
    return event.current_agent_index;
  }
  if (event.agent_name) {
    const exact = CANONICAL_AGENTS.indexOf(event.agent_name as (typeof CANONICAL_AGENTS)[number]);
    if (exact >= 0) return exact;
    const ci = CANONICAL_AGENTS.findIndex(
      (a) => a.toLowerCase() === event.agent_name!.toLowerCase()
    );
    if (ci >= 0) return ci;
  }
  return 0;
}

export function normalizeStepStatus(raw: unknown): AgentStepStatus {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (s === "completed" || s === "done" || s === "success") return "done";
  if (s === "running" || s === "active" || s === "in_progress") return "running";
  if (s === "failed" || s === "error") return "failed";
  return "pending";
}

function resolveDocFilename(
  docId: string | null | undefined,
  explicitFilename: string | null | undefined,
  documents: Document[]
): string | null {
  if (explicitFilename && explicitFilename.trim().length > 0) {
    return explicitFilename.trim();
  }
  if (!docId) return null;
  return documents.find((d) => d.id === docId)?.filename ?? null;
}

export function hydrateAgentStepsFromJob(
  job: JobExecution | null,
  documents: Document[] = []
): { agentSteps: AgentStepState[]; agentRuns: AgentRunEntry[] } {
  const runId = job?.job_id ?? null;
  const steps = createInitialAgentSteps(runId);
  const runs: AgentRunEntry[] = [];

  if (!job || (!job.completed_step_outputs && !job.step_telemetry)) {
    return { agentSteps: steps, agentRuns: runs };
  }

  const cso = (job.completed_step_outputs ?? {}) as Record<string, unknown>;
  const rawTelemetry = job.step_telemetry ?? cso.step_telemetry ?? cso.agent_steps ?? null;

  const applyRecord = (idx: number, rawEntry: unknown) => {
    if (idx < 0 || idx >= CANONICAL_AGENTS.length || !rawEntry || typeof rawEntry !== "object") {
      return;
    }
    const rec = rawEntry as Record<string, unknown>;
    const agentName = CANONICAL_AGENTS[idx];
    const status = normalizeStepStatus(rec.status ?? (rec.completed_at || rec.elapsed_ms || rec.latency_ms ? "done" : "done"));
    const docId =
      typeof rec.documentId === "string"
        ? rec.documentId
        : typeof rec.document_id === "string"
          ? rec.document_id
          : null;
    const docFilename = resolveDocFilename(
      docId,
      typeof rec.documentFilename === "string"
        ? rec.documentFilename
        : typeof rec.document_filename === "string"
          ? rec.document_filename
          : null,
      documents
    );
    const details =
      rec.details && typeof rec.details === "object" && !Array.isArray(rec.details)
        ? (rec.details as Record<string, unknown>)
        : null;
    const elapsedRaw = rec.elapsedMs ?? rec.elapsed_ms ?? rec.latency_ms;
    const elapsedMs = typeof elapsedRaw === "number" && Number.isFinite(elapsedRaw) ? elapsedRaw : null;
    const startedAt =
      (typeof rec.startedAt === "string" || typeof rec.startedAt === "number"
        ? rec.startedAt
        : typeof rec.started_at === "string" || typeof rec.started_at === "number"
          ? rec.started_at
          : null) ?? null;
    const completedAt =
      (typeof rec.completedAt === "string" || typeof rec.completedAt === "number"
        ? rec.completedAt
        : typeof rec.completed_at === "string" || typeof rec.completed_at === "number"
          ? rec.completed_at
          : null) ?? null;
    const inputHash =
      typeof rec.inputHash === "string"
        ? rec.inputHash
        : typeof rec.input_hash === "string"
          ? rec.input_hash
          : null;
    const outputHash =
      typeof rec.outputHash === "string"
        ? rec.outputHash
        : typeof rec.output_hash === "string"
          ? rec.output_hash
          : null;
    const entryRunId =
      (typeof rec.runId === "string"
        ? rec.runId
        : typeof rec.run_id === "string"
          ? rec.run_id
          : runId) ?? "hydrated-run";

    const summary = formatHumanAgentSummary({
      summary: typeof rec.summary === "string" ? rec.summary : null,
      message: typeof rec.message === "string" ? rec.message : null,
      details,
      agentName,
      status,
      documentFilename: docFilename,
    });

    steps[idx] = {
      agentName,
      index: idx,
      role: CANONICAL_AGENT_ROLES[idx],
      status,
      startedAt,
      completedAt,
      elapsedMs,
      summary,
      details,
      inputHash,
      outputHash,
      documentId: docId,
      documentFilename: docFilename,
      runId: entryRunId,
    };

    if (status !== "pending") {
      runs.push({
        id: `${entryRunId}:${agentName}`,
        runId: entryRunId,
        jobId: job.job_id,
        agentName,
        agentIndex: idx,
        role: CANONICAL_AGENT_ROLES[idx],
        status,
        startedAt,
        completedAt,
        elapsedMs,
        summary,
        details,
        inputHash,
        outputHash,
        documentId: docId,
        documentFilename: docFilename,
        rawEvent: {
          type: "agent_transition",
          agent_name: agentName,
          current_agent_index: idx,
          status: status === "done" ? "completed" : status,
          latency_ms: elapsedMs ?? undefined,
          summary,
          details,
          input_hash: inputHash ?? undefined,
          output_hash: outputHash ?? undefined,
          document_id: docId,
          document_filename: docFilename,
          job_id: job.job_id,
          run_id: entryRunId,
        },
      });
    }
  };

  if (Array.isArray(rawTelemetry)) {
    rawTelemetry.forEach((entry, arrIdx) => {
      if (!entry || typeof entry !== "object") return;
      const rec = entry as Record<string, unknown>;
      const idx =
        typeof rec.index === "number"
          ? rec.index
          : typeof rec.agent_index === "number"
            ? rec.agent_index
            : typeof rec.agentName === "string"
              ? CANONICAL_AGENTS.indexOf(rec.agentName as (typeof CANONICAL_AGENTS)[number])
              : typeof rec.agent_name === "string"
                ? CANONICAL_AGENTS.indexOf(rec.agent_name as (typeof CANONICAL_AGENTS)[number])
                : arrIdx;
      applyRecord(idx, rec);
    });
  } else if (rawTelemetry && typeof rawTelemetry === "object") {
    for (const [key, val] of Object.entries(rawTelemetry as Record<string, unknown>)) {
      const numIdx = Number.parseInt(key, 10);
      const idx = Number.isFinite(numIdx)
        ? numIdx
        : CANONICAL_AGENTS.findIndex((a) => a.toLowerCase() === key.toLowerCase());
      applyRecord(idx, val);
    }
  } else {
    // Legacy fallback: completed_step_outputs["0"]..["6"]
    for (let idx = 0; idx < CANONICAL_AGENTS.length; idx += 1) {
      const legacyVal = cso[String(idx)];
      if (legacyVal !== undefined) {
        const details =
          legacyVal && typeof legacyVal === "object" && !Array.isArray(legacyVal)
            ? (legacyVal as Record<string, unknown>)
            : { output: legacyVal };
        applyRecord(idx, { status: "done", details });
      }
    }
  }

  return { agentSteps: steps, agentRuns: runs };
}

export function upsertAgentTelemetryFromEvent(params: {
  agentSteps: AgentStepState[];
  agentRuns: AgentRunEntry[];
  event: PipelineEvent;
  documents: Document[];
  activeJobId?: string | null;
  now?: number;
}): { agentSteps: AgentStepState[]; agentRuns: AgentRunEntry[] } {
  const { event, documents, activeJobId } = params;
  const now = params.now ?? Date.now();
  const nextSteps = params.agentSteps.length === CANONICAL_AGENTS.length
    ? params.agentSteps.map((s) => ({ ...s }))
    : createInitialAgentSteps(activeJobId ?? null);
  let nextRuns = [...params.agentRuns];

  if (event.type === "JOB_FAILED") {
    const errMsg = sanitizeTelemetryText(event.message) || "Pipeline execution failed.";
    let failedAny = false;
    for (let i = 0; i < nextSteps.length; i += 1) {
      if (nextSteps[i].status === "running") {
        failedAny = true;
        const startMs = parseTimestampMs(nextSteps[i].startedAt);
        const elapsedMs = startMs !== null ? Math.max(1, now - startMs) : nextSteps[i].elapsedMs;
        nextSteps[i] = {
          ...nextSteps[i],
          status: "failed",
          completedAt: now,
          elapsedMs,
          summary: errMsg,
        };
      }
    }
    if (!failedAny && typeof event.current_agent_index === "number") {
      const idx = Math.max(0, Math.min(CANONICAL_AGENTS.length - 1, event.current_agent_index));
      nextSteps[idx] = {
        ...nextSteps[idx],
        status: "failed",
        completedAt: now,
        summary: errMsg,
      };
    }
    nextRuns = nextRuns.map((run) =>
      run.status === "running"
        ? {
            ...run,
            status: "failed",
            completedAt: now,
            summary: errMsg,
            rawEvent: event,
          }
        : run
    );
    return { agentSteps: nextSteps, agentRuns: nextRuns };
  }

  if (event.type === "JOB_COMPLETED") {
    for (let i = 0; i < nextSteps.length; i += 1) {
      if (nextSteps[i].status === "running") {
        const startMs = parseTimestampMs(nextSteps[i].startedAt);
        nextSteps[i] = {
          ...nextSteps[i],
          status: "done",
          completedAt: event.completed_at ?? now,
          elapsedMs:
            nextSteps[i].elapsedMs ?? (startMs !== null ? Math.max(1, now - startMs) : null),
        };
      }
    }
    nextRuns = nextRuns.map((run) =>
      run.status === "running"
        ? {
            ...run,
            status: "done",
            completedAt: event.completed_at ?? now,
          }
        : run
    );
    return { agentSteps: nextSteps, agentRuns: nextRuns };
  }

  if (event.type !== "agent_transition") {
    return { agentSteps: nextSteps, agentRuns: nextRuns };
  }

  const idx = resolveAgentIndex(event);
  const agentName = CANONICAL_AGENTS[idx];
  const role = CANONICAL_AGENT_ROLES[idx];
  const stepStatus = normalizeStepStatus(event.status ?? "running");
  const runStatus: "running" | "done" | "failed" =
    stepStatus === "failed" ? "failed" : stepStatus === "done" ? "done" : "running";

  const prevStep = nextSteps[idx];
  const runId = event.run_id || event.job_id || activeJobId || prevStep.runId || "local-run";
  const docId = event.document_id !== undefined ? event.document_id : prevStep.documentId;
  const docFilename =
    resolveDocFilename(docId, event.document_filename, documents) ?? prevStep.documentFilename;
  const details =
    event.details && typeof event.details === "object"
      ? event.details
      : prevStep.details;
  const startedAt =
    stepStatus === "running"
      ? event.started_at ?? prevStep.startedAt ?? now
      : prevStep.startedAt ?? event.started_at ?? now;
  const completedAt =
    stepStatus === "done" || stepStatus === "failed"
      ? event.completed_at ?? now
      : null;

  let elapsedMs: number | null = prevStep.elapsedMs;
  if (typeof event.latency_ms === "number" && event.latency_ms > 0) {
    elapsedMs = event.latency_ms;
  } else if (stepStatus === "done" || stepStatus === "failed") {
    const startMs = parseTimestampMs(startedAt);
    const endMs = parseTimestampMs(completedAt) ?? now;
    if (startMs !== null && endMs >= startMs) {
      elapsedMs = Math.max(1, endMs - startMs);
    }
  } else {
    elapsedMs = null;
  }

  const summary = formatHumanAgentSummary({
    summary: event.summary,
    message: event.message,
    details,
    agentName,
    status: stepStatus,
    documentFilename: docFilename,
  });

  const inputHash = event.input_hash ?? prevStep.inputHash;
  const outputHash = event.output_hash ?? prevStep.outputHash;

  nextSteps[idx] = {
    agentName,
    index: idx,
    role,
    status: stepStatus,
    startedAt,
    completedAt,
    elapsedMs,
    summary,
    details,
    inputHash,
    outputHash,
    documentId: docId,
    documentFilename: docFilename,
    runId,
  };

  const entryId = `${runId}:${agentName}`;
  const existingIdx = nextRuns.findIndex((r) => r.id === entryId);
  const upserted: AgentRunEntry = {
    id: entryId,
    runId,
    jobId: event.job_id ?? activeJobId ?? null,
    agentName,
    agentIndex: idx,
    role,
    status: runStatus,
    startedAt,
    completedAt,
    elapsedMs,
    summary,
    details,
    inputHash,
    outputHash,
    documentId: docId,
    documentFilename: docFilename,
    rawEvent: event,
  };

  if (existingIdx >= 0) {
    nextRuns[existingIdx] = upserted;
  } else {
    nextRuns.push(upserted);
  }

  return { agentSteps: nextSteps, agentRuns: nextRuns };
}
