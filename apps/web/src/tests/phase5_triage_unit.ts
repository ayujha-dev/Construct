/**
 * Phase 5 HITL Triage Throughput Verification Unit Suite
 * Covers:
 * 1. Priority-ordered triage queue selector (`P0_CRITICAL` -> `P1_HIGH` -> `P2_MEDIUM` -> `P3_LOW`)
 * 2. `getAcceptActionState`: hidden without machine/rescue text, Vision Rescue label exclusive to `has_vision_rescue`
 * 3. Per-item `evidenceVisible` gate (`canAcceptWithEvidence`)
 * 4. `Resolved` filter tab keeping `VERIFIED` / `HUMAN_OVERRIDE` / `NOT_APPLICABLE` visible
 * 5. `demoCorpusService` & `simulatorService` parity for `machine_extracted_text` / `vision_rescue_text`
 * 6. Keyboard shortcut mapping (`J`/`K`/`A`/`O`/`L`/`N`/`Enter`/`Escape`, ignored in editable inputs)
 * 7. Store `resolveWorkItem` strict accept guard, `batchResolve`, and 1-click single & bulk Undo
 */

if (typeof window === "undefined") {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

import {
  canAcceptWithEvidence,
  filterTriageQueue,
  getAcceptActionState,
  getBulkAcceptEligibleIds,
  getTriageTabCounts,
  mapTriageKeyToCommand,
  matchesTriageTab,
  sortTriageQueue,
} from "../lib/triageQueue";
import { buildDemoCorpus } from "../store/demoCorpusService";
import { localItems } from "../store/simulatorService";
import { useBertStore } from "../store/useBertStore";
import type { Document, WorkItem } from "../types/bert";

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

function makeItem(base: WorkItem, id: string, overrides: Partial<WorkItem>): WorkItem {
  return {
    ...base,
    id,
    ...overrides,
  };
}

async function testPriorityOrderingAndFilters(): Promise<void> {
  console.log("\n=== [5.1] Priority Ordering & Filter Tabs ===");
  const demo = buildDemoCorpus();
  const base = demo.workItems[0];

  const unsorted: WorkItem[] = [
    makeItem(base, "low-1", {
      priority_tier: "P3_LOW",
      priority_score: 20,
      verification_status: "NEEDS_HUMAN_VERIFICATION",
      created_at: "2026-11-12T10:00:01Z",
    }),
    makeItem(base, "med-1", {
      priority_tier: "P2_MEDIUM",
      priority_score: 50,
      verification_status: "VERIFIED",
      created_at: "2026-11-12T10:00:02Z",
    }),
    makeItem(base, "crit-later", {
      priority_tier: "P0_CRITICAL",
      priority_score: 95,
      verification_status: "INSUFFICIENT_EVIDENCE",
      created_at: "2026-11-12T10:00:30Z",
    }),
    makeItem(base, "high-1", {
      priority_tier: "P1_HIGH",
      priority_score: 80,
      verification_status: "ESCALATED_LEGAL",
      created_at: "2026-11-12T10:00:05Z",
    }),
    makeItem(base, "crit-earlier", {
      priority_tier: "P0_CRITICAL",
      priority_score: 100,
      verification_status: "HUMAN_OVERRIDE",
      created_at: "2026-11-12T10:00:10Z",
    }),
    makeItem(base, "na-1", {
      priority_tier: "P2_MEDIUM",
      priority_score: 45,
      verification_status: "NOT_APPLICABLE",
      created_at: "2026-11-12T10:00:15Z",
    }),
  ];

  const sorted = sortTriageQueue(unsorted);
  assertEqual(
    sorted.map((i) => i.id).join(","),
    "crit-earlier,crit-later,high-1,med-1,na-1,low-1",
    "sortTriageQueue strictly orders P0_CRITICAL -> P1_HIGH -> P2_MEDIUM -> P3_LOW and score DESC"
  );

  // Filter tabs
  const pending = filterTriageQueue(unsorted, "pending");
  assertEqual(pending.map((i) => i.id).join(","), "crit-later,low-1", "Needs Review shows INSUFFICIENT_EVIDENCE + NEEDS_HUMAN_VERIFICATION");

  const legal = filterTriageQueue(unsorted, "escalated_legal");
  assertEqual(legal.map((i) => i.id).join(","), "high-1", "Legal tab shows ESCALATED_LEGAL");

  const resolved = filterTriageQueue(unsorted, "resolved");
  assertEqual(
    resolved.map((i) => i.id).join(","),
    "crit-earlier,med-1,na-1",
    "Resolved tab keeps VERIFIED, HUMAN_OVERRIDE, and NOT_APPLICABLE visible"
  );
  assert(matchesTriageTab(unsorted[1], "resolved"), "VERIFIED matches resolved tab");
  assert(matchesTriageTab(unsorted[4], "resolved"), "HUMAN_OVERRIDE matches resolved tab");
  assert(matchesTriageTab(unsorted[5], "resolved"), "NOT_APPLICABLE matches resolved tab");

  const counts = getTriageTabCounts(unsorted);
  assertEqual(counts.pending, 2, "Pending tab count accurate");
  assertEqual(counts.escalated_legal, 1, "Legal tab count accurate");
  assertEqual(counts.resolved, 3, "Resolved tab count accurate");
  assertEqual(counts.all, 6, "All tab count accurate");
}

async function testAcceptStateAndEvidenceVisibleGate(): Promise<void> {
  console.log("\n=== [5.2] Accept Action State & Evidence-Visible Gate ===");
  const demo = buildDemoCorpus();
  const base = demo.workItems[0];

  const missingProof = makeItem(base, "empty-1", {
    verification_status: "INSUFFICIENT_EVIDENCE",
    has_vision_rescue: false,
    vision_rescue_text: null,
    machine_extracted_text: null,
    fluent_output: "INSUFFICIENT EVIDENCE — HUMAN VERIFICATION REQUIRED",
  });
  const emptyState = getAcceptActionState(missingProof);
  assertEqual(emptyState.visible, false, "Accept hidden when no machine_extracted_text or vision_rescue_text exists");
  assertEqual(emptyState.label, null, "Accept label null when hidden");
  assertEqual(emptyState.kind, null, "Accept kind null when hidden");
  assertEqual(
    canAcceptWithEvidence(missingProof, { "empty-1": true }),
    false,
    "canAcceptWithEvidence stays false without machine/rescue text even when evidence card is visible"
  );

  const rescueItem = makeItem(base, "rescue-1", {
    verification_status: "NEEDS_HUMAN_VERIFICATION",
    has_vision_rescue: true,
    vision_rescue_text: "STAMP NOTE: Signed compliance addendum 2026-03-01",
    machine_extracted_text: null,
  });
  const rescueState = getAcceptActionState(rescueItem);
  assertEqual(rescueState.visible, true, "Accept visible for vision rescue item");
  assertEqual(rescueState.label, "Accept Vision Rescue Text", "Vision Rescue label exclusive to rescue items");
  assertEqual(rescueState.kind, "rescue", "Kind is rescue");
  assertEqual(
    canAcceptWithEvidence(rescueItem, { "rescue-1": false }),
    false,
    "Accept disabled while evidenceVisible=false"
  );
  assertEqual(
    canAcceptWithEvidence(rescueItem, {}),
    false,
    "Accept disabled when evidence visibility is not yet confirmed"
  );
  assertEqual(
    canAcceptWithEvidence(rescueItem, { "rescue-1": true }),
    true,
    "Accept enabled once evidenceVisible=true in left pane"
  );

  const alreadyVerifiedRescue = makeItem(base, "rescue-verified", {
    verification_status: "VERIFIED",
    has_vision_rescue: true,
    vision_rescue_text: "STAMP NOTE: Signed compliance addendum 2026-03-01",
  });
  assertEqual(
    canAcceptWithEvidence(alreadyVerifiedRescue, { "rescue-verified": true }),
    false,
    "Already-VERIFIED item stays disabled for re-accept"
  );

  const machineItem = makeItem(base, "machine-1", {
    verification_status: "NEEDS_HUMAN_VERIFICATION",
    has_vision_rescue: false,
    vision_rescue_text: null,
    machine_extracted_text: "All production databases enforce AES-256 encryption at rest.",
  });
  const machineState = getAcceptActionState(machineItem);
  assertEqual(machineState.visible, true, "Accept visible for machine-extracted item");
  assertEqual(
    machineState.label,
    "Accept Extracted Evidence",
    "Non-rescue machine item gets 'Accept Extracted Evidence' label (not Vision Rescue)"
  );
  assertEqual(machineState.kind, "machine", "Kind is machine");

  const sentinelAsEmpty = makeItem(base, "sentinel-1", {
    has_vision_rescue: false,
    vision_rescue_text: null,
    machine_extracted_text: "INSUFFICIENT EVIDENCE — HUMAN VERIFICATION REQUIRED",
  });
  assertEqual(
    getAcceptActionState(sentinelAsEmpty).visible,
    false,
    "INSUFFICIENT EVIDENCE sentinel string does not unlock Accept"
  );

  const eligibleIds = getBulkAcceptEligibleIds([missingProof, rescueItem, machineItem]);
  assertEqual(
    eligibleIds.join(","),
    "rescue-1,machine-1",
    "getBulkAcceptEligibleIds filters out items lacking machine/rescue text"
  );
}

async function testDemoAndSimulatorParity(): Promise<void> {
  console.log("\n=== [5.3] Demo Corpus & Local Simulator Parity ===");
  const demo = buildDemoCorpus();
  const scanItem = demo.workItems.find((w) => w.has_vision_rescue);
  const missingItem = demo.workItems.find(
    (w) => w.verification_status === "INSUFFICIENT_EVIDENCE" && !w.has_vision_rescue
  );
  const verifiedItem = demo.workItems.find((w) => w.verification_status === "VERIFIED");

  assert(Boolean(scanItem && scanItem.vision_rescue_text), "Demo corpus includes Vision Rescue scan item");
  assertEqual(
    getAcceptActionState(scanItem!).label,
    "Accept Vision Rescue Text",
    "Demo scan item yields Accept Vision Rescue Text"
  );
  assert(Boolean(missingItem), "Demo corpus includes missing-proof INSUFFICIENT_EVIDENCE item");
  assertEqual(
    getAcceptActionState(missingItem!).visible,
    false,
    "Demo missing-proof item hides Accept button"
  );
  assert(Boolean(verifiedItem?.machine_extracted_text), "Demo verified item populates machine_extracted_text");
  assertEqual(verifiedItem?.has_vision_rescue, false, "Demo verified item has has_vision_rescue=false");

  const scanDoc: Document = {
    id: "sim-scan-doc",
    filename: "Signed_Compliance_Addendum_Scan.pdf",
    source_format: "PHYSICAL_SCAN",
    category: "Degraded Scans & Physical",
    sub_category: "Scanned PDF",
    priority_tier: "P0_CRITICAL",
    priority_score: 95,
    ast_checksum: "a".repeat(64),
    file_size_bytes: 1024,
    total_pages: 1,
    total_ast_nodes: 2,
    processing_status: "COMPLETED",
    effective_date: null,
    is_latest_version: true,
    workspace_id: "default",
  };

  const simItems = localItems(
    scanDoc,
    [
      {
        id: "sim-node-1",
        document_id: "sim-scan-doc",
        node_type: "STAMP_NOTE",
        section_path: "Page 1 (Scanned Region)",
        verbatim_text: "[LOW_CONFIDENCE] STAMP NOTE: Signed addendum dated 2026-03-01",
        structured_payload: null,
        page_number: 1,
        bounding_box: null,
        ocr_confidence: 0.72,
        node_order: 0,
        locator: { source_type: "pdf", doc_id: "sim-scan-doc", page: 1, bbox: null, is_scan: true },
      },
      {
        id: "sim-node-2",
        document_id: "sim-scan-doc",
        node_type: "PARAGRAPH",
        section_path: "Missing Section",
        verbatim_text: "Evidence missing for cyber insurance limit",
        structured_payload: null,
        page_number: 1,
        bounding_box: null,
        ocr_confidence: 0.99,
        node_order: 1,
        locator: { source_type: "pdf", doc_id: "sim-scan-doc", page: 1, bbox: null },
      },
      {
        id: "sim-node-3",
        document_id: "sim-scan-doc",
        node_type: "PARAGRAPH",
        section_path: "Access Control",
        verbatim_text: "Access control requires multifactor authentication for all privileged administrative logins.",
        structured_payload: null,
        page_number: 1,
        bounding_box: null,
        ocr_confidence: 0.99,
        node_order: 2,
        locator: { source_type: "pdf", doc_id: "sim-scan-doc", page: 1, bbox: null },
      },
    ],
    "default",
    "batch-1"
  );

  const simRescue = simItems.find((i) => i.has_vision_rescue);
  const simMissing = simItems.find(
    (i) => !i.has_vision_rescue && i.verification_status === "INSUFFICIENT_EVIDENCE"
  );
  const simVerified = simItems.find((i) => i.verification_status === "VERIFIED");
  assert(Boolean(simRescue?.vision_rescue_text), "Simulator sets has_vision_rescue + vision_rescue_text for STAMP_NOTE/low OCR");
  assertEqual(simMissing?.machine_extracted_text ?? null, null, "Simulator leaves machine_extracted_text null on missing proof");
  assert(Boolean(simVerified?.machine_extracted_text), "Simulator populates machine_extracted_text on verified clauses");
  assertEqual(simVerified?.has_vision_rescue, false, "Simulator sets has_vision_rescue=false on verified clauses");
}

async function testKeyboardShortcuts(): Promise<void> {
  console.log("\n=== [5.4] Keyboard Shortcut Mapping & Input Guard ===");
  assertEqual(
    mapTriageKeyToCommand({ key: "j", targetTagName: "DIV", canAccept: false }),
    "next",
    "J maps to next"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "K", targetTagName: "BODY", canAccept: false }),
    "prev",
    "K maps to prev"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "a", targetTagName: "BUTTON", canAccept: false }),
    null,
    "A ignored when canAccept=false"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "a", targetTagName: "BUTTON", canAccept: true }),
    "accept",
    "A maps to accept when canAccept=true"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "o", targetTagName: "DIV" }),
    "override",
    "O maps to override"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "l", targetTagName: "DIV" }),
    "legal",
    "L maps to legal"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "n", targetTagName: "DIV" }),
    "na",
    "N maps to na"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "Enter", targetTagName: "DIV", hasActiveForm: true }),
    "confirm",
    "Enter maps to confirm when active form open"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "Enter", targetTagName: "DIV", hasActiveForm: false }),
    null,
    "Enter does nothing when no form is active"
  );

  for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
    assertEqual(
      mapTriageKeyToCommand({ key: "j", targetTagName: tag, canAccept: true, hasActiveForm: true }),
      null,
      `Shortcuts ignored inside ${tag}`
    );
  }
  assertEqual(
    mapTriageKeyToCommand({ key: "a", targetTagName: "DIV", isContentEditable: true, canAccept: true }),
    null,
    "Shortcuts ignored inside contentEditable"
  );
  assertEqual(
    mapTriageKeyToCommand({ key: "a", targetTagName: "DIV", metaKey: true, canAccept: true }),
    null,
    "Shortcuts ignored when Meta/Cmd modifier pressed"
  );
}

