/**
 * Phase 4 Pipeline Observability Unit Suite
 * Covers:
 * - 7-agent canonical stepper state & hydration from completed_step_outputs.step_telemetry
 * - One-card-per-agent-run upsert (running -> done | failed) without duplicate cards
 * - JOB_RESUMED -> status: "RUNNING" & isSimulating: true
 * - derivePipelineBadgeState ("Standby" only when truly idle)
 * - Progressive Inspector population (nodesByDocument & workItems mid-run) & pause/resume
 * - Human-readable summary sanitization (zero raw Python dict repr, zero constant node_index: 1)
 */

if (typeof window === "undefined") {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

import {
  CANONICAL_AGENTS,
  createInitialAgentSteps,
  derivePipelineBadgeState,
  formatHumanAgentSummary,
  hydrateAgentStepsFromJob,
  sanitizeTelemetryText,
  upsertAgentTelemetryFromEvent,
} from "../lib/pipelineTelemetry";
import { buildDemoCorpus } from "../store/demoCorpusService";
import {
  cancelLocalSimulation,
  pauseLocalSimulation,
  resumeLocalSimulation,
  runLocalMultiAgentReview,
} from "../store/simulatorService";
import { useBertStore } from "../store/useBertStore";
import type { JobExecution, PipelineEvent, WorkItem } from "../types/bert";

let assertCount = 0;

function assert(cond: unknown, message: string): void {
  assertCount += 1;
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertCount += 1;
  if (actual !== expected) {
    throw new Error(
      `ASSERTION FAILED: ${message} (expected=${String(expected)}, actual=${String(actual)})`
    );
  }
  console.log(`  PASS: ${message}`);
}

async function testCanonicalStepperAndUpsert(): Promise<void> {
  console.log("\n=== [4.1] Canonical 7-Agent Stepper & One-Card-Per-Run Upsert ===");

  const initialSteps = createInitialAgentSteps("run-1");
  assertEqual(initialSteps.length, 7, "createInitialAgentSteps returns 7 canonical steps");
  assertEqual(
    initialSteps.map((s) => s.agentName).join(","),
    CANONICAL_AGENTS.join(","),
    "Canonical step order matches Scout..Envoy"
  );
  assert(
    initialSteps.every((s) => s.status === "pending"),
    "All 7 initial steps start in pending status"
  );

  const demo = buildDemoCorpus();
  const doc = demo.documents[0];

  // Emit running -> completed for Scout within run-1
  const t0 = Date.now();
  const runningEv: PipelineEvent = {
    type: "agent_transition",
    job_id: "job-1",
    run_id: "run-1",
    agent_name: "Scout",
    current_agent_index: 0,
    status: "running",
    started_at: t0,
    document_id: doc.id,
    document_filename: doc.filename,
    summary: `Inspecting OCR readability across ${doc.filename}`,
  };

  const afterStart = upsertAgentTelemetryFromEvent({
    agentSteps: initialSteps,
    agentRuns: [],
    event: runningEv,
    documents: demo.documents,
    activeJobId: "job-1",
    now: t0,
  });

  assertEqual(afterStart.agentRuns.length, 1, "First running event creates 1 card in agentRuns");
  assertEqual(afterStart.agentRuns[0].status, "running", "Card initially has status='running'");
  assertEqual(afterStart.agentSteps[0].status, "running", "Scout step status is 'running'");

  const completedEv: PipelineEvent = {
    type: "agent_transition",
    job_id: "job-1",
    run_id: "run-1",
    agent_name: "Scout",
    current_agent_index: 0,
    status: "completed",
    started_at: t0,
    completed_at: t0 + 185,
    latency_ms: 185,
    document_id: doc.id,
    document_filename: doc.filename,
    summary: `Scanned 6 pages · 1 low-confidence region flagged`,
    details: { pages_scanned: 6, low_confidence_regions: 1 },
    input_hash: "aaaa1111bbbb2222",
    output_hash: "cccc3333dddd4444",
  };

  const afterComplete = upsertAgentTelemetryFromEvent({
    agentSteps: afterStart.agentSteps,
    agentRuns: afterStart.agentRuns,
    event: completedEv,
    documents: demo.documents,
    activeJobId: "job-1",
    now: t0 + 185,
  });

  assertEqual(
    afterComplete.agentRuns.length,
    1,
    "Completed event for same (runId, agentName) updates existing card IN PLACE (length === 1)"
  );
  assertEqual(afterComplete.agentRuns[0].status, "done", "Card transitions running -> done");
  assertEqual(afterComplete.agentRuns[0].elapsedMs, 185, "Card captures measured latency_ms");
  assertEqual(afterComplete.agentSteps[0].status, "done", "Scout step status transitions to 'done'");
  assertEqual(
    afterComplete.agentRuns[0].summary,
    "Scanned 6 pages · 1 low-confidence region flagged",
    "Card stores human-readable summary"
  );

  // Starting a distinct run_id creates a second card rather than overwriting run-1
  const secondRun = upsertAgentTelemetryFromEvent({
    agentSteps: createInitialAgentSteps("run-2"),
    agentRuns: afterComplete.agentRuns,
    event: { ...runningEv, run_id: "run-2" },
    documents: demo.documents,
    activeJobId: "job-1",
    now: t0 + 500,
  });
  assertEqual(secondRun.agentRuns.length, 2, "Distinct run_id appends a new card");

  // Failed step transition
  const failedState = upsertAgentTelemetryFromEvent({
    agentSteps: secondRun.agentSteps,
    agentRuns: secondRun.agentRuns,
    event: {
      type: "agent_transition",
      job_id: "job-1",
      run_id: "run-2",
      agent_name: "Scout",
      current_agent_index: 0,
      status: "failed",
      summary: "Vision OCR parser timed out",
      details: { error: "Vision OCR parser timed out" },
    },
    documents: demo.documents,
    activeJobId: "job-1",
    now: t0 + 700,
  });
  assertEqual(failedState.agentRuns.length, 2, "Failed event updates run-2 card in place");
  assertEqual(failedState.agentRuns[1].status, "failed", "Card transitions running -> failed");
  assertEqual(failedState.agentSteps[0].status, "failed", "Step status transitions to failed");
}

async function testHydrationAndBadgeState(): Promise<void> {
  console.log("\n=== [4.2] Job Telemetry Hydration & Standby Badge Invariants ===");

  const demo = buildDemoCorpus();
  const job: JobExecution = {
    job_id: "job-hydrate-1",
    workspace_id: demo.workspaceId,
    batch_id: "batch-1",
    status: "COMPLETED",
    current_agent_index: 6,
    current_document_id: demo.documents[0].id,
    current_node_index: 0,
    checkpoint_id: "cp-1",
    completed_step_outputs: {
      step_telemetry: [
        {
          agent_name: "Scout",
          index: 0,
          status: "completed",
          elapsed_ms: 142,
          summary: "Scanned 6 pages across 3 documents",
          details: { pages_scanned: 6 },
          document_id: demo.documents[0].id,
          document_filename: demo.documents[0].filename,
          input_hash: "11112222",
          output_hash: "33334444",
        },
        {
          agent_name: "Quartermaster",
          index: 1,
          status: "completed",
          elapsed_ms: 95,
          summary: "Tagged 27 semantic AST nodes",
          details: { total_nodes: 27 },
        },
      ],
    },
    user_override_instructions: [],
    error_message: null,
  };

  const hydrated = hydrateAgentStepsFromJob(job, demo.documents);
  assertEqual(hydrated.agentSteps.length, 7, "Hydrated agentSteps preserves 7-slot length");
  assertEqual(hydrated.agentSteps[0].status, "done", "Scout hydrated as done");
  assertEqual(hydrated.agentSteps[0].elapsedMs, 142, "Scout elapsedMs hydrated");
  assertEqual(hydrated.agentSteps[1].status, "done", "Quartermaster hydrated as done");
  assertEqual(hydrated.agentSteps[2].status, "pending", "Remaining steps stay pending");
  assertEqual(hydrated.agentRuns.length, 2, "Hydration emits one AgentRunEntry per completed step");

  // Badge state: Standby ONLY when truly idle
  const idleSteps = createInitialAgentSteps();
  assertEqual(
    derivePipelineBadgeState({
      activeJobStatus: null,
      hasCompletedRun: false,
      isSimulating: false,
      agentSteps: idleSteps,
      agentRunsCount: 0,
    }),
    "Standby",
    'Returns "Standby" when truly idle'
  );
  assertEqual(
    derivePipelineBadgeState({
      activeJobStatus: "RUNNING",
      hasCompletedRun: false,
      isSimulating: true,
      agentSteps: idleSteps,
      agentRunsCount: 0,
    }),
    "Running",
    'Returns "Running" when job is RUNNING'
  );
  assertEqual(
    derivePipelineBadgeState({
      activeJobStatus: "PAUSED",
      hasCompletedRun: false,
      isSimulating: false,
      agentSteps: idleSteps,
      agentRunsCount: 1,
    }),
    "Paused",
    'Returns "Paused" when job is PAUSED'
  );
  assertEqual(
    derivePipelineBadgeState({
      activeJobStatus: "COMPLETED",
      hasCompletedRun: true,
      isSimulating: false,
      agentSteps: hydrated.agentSteps,
      agentRunsCount: 2,
    }),
    "Completed",
    'Returns "Completed" after run finishes (NEVER Standby)'
  );
  assertEqual(
    derivePipelineBadgeState({
      activeJobStatus: "FAILED",
      hasCompletedRun: false,
      isSimulating: false,
      agentSteps: idleSteps,
      agentRunsCount: 1,
    }),
    "Failed",
    'Returns "Failed" when job status is FAILED'
  );
}

async function testJobResumedAndAppendEventStore(): Promise<void> {
  console.log("\n=== [4.3] Store appendEvent: JOB_RESUMED, One-Card Upsert, No Raw Dict ===");

  const demo = buildDemoCorpus();
  const job: JobExecution = {
    job_id: "job-store-test",
    workspace_id: demo.workspaceId,
    batch_id: "batch-store",
    status: "RUNNING",
    current_agent_index: 0,
    current_document_id: demo.documents[0].id,
    current_node_index: 0,
    checkpoint_id: "cp-1",
    completed_step_outputs: {},
    user_override_instructions: [],
    error_message: null,
  };

  await useBertStore.getState().resetWorkspace();
  useBertStore.setState({
    backendAvailable: false,
    documents: demo.documents,
    activeJob: job,
    job,
    agentSteps: createInitialAgentSteps(job.job_id),
    agentRuns: [],
    isSimulating: true,
  });

  // Transition Scout running -> completed
  useBertStore.getState().appendEvent({
    type: "agent_transition",
    job_id: job.job_id,
    run_id: job.job_id,
    agent_name: "Scout",
    current_agent_index: 0,
    status: "running",
    summary: "Running OCR audit",
    document_id: demo.documents[0].id,
  });
  useBertStore.getState().appendEvent({
    type: "agent_transition",
    job_id: job.job_id,
    run_id: job.job_id,
    agent_name: "Scout",
    current_agent_index: 0,
    status: "completed",
    latency_ms: 112,
    summary: "OCR audit finished · 6 pages scanned",
    details: { pages_scanned: 6 },
    document_id: demo.documents[0].id,
  });

  assertEqual(
    useBertStore.getState().agentRuns.length,
    1,
    "Store upsert produces 1 card in agentRuns for Scout running->completed"
  );
  assertEqual(useBertStore.getState().agentRuns[0].status, "done", "Store card updated to done");

  // Pause then Resume via appendEvent
  useBertStore.getState().appendEvent({ type: "JOB_PAUSED", job_id: job.job_id });
  assertEqual(useBertStore.getState().activeJob?.status, "PAUSED", "JOB_PAUSED sets status=PAUSED");
  assertEqual(useBertStore.getState().isSimulating, false, "JOB_PAUSED stops isSimulating");

  useBertStore.getState().appendEvent({ type: "JOB_RESUMED", job_id: job.job_id });
  assertEqual(
    useBertStore.getState().activeJob?.status,
    "RUNNING",
    'JOB_RESUMED transitions activeJob.status back to "RUNNING" (not "RESUMED")'
  );
  assertEqual(
    useBertStore.getState().isSimulating,
    true,
    "JOB_RESUMED restores isSimulating=true"
  );
}

async function testSummarySanitization(): Promise<void> {
  console.log("\n=== [4.4] Telemetry Text Sanitization (Zero Raw Dicts) ===");

  assertEqual(
    sanitizeTelemetryText("{'outputs': 10, 'low_confidence': 1}"),
    "",
    "Rejects pure Python dict repr"
  );
  assertEqual(
    sanitizeTelemetryText('{"outputs": 10}'),
    "",
    "Rejects pure JSON object string"
  );
  assertEqual(
    sanitizeTelemetryText("Scout finished OCR sweep ({'low_confidence': 1})."),
    "Scout finished OCR sweep",
    "Strips trailing parenthesized raw Python dict"
  );

  const synthesized = formatHumanAgentSummary({
    message: "{'total_nodes': 27, 'p0_critical': 3}",
    details: { total_nodes: 27, p0_critical: 3 },
    agentName: "Vanguard",
    status: "done",
  });
  assert(
    synthesized.includes("27 nodes processed") && synthesized.includes("3 critical (P0)"),
    `Synthesizes readable summary from details when text is raw dict: "${synthesized}"`
  );
  assert(
    !synthesized.includes("{") && !synthesized.includes("}"),
    "Synthesized summary contains zero raw braces"
  );
}

async function testProgressiveSimulatorAndPauseResume(): Promise<void> {
  console.log("\n=== [4.5] Progressive Inspector Population & Pause/Resume in Simulator ===");

  await useBertStore.getState().resetWorkspace();
  const demo = buildDemoCorpus();
  const job: JobExecution = {
    job_id: "sim-progressive-1",
    workspace_id: demo.workspaceId,
    batch_id: "batch-prog-1",
    status: "RUNNING",
    current_agent_index: 0,
    current_document_id: demo.documents[0].id,
    current_node_index: 0,
    checkpoint_id: "cp-prog-1",
    completed_step_outputs: {},
    user_override_instructions: [],
    error_message: null,
  };

  useBertStore.setState({
    backendAvailable: false,
    documents: demo.documents,
    nodesByDocument: {},
    workItems: [],
    activeJob: job,
    job,
    agentSteps: createInitialAgentSteps(job.job_id),
    agentRuns: [],
    events: [],
    isSimulating: true,
    hasCompletedRun: false,
  });

  const observedSnapshots: Array<{
    agentIndex: number;
    nodeDocCount: number;
    workItemCount: number;
    status: string;
  }> = [];

  // Track snapshots whenever appendEvent fires
  const origAppend = useBertStore.getState().appendEvent;
  const wrappedAppend = (ev: PipelineEvent) => {
    origAppend(ev);
    const s = useBertStore.getState();
    observedSnapshots.push({
      agentIndex: ev.current_agent_index ?? -1,
      nodeDocCount: Object.keys(s.nodesByDocument).length,
      workItemCount: s.workItems.length,
      status: s.activeJob?.status ?? "",
    });

    // Verify no emitted event carries bogus constant node_index: 1 on agent_transition
    if (ev.type === "agent_transition") {
      assert(
        ev.node_index !== 1,
        `Agent ${ev.agent_name} telemetry does not emit constant node_index: 1`
      );
    }

    // Exercise pause mid-run right after Quartermaster completes (step 1)
    if (
      ev.type === "agent_transition" &&
      ev.agent_name === "Quartermaster" &&
      ev.status === "completed"
    ) {
      pauseLocalSimulation();
      setTimeout(() => resumeLocalSimulation(), 60);
    }
  };

  useBertStore.setState({ appendEvent: wrappedAppend });

  await runLocalMultiAgentReview(useBertStore.setState, useBertStore.getState, demo.documents, job, {
    nodesByDocument: demo.nodesByDocument,
    workItems: demo.workItems,
    stepDelayMs: 35,
  });

  const finalState = useBertStore.getState();
  // Restore original appendEvent
  useBertStore.setState({ appendEvent: origAppend });

  assertEqual(finalState.hasCompletedRun, true, "Simulator completes full 7-agent run after resume");
  assertEqual(
    finalState.agentRuns.length,
    7,
    "Full 7-agent run yields exactly 7 cards in agentRuns (no duplicate cards)"
  );
  assert(
    finalState.agentRuns.every((r) => r.status === "done"),
    "All 7 agent cards end in 'done' status"
  );
  assert(
    finalState.agentRuns.every((r) => (r.elapsedMs ?? 0) > 0 && !r.summary.includes("{")),
    "All 7 cards carry real measured elapsedMs and clean human-readable summaries"
  );
  assertEqual(
    Object.keys(finalState.nodesByDocument).length,
    demo.documents.length,
    "All documents have populated AST nodes by completion"
  );
  assertEqual(
    finalState.workItems.length,
    demo.workItems.length,
    "All workItems are populated by completion"
  );

  // Verify progressive population happened BEFORE Envoy / JOB_COMPLETED
  const qmSnapshot = observedSnapshots.find((snap) => snap.agentIndex === 1 && snap.nodeDocCount > 0);
  assert(
    Boolean(qmSnapshot),
    "nodesByDocument populated progressively by Quartermaster (step 1) BEFORE run completion"
  );
  const chronosOrRangerWork = observedSnapshots.find(
    (snap) => snap.agentIndex >= 2 && snap.agentIndex <= 5 && snap.workItemCount > 0 && snap.workItemCount < demo.workItems.length
  );
  assert(
    Boolean(chronosOrRangerWork),
    "workItems populated progressively mid-run across Chronos..Arbiter (before full completion)"
  );

  cancelLocalSimulation();
}

async function main(): Promise<void> {
  console.log("================================================================================");
  console.log("  PHASE 4 PIPELINE OBSERVABILITY UNIT SUITE                                     ");
  console.log("================================================================================");

  await testCanonicalStepperAndUpsert();
  await testHydrationAndBadgeState();
  await testJobResumedAndAppendEventStore();
  await testSummarySanitization();
  await testProgressiveSimulatorAndPauseResume();

  console.log("\n================================================================================");
  console.log(`  ALL PHASE 4 OBSERVABILITY CHECKS PASSED (${assertCount} assertions)`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("\nFATAL ERROR:", err);
  (globalThis as unknown as { process?: { exit?: (code: number) => void } }).process?.exit?.(1);
});
