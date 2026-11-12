/**
 * Phase 3 Integrity & Logic Verification Unit Suite
 * Covers all 9 integrity fixes across types, workItemMetrics, store actions,
 * simulator fallback, demo corpus, atomic reset, and export audit rows.
 */

if (typeof window === "undefined") {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

import {
  assessQuoteStrength,
  buildXlsxExportRows,
  computeWorkItemMetrics,
  filterWorkItemsForScope,
  formatExportWarningLines,
  getMatchBadgeTone,
  validateManualOverrideInput,
  validateNotApplicableInput,
} from "../lib/workItemMetrics";
import { buildDemoCorpus } from "../store/demoCorpusService";
import {
  cancelLocalSimulation,
  generateLocalExecutiveSummary,
  localCopilotSearch,
  runLocalMultiAgentReview,
} from "../store/simulatorService";
import { useBertStore } from "../store/useBertStore";
import type { WorkItem } from "../types/bert";

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

async function testValidationHelpers(): Promise<void> {
  console.log("\n=== [3.1 & 3.2] Manual Override & Mark N/A Validation ===");

  const helloCheck = validateManualOverrideInput({
    reasonCode: "SME_ATTESTATION",
    correction: "Hello",
    noEvidenceAttestation: true,
  });
  assertEqual(helloCheck.valid, false, 'Rejects trivial override answer "Hello"');
  assert(Boolean(helloCheck.errors.correction), "Reports correction length/word-count error");

  const missingCode = validateManualOverrideInput({
    reasonCode: "",
    correction: "Reviewed compensating control documented in IAM policy",
    noEvidenceAttestation: true,
  });
  assertEqual(missingCode.valid, false, "Rejects manual override without reason_code");

  const missingEvidence = validateManualOverrideInput({
    reasonCode: "SME_ATTESTATION",
    correction: "Reviewed compensating control documented in IAM policy",
    noEvidenceAttestation: false,
    hasExistingLocator: false,
    overrideCitationText: "",
  });
  assertEqual(
    missingEvidence.valid,
    false,
    "Rejects manual override with neither citation/locator nor no-evidence attestation"
  );

  const validAttested = validateManualOverrideInput({
    reasonCode: "COMPENSATING_CONTROL",
    correction: "Enforced MFA via Okta SSO across all production bastion hosts",
    noEvidenceAttestation: true,
  });
  assertEqual(validAttested.valid, true, "Accepts substantive override with no-evidence attestation");

  const emptyNa = validateNotApplicableInput({ reasonCode: "", note: "   " });
  assertEqual(emptyNa.valid, false, "Rejects Mark N/A with empty reason");

  const validNa = validateNotApplicableInput({
    reasonCode: "OUT_OF_SCOPE_PRODUCT",
    note: "FedRAMP annex applies only to US government enclave",
  });
  assertEqual(validNa.valid, true, "Accepts Mark N/A with explicit reason_code and note");
}

async function testMetricsAndBadgeTones(): Promise<void> {
  console.log("\n=== [3.3, 3.4 & 3.5] Metrics Exclusivity, Defensibility Cap & Badge Tones ===");

  const empty = computeWorkItemMetrics([]);
  assertEqual(empty.total, 0, "Empty metrics total === 0");
  assertEqual(empty.defensibilityScore, null, "Empty corpus yields defensibilityScore === null");

  const demo = buildDemoCorpus();
  const baseItem = demo.workItems[0];
  const makeItem = (id: string, overrides: Partial<WorkItem>): WorkItem => ({
    ...baseItem,
    id,
    ...overrides,
  });

  // Check cap <= 99 when all verified EXCEPT one P1_HIGH human override or N/A
  const cappedItems: WorkItem[] = [
    ...Array.from({ length: 199 }, (_, i) =>
      makeItem(`v-${i}`, {
        priority_tier: "P2_MEDIUM",
        verification_status: "VERIFIED",
        weak_evidence: false,
        gate_telemetry: { ...baseItem.gate_telemetry, citation_match: 99, weak_evidence: false },
      })
    ),
    makeItem("p1-override", {
      priority_tier: "P1_HIGH",
      original_priority_tier: "P1_HIGH",
      verification_status: "HUMAN_OVERRIDE",
      weak_evidence: false,
      gate_telemetry: { ...baseItem.gate_telemetry, citation_match: 0, weak_evidence: false },
    }),
  ];
  const cappedMetrics = computeWorkItemMetrics(cappedItems);
  assertEqual(
    cappedMetrics.machineVerified +
      cappedMetrics.humanOverride +
      cappedMetrics.escalatedLegal +
      cappedMetrics.notApplicable +
      cappedMetrics.unresolved,
    cappedMetrics.total,
    "Mutually exclusive status buckets sum strictly to total (200)"
  );
  assert(
    cappedMetrics.defensibilityScore !== null && cappedMetrics.defensibilityScore <= 99,
    `Defensibility capped <= 99 while P1_HIGH is HUMAN_OVERRIDE (got ${cappedMetrics.defensibilityScore})`
  );

  // Check HUMAN_OVERRIDE + NOT_APPLICABLE + ESCALATED_LEGAL excluded from machine-verified numerator
  const mixed: WorkItem[] = [
    makeItem("m1", { priority_tier: "P0_CRITICAL", verification_status: "VERIFIED", weak_evidence: false }),
    makeItem("m2", { priority_tier: "P0_CRITICAL", verification_status: "HUMAN_OVERRIDE", weak_evidence: false }),
    makeItem("m3", { priority_tier: "P1_HIGH", verification_status: "NOT_APPLICABLE", weak_evidence: false }),
    makeItem("m4", { priority_tier: "P2_MEDIUM", verification_status: "ESCALATED_LEGAL", weak_evidence: false }),
    makeItem("m5", {
      priority_tier: "P1_HIGH",
      verification_status: "NEEDS_HUMAN_VERIFICATION",
      weak_evidence: true,
    }),
  ];
  const mixedMetrics = computeWorkItemMetrics(mixed);
  assertEqual(mixedMetrics.total, 5, "Mixed total === 5");
  assertEqual(mixedMetrics.machineVerified, 1, "Only VERIFIED counts in machineVerified");
  assertEqual(mixedMetrics.humanOverride, 1, "humanOverride === 1");
  assertEqual(mixedMetrics.notApplicable, 1, "notApplicable === 1");
  assertEqual(mixedMetrics.escalatedLegal, 1, "escalatedLegal === 1");
  assertEqual(mixedMetrics.unresolved, 1, "unresolved === 1");
  assertEqual(mixedMetrics.defensibilityScore, 20, "Defensibility is machineVerified/total = 1/5 = 20%");
  assertEqual(mixedMetrics.weakEvidenceCount, 1, "weakEvidenceCount === 1");
  assertEqual(mixedMetrics.exportWarnings.hasAnyWarning, true, "Export warnings flagged");
  const warningLines = formatExportWarningLines(mixedMetrics);
  assert(warningLines.length >= 4, `Export warnings detail all non-verified buckets (${warningLines.length} lines)`);

  // Match badge tones: NEVER green below 97% or on HUMAN_OVERRIDE
  assertEqual(getMatchBadgeTone(98.5, "VERIFIED", false).tone, "emerald", ">=97% strong VERIFIED -> emerald");
  assertEqual(getMatchBadgeTone(96.4, "VERIFIED", false).tone, "amber", "96.4% -> amber (NOT emerald)");
  assertEqual(getMatchBadgeTone(99.0, "VERIFIED", true).tone, "amber", "weakEvidence -> amber even at 99%");
  assertEqual(getMatchBadgeTone(50, "NEEDS_HUMAN_VERIFICATION", false).tone, "rose", "50% -> rose (NEVER green)");
  assertEqual(getMatchBadgeTone(0, "INSUFFICIENT_EVIDENCE", false).tone, "rose", "0% -> rose");
  const overrideTone = getMatchBadgeTone(0, "HUMAN_OVERRIDE", false);
  assertEqual(overrideTone.tone, "purple", "HUMAN_OVERRIDE -> purple");
  assert(
    !overrideTone.gateLabel.toLowerCase().includes("rapidfuzz"),
    "HUMAN_OVERRIDE never claims rapidfuzz verified"
  );
}

async function testWeakQuotesAndCopilotSearch(): Promise<void> {
  console.log("\n=== [3.6] Weak Quotes & Non-Inflated Offline Copilot Search ===");

  const weakShort = assessQuoteStrength("Section 4 Penetration Testing");
  assertEqual(weakShort.isWeak, true, '"Section 4 Penetration Testing" flagged as weak quote');

  const strong = assessQuoteStrength(
    "Access control requires multifactor authentication for privileged accounts across all production environments."
  );
  assertEqual(strong.isWeak, false, "Substantive verbatim clause passes quote strength check");

  const demo = buildDemoCorpus();
  const weakItem = demo.workItems.find((w) => w.weak_evidence);
  assert(Boolean(weakItem), "Demo corpus includes an explicit weak_evidence finding");
  assert(
    weakItem!.verification_status !== "VERIFIED",
    "Demo weak_evidence finding is gated to NEEDS_HUMAN_VERIFICATION"
  );

  // Copilot offline partial query must NOT inflate score to >=97%
  const searchRes = localCopilotSearch("encryption rotated KMS certificate", null, {
    documents: demo.documents,
    nodesByDocument: demo.nodesByDocument,
    workItems: demo.workItems,
  });
  assert(
    searchRes.match_score > 0 && searchRes.match_score < 97,
    `Partial offline query score (${searchRes.match_score}%) is non-zero and NOT artificially inflated to 97%`
  );
}

async function testChronosTemporalConflict(): Promise<void> {
  console.log("\n=== [3.7] Chronos Temporal Conflict Dual-Locator ===");

  const demo = buildDemoCorpus();
  const conflict = demo.workItems.find((w) => w.item_type === "TEMPORAL_CONFLICT");
  assert(Boolean(conflict), "Demo corpus contains explicit TEMPORAL_CONFLICT finding");
  assert(
    (conflict?.verified_citations.length ?? 0) >= 2,
    "TEMPORAL_CONFLICT emits BOTH newer (2026) and older (2023) citations"
  );
  const filenames = conflict!.verified_citations.map((c) => c.document_filename || "");
  assert(
    filenames.some((f) => f.includes("2026")) && filenames.some((f) => f.includes("2023")),
    `Citations reference both 2026 and 2023 documents (${filenames.join(" vs ")})`
  );
  assert(
    conflict!.verified_citations.every((c) => Boolean(c.locator)),
    "Both conflicting citations carry structured EvidenceLocator"
  );
  assert(
    Boolean(conflict?.temporal_conflict?.newer_filename && conflict?.temporal_conflict?.older_filename),
    "temporal_conflict metadata carries newer & older filenames"
  );

  // Scoped filter keeps TEMPORAL_CONFLICT visible when filtering by older 2023 doc OR latestOnly=true
  const olderDoc = demo.documents.find((d) => d.filename.includes("2023"));
  assert(Boolean(olderDoc), "Demo corpus includes Legacy_InfoSec_Policy_2023.pdf");
  const scopedOlder = filterWorkItemsForScope({
    items: demo.workItems,
    documents: demo.documents,
    documentId: olderDoc!.id,
    latestOnly: true,
  });
  assert(
    scopedOlder.some((w) => w.id === conflict!.id),
    "TEMPORAL_CONFLICT remains inspectable when scoping to 2023 legacy doc"
  );
}

async function testStoreOverrideNaPriorityAndAtomicReset(): Promise<void> {
  console.log("\n=== [3.8 & 3.9] Store Override, N/A Priority Preservation, Export Columns & Atomic Reset ===");

  const demo = buildDemoCorpus();
  useBertStore.setState({
    backendAvailable: false,
    documents: demo.documents,
    nodesByDocument: demo.nodesByDocument,
    workItems: demo.workItems,
    workItemUndoSnapshots: {},
    auditLogs: [],
    hasCompletedRun: true,
    isSimulating: false,
    corpusStatus: "ready",
  });

  // Pick a P0_CRITICAL item and an INSUFFICIENT_EVIDENCE (0%) item
  const p0Item = demo.workItems.find((w) => w.priority_tier === "P0_CRITICAL");
  assert(Boolean(p0Item), "Located P0_CRITICAL item for Override & N/A tests");
  const p0OrigMatch = p0Item!.gate_telemetry.citation_match;

  // 1. Reject "Hello" via store action
  let helloRejected = false;
  try {
    await useBertStore.getState().resolveWorkItem(p0Item!.id, {
      action: "manual_correction",
      correction: "Hello",
      reason_code: "SME_ATTESTATION",
      no_evidence_attestation: true,
    });
  } catch {
    helloRejected = true;
  }
  assertEqual(helloRejected, true, 'Store resolveWorkItem rejects "Hello" manual override');

  // 2. Valid Manual Override -> HUMAN_OVERRIDE, zero inflation of match %, priority preserved
  await useBertStore.getState().resolveWorkItem(p0Item!.id, {
    action: "manual_correction",
    correction: "Indemnity cap reviewed and counter-signed under master services addendum",
    reason_code: "LEGAL_APPROVED_EXCEPTION",
    no_evidence_attestation: true,
  });
  const overridden = useBertStore.getState().workItems.find((w) => w.id === p0Item!.id)!;
  assertEqual(overridden.verification_status, "HUMAN_OVERRIDE", "Override status is HUMAN_OVERRIDE");
  assertEqual(overridden.priority_tier, "P0_CRITICAL", "Override preserves P0_CRITICAL tier");
  assertEqual(
    overridden.gate_telemetry.citation_match,
    p0OrigMatch,
    "Override NEVER inflates citation_match"
  );
  assertEqual(overridden.gate_telemetry.manual_override, true, "Override flags telemetry.manual_override");

  // Also test an item starting at 0% (e.g. INSUFFICIENT_EVIDENCE or NEEDS_HUMAN_VERIFICATION with 0%)
  const zeroItem = demo.workItems.find((w) => w.gate_telemetry.citation_match === 0);
  if (zeroItem) {
    await useBertStore.getState().resolveWorkItem(zeroItem.id, {
      action: "manual_correction",
      correction: "Verified offline compensating schedule approved by CISO review board",
      reason_code: "COMPENSATING_CONTROL",
      no_evidence_attestation: true,
    });
    const overriddenZero = useBertStore.getState().workItems.find((w) => w.id === zeroItem.id)!;
    assertEqual(overriddenZero.gate_telemetry.citation_match, 0, "0% item stays at 0% on HUMAN_OVERRIDE");
    await useBertStore.getState().undoWorkItem(zeroItem.id);
  }

  // Undo before testing Mark N/A
  await useBertStore.getState().undoWorkItem(p0Item!.id);

  // 3. Mark N/A requires reason and NEVER downgrades P0_CRITICAL
  let emptyNaRejected = false;
  try {
    await useBertStore.getState().resolveWorkItem(p0Item!.id, {
      action: "skip",
      reason_code: "",
      note: "",
    });
  } catch {
    emptyNaRejected = true;
  }
  assertEqual(emptyNaRejected, true, "Store resolveWorkItem rejects Mark N/A without reason");

  await useBertStore.getState().resolveWorkItem(p0Item!.id, {
    action: "skip",
    reason_code: "OUT_OF_SCOPE_PRODUCT",
    note: "Vendor indemnity annex excluded from SaaS-only security scope",
  });
  const markedNa = useBertStore.getState().workItems.find((w) => w.id === p0Item!.id)!;
  assertEqual(markedNa.verification_status, "NOT_APPLICABLE", "Mark N/A sets NOT_APPLICABLE");
  assertEqual(markedNa.priority_tier, "P0_CRITICAL", "Mark N/A NEVER downgrades P0_CRITICAL to P3_LOW");
  assertEqual(markedNa.original_priority_tier, "P0_CRITICAL", "original_priority_tier stays P0_CRITICAL");

  // 4. Export XLSX row schema audit columns
  const rows = buildXlsxExportRows(useBertStore.getState().workItems, demo.documents);
  const naRow = rows.find((r) => r["Question or Clause"] === markedNa.prompt_or_question)!;
  assertEqual(naRow.AI_Status, "NOT_APPLICABLE", "XLSX row stamps AI_Status=NOT_APPLICABLE");
  assertEqual(naRow.Original_Priority, "P0_CRITICAL", "XLSX row stamps Original_Priority=P0_CRITICAL");
  assert(Boolean(naRow.Review_Warning), "XLSX row includes explicit Review_Warning");
  assert("Weak_Evidence" in naRow && "Reason_Code" in naRow, "XLSX row exposes Weak_Evidence & Reason_Code");

  // 5. Atomic reset & simulation cancellation stops in-flight simulation without mutating state
  useBertStore.getState().resetWorkspace();
  const afterReset = useBertStore.getState();
  assertEqual(afterReset.events.length, 0, "resetWorkspace atomically clears events");
  assertEqual(afterReset.workItems.length, 0, "resetWorkspace atomically clears workItems");
  assertEqual(afterReset.documents.length, 0, "resetWorkspace atomically clears documents");
  assertEqual(afterReset.hasCompletedRun, false, "resetWorkspace resets hasCompletedRun=false");

  let staleCompleted = false;
  let simJob = {
    job_id: "sim-job-cancel-test",
    workspace_id: demo.workspaceId,
    batch_id: demo.workItems[0]?.batch_id || "batch-cancel-test",
    status: "RUNNING" as const,
    current_agent_index: 0,
    current_document_id: demo.documents[0].id,
    current_node_index: 0,
    checkpoint_id: "cp-1",
    completed_step_outputs: {},
    user_override_instructions: [],
    error_message: null,
  };
  const fakeSet = (updater: (s: Record<string, unknown>) => Record<string, unknown>) => {
    const next = updater({ activeJob: simJob, workItems: demo.workItems });
    if (next.hasCompletedRun) {
      staleCompleted = true;
    }
    if (next.activeJob) {
      simJob = next.activeJob as typeof simJob;
    }
  };
  const fakeGet = () => ({
    workItems: demo.workItems,
    appendEvent: () => {},
  });
  const runPromise = runLocalMultiAgentReview(fakeSet, fakeGet, demo.documents, simJob);
  // Cancel immediately as if user clicked Load Demo / Reset mid-run
  cancelLocalSimulation();
  await runPromise;
  assertEqual(staleCompleted, false, "Cancelled simulation NEVER sets hasCompletedRun or finishes stale stream");

  // Summary sanity check on empty after reset
  const emptySummary = generateLocalExecutiveSummary({
    documents: [],
    workItems: [],
  });
  assertEqual(emptySummary.total_work_items, 0, "Empty executive summary total_work_items === 0");
}

async function main(): Promise<void> {
  console.log("================================================================================");
  console.log("  PHASE 3 FRONTEND INTEGRITY & LOGIC UNIT SUITE                                ");
  console.log("================================================================================");

  await testValidationHelpers();
  await testMetricsAndBadgeTones();
  await testWeakQuotesAndCopilotSearch();
  await testChronosTemporalConflict();
  await testStoreOverrideNaPriorityAndAtomicReset();

  console.log("\n================================================================================");
  console.log(`  ALL PHASE 3 FRONTEND INTEGRITY CHECKS PASSED (${assertCount} assertions)`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("\nFATAL ERROR:", err);
  (globalThis as unknown as { process?: { exit?: (code: number) => void } }).process?.exit?.(1);
});