async function testStoreResolveBatchAndUndo(): Promise<void> {
  console.log("\n=== [5.5] Store Strict Approve Guard, Bulk Resolve & 1-Click Undo ===");
  const demo = buildDemoCorpus();
  const emptyItem = demo.workItems.find(
    (w) => w.verification_status === "INSUFFICIENT_EVIDENCE" && !w.has_vision_rescue
  )!;
  const rescueItem = demo.workItems.find((w) => w.has_vision_rescue)!;
  const weakItem = demo.workItems.find(
    (w) => w.verification_status === "NEEDS_HUMAN_VERIFICATION" && !w.has_vision_rescue
  )!;

  useBertStore.setState({
    backendAvailable: false,
    documents: demo.documents,
    nodesByDocument: demo.nodesByDocument,
    workItems: demo.workItems.map((i) => ({ ...i })),
    workItemUndoSnapshots: {},
    undoToast: null,
  });

  let rejectedEmpty = false;
  try {
    await useBertStore.getState().resolveWorkItem(emptyItem.id, "approve", "Fabricated");
  } catch {
    rejectedEmpty = true;
  }
  assert(rejectedEmpty, "Offline store resolveWorkItem rejects approve when item has no machine/rescue text");

  // Approve vision rescue item
  await useBertStore.getState().resolveWorkItem(rescueItem.id, "approve");
  let state = useBertStore.getState();
  const updatedRescue = state.workItems.find((w) => w.id === rescueItem.id)!;
  assertEqual(updatedRescue.verification_status, "VERIFIED", "Vision rescue approve sets VERIFIED");
  assertEqual(
    updatedRescue.fluent_output,
    rescueItem.vision_rescue_text,
    "Vision rescue approve adopts vision_rescue_text"
  );
  assertEqual(state.undoToast?.workItemIds.join(","), rescueItem.id, "Single approve emits undoToast");

  // Undo single rescue approval
  await useBertStore.getState().undoWorkItem(rescueItem.id);
  state = useBertStore.getState();
  assertEqual(
    state.workItems.find((w) => w.id === rescueItem.id)?.verification_status,
    rescueItem.verification_status,
    "Single Undo restores prior status"
  );
  assertEqual(state.undoToast, null, "Single Undo clears undoToast");

  // Batch approve mixing emptyItem (ineligible) + rescueItem + weakItem (eligible)
  const batchApproveRes = await useBertStore.getState().batchResolve(
    [emptyItem.id, rescueItem.id, weakItem.id],
    { action: "approve", note: "Bulk verify machine evidence" }
  );
  assertEqual(batchApproveRes.updated_count, 2, "Bulk approve updates 2 eligible items");
  assertEqual(batchApproveRes.skipped_ids.join(","), emptyItem.id, "Bulk approve skips missing-proof item");

  state = useBertStore.getState();
  assertEqual(state.undoToast?.isBulk, true, "Bulk action emits bulk undoToast");
  assertEqual(
    state.undoToast?.workItemIds.length,
    2,
    "Bulk undoToast holds all updated workItemIds"
  );

  // 1-click Bulk Undo
  await useBertStore.getState().undoWorkItems(state.undoToast!.workItemIds);
  state = useBertStore.getState();
  assertEqual(
    state.workItems.find((w) => w.id === rescueItem.id)?.verification_status,
    rescueItem.verification_status,
    "Bulk Undo restores rescue item"
  );
  assertEqual(
    state.workItems.find((w) => w.id === weakItem.id)?.verification_status,
    weakItem.verification_status,
    "Bulk Undo restores weak-evidence item"
  );
  assertEqual(state.undoToast, null, "Bulk Undo clears undoToast");

  // Bulk Flag for Legal + Bulk Mark N/A
  const legalBatch = await useBertStore.getState().batchResolve(
    [emptyItem.id, rescueItem.id],
    { action: "counsel", assignee: "General Counsel", note: "Escalate together" }
  );
  assertEqual(legalBatch.updated_count, 2, "Bulk counsel flags both items");
  assert(
    useBertStore
      .getState()
      .workItems.filter((w) => w.id === emptyItem.id || w.id === rescueItem.id)
      .every((w) => w.verification_status === "ESCALATED_LEGAL"),
    "Both bulk-flagged items enter ESCALATED_LEGAL"
  );

  await useBertStore.getState().undoWorkItems(legalBatch.items.map((i) => i.id));
  const naBatch = await useBertStore.getState().batchResolve(
    [emptyItem.id, weakItem.id],
    { action: "skip", reason_code: "OUT_OF_SCOPE_PRODUCT", note: "Not part of SaaS scope" }
  );
  assertEqual(naBatch.updated_count, 2, "Bulk N/A updates both items");
  assert(
    useBertStore
      .getState()
      .workItems.filter((w) => w.id === emptyItem.id || w.id === weakItem.id)
      .every((w) => w.verification_status === "NOT_APPLICABLE"),
    "Both bulk N/A items enter NOT_APPLICABLE"
  );
}

async function main(): Promise<void> {
  await testPriorityOrderingAndFilters();
  await testAcceptStateAndEvidenceVisibleGate();
  await testDemoAndSimulatorParity();
  await testKeyboardShortcuts();
  await testStoreResolveBatchAndUndo();
  console.log(`\nALL PHASE 5 TRIAGE UNIT TESTS PASSED (${assertCount} assertions)!`);
}

main().catch((err) => {
  console.error(err);
  throw err;
});
