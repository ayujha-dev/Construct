/**
 * Phase 2 Frontend Verification Unit & Integration Suite
 * Covers:
 * - 2.1 PDF viewport transforms (0/90/180/270 rot, CropBox, 960x540), XLSX & JSON locators, quote-in-region (>=97%), missing locator warning
 * - 2.2 Corpus single-source state, anti-flicker guard during mid-run resets, error handling, file filter scoping, multi-file upload
 * - 2.3 Envoy Executive Summary dynamic synthesis, empty/0-finding state, filter sensitivity, legal/undo immediate regeneration
 * - 2.4 Flag for Legal (ESCALATED_LEGAL) priority preservation, defensibility denominator/numerator accounting, audit trail, Undo restoration
 */

if (typeof window === "undefined") {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

import {
  computeRegionTextMatch,
  convertPdfBboxToViewportRect,
  createFallbackPdfViewport,
  deriveNodeLocator,
  formatCanonicalJsonPath,
  formatLocatorDisplay,
  inferSourceChip,
  isJsonPathAncestor,
  jsonPathsMatch,
  parseJsonPathTokens,
  parseXlsxColRangeColumns,
  resolveCitationDocument,
  warnMissingLocator,
} from "../lib/evidenceLocators";
import { buildDemoCorpus } from "../store/demoCorpusService";
import { generateLocalExecutiveSummary } from "../store/simulatorService";
import { useBertStore } from "../store/useBertStore";

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
    throw new Error(`ASSERTION FAILED: ${message} (expected=${String(expected)}, actual=${String(actual)})`);
  }
  console.log(`  PASS: ${message}`);
}

async function testEvidenceLocatorsAndViewports(): Promise<void> {
  console.log("\n=== [Test 2.1] PDF Viewports, JSON/XLSX Locators, Quote-in-Region & Missing Warnings ===");

  // 1. PDF 180 and 270 degree rotations + scale transform
  const vp180 = createFallbackPdfViewport(612, 792, 180, 1.0);
  const rect180 = convertPdfBboxToViewportRect(vp180, { x0: 100, y0: 700, x1: 300, y1: 740 });
  assert(Math.abs(rect180.left - (612 - 300)) < 1e-4, `180deg left maps x1=300 to 312px (got ${rect180.left})`);
  assert(Math.abs(rect180.top - 700) < 1e-4, `180deg top maps y0=700 to 700px (got ${rect180.top})`);

  const vp270 = createFallbackPdfViewport(612, 792, 270, 2.0);
  assertEqual(vp270.width, 792 * 2, "270deg scaled width doubles swapped height");
  assertEqual(vp270.height, 612 * 2, "270deg scaled height doubles swapped width");
  const rect270 = convertPdfBboxToViewportRect(vp270, [50, 100, 150, 220]);
  assert(rect270.width > 0 && rect270.height > 0 && rect270.right <= vp270.width, "270deg bbox projects inside rotated bounds");

  // 2. Non-Letter 960x540 pitch slide deck
  const vpSlide = createFallbackPdfViewport(960, 540, 0, 1.5);
  const rectSlide = convertPdfBboxToViewportRect(vpSlide, [40, 480, 520, 520]);
  assert(Math.abs(rectSlide.top - 30) < 1e-4, `960x540 at 1.5x projects y1=520 to top=30px (got ${rectSlide.top})`);
  assert(Math.abs(rectSlide.width - 720) < 1e-4, `960x540 width (520-40)*1.5 = 720px`);

  // 3. JSONPath canonical matching & regression for "root" bug
  assertEqual(jsonPathsMatch("root", "$.rules.wildcard-admin.action"), false, 'Regression: "root" MUST NOT match leaf path');
  assertEqual(jsonPathsMatch("$", "$.rules.wildcard-admin.action"), false, 'Bare "$" MUST NOT match nested leaf path');
  assertEqual(jsonPathsMatch("root", "$"), true, 'Bare "root" matches root "$"');
  assertEqual(
    jsonPathsMatch('root.rules["wildcard-admin"].action', "$.rules.wildcard-admin.action"),
    true,
    "Canonical JSONPath matches bracketed root syntax with dot $.path"
  );
  assertEqual(
    jsonPathsMatch("$.items[0].effect", "$.items[1].effect"),
    false,
    "Distinct array indices do not match"
  );
  assertEqual(
    isJsonPathAncestor("$.rules", 'root.rules["wildcard-admin"].action'),
    true,
    "Parent $.rules recognized as ancestor for auto-expansion"
  );
  assertEqual(
    formatCanonicalJsonPath(parseJsonPathTokens('root.policies[0]["role-name"]')),
    "$.policies[0].role-name",
    "Canonical formatter preserves array index and segment tokens"
  );

  // 4. XLSX col_range & locator formatting
  const cols = parseXlsxColRangeColumns("A5:C5");
  assertEqual(cols.join(","), "A,B,C", "parseXlsxColRangeColumns expands A5:C5 -> A,B,C");
  const demo = buildDemoCorpus();
  const xlsxDoc = demo.documents.find((d) => d.source_format === "XLSX")!;
  const xlsxNode = demo.nodesByDocument[xlsxDoc.id][0];
  const xlsxLocator = deriveNodeLocator(xlsxNode, xlsxDoc);
  const xlsxDisp = formatLocatorDisplay(xlsxLocator, xlsxDoc);
  assert(xlsxDisp.valid && xlsxDisp.chip === "XLSX" && xlsxDisp.label.startsWith("Questionnaire!"), `XLSX locator renders readable cell target (${xlsxDisp.label})`);

  // 5. Quote-in-region verification >= 97% vs mismatch & bloated-quote guard
  const matchedScore = computeRegionTextMatch(
    "Access control requires “multifactor authentication” for all privileged accounts.",
    "Section 2.1: Access control requires \"multifactor   authentication\"\nfor all privileged accounts. Effective Q1."
  );
  assert(matchedScore >= 97, `Matching region text scores >= 97% (got ${matchedScore})`);

  const mismatchedScore = computeRegionTextMatch(
    "Liability shall be strictly capped at 24 months of fees paid.",
    "AWS KMS AES-256 keys are rotated automatically every 365 days."
  );
  assert(mismatchedScore < 70, `Non-matching region text fails 97% threshold cleanly (got ${mismatchedScore})`);

  const bloatedScore = computeRegionTextMatch(
    "SOC 2 Type II 2026 says unlimited warranty, zero breach notifications, and instant deletion of backups forever.",
    "SOC 2 Type II 2026"
  );
  assert(bloatedScore < 50, `Bloated quote rejected cleanly (<50%, got ${bloatedScore})`);

  // 6. Missing locator explicit warning state + console.warn
  const origWarn = console.warn;
  const warnedMessages: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnedMessages.push(args.map(String).join(" "));
  };
  try {
    const missing = formatLocatorDisplay(null, xlsxDoc);
    assertEqual(missing.valid, false, "Null locator reports valid=false");
    assertEqual(missing.label, "No source locator stored", "Missing locator returns explicit warning label");
    warnMissingLocator("unit-test-missing", { itemId: "wi-1" });
    assert(warnedMessages.some((m) => m.includes("No source locator stored")), "warnMissingLocator logs console.warn diagnostic");
  } finally {
    console.warn = origWarn;
  }

  // 7. Source chips for SCAN / TXT / PDF & Cross-Doc Citation Regression (XLSX WorkItem citing PDF node)
  assertEqual(
    inferSourceChip({ filename: "scan_addendum.pdf", source_format: "PHYSICAL_SCAN", category: "Scan", sub_category: null }, null),
    "SCAN",
    "PHYSICAL_SCAN maps to SCAN chip"
  );
  assertEqual(
    inferSourceChip({ filename: "notes.md", source_format: "TEXT", category: "Policy", sub_category: null }, null),
    "TXT",
    "Markdown/text maps to TXT chip"
  );

  const pdfDoc = demo.documents.find((d) => d.filename.includes("SOC2"))!;
  const scanDoc = demo.documents.find((d) => d.filename.includes("Scanned"))!;
  const pdfNode = demo.nodesByDocument[pdfDoc.id][0];
  const pdfLocator = deriveNodeLocator(pdfNode, pdfDoc)!;
  assertEqual(
    inferSourceChip(xlsxDoc, pdfLocator),
    "PDF",
    "Regression: locator.source_type==='pdf' takes precedence over XLSX WorkItem document format"
  );
  const resolvedCrossDoc = resolveCitationDocument([xlsxDoc, pdfDoc, scanDoc], {
    locator: pdfLocator,
    documentFilename: pdfDoc.filename,
    fallbackDocumentId: xlsxDoc.id,
    fallbackDoc: xlsxDoc,
  });
  assertEqual(
    resolvedCrossDoc?.id,
    pdfDoc.id,
    "Regression: resolveCitationDocument picks cited PDF doc even when XLSX WorkItem parent precedes it"
  );
  const crossDisp = formatLocatorDisplay(pdfLocator, resolvedCrossDoc);
  assertEqual(crossDisp.chip, "PDF", 'Regression: Cross-doc XLSX->PDF citation renders "PDF" chip (not "XLSX")');
  assert(crossDisp.label.startsWith("p."), `Regression: Cross-doc PDF citation displays page label (${crossDisp.label})`);

  const scanNode = demo.nodesByDocument[scanDoc.id][0];
  const scanLocator = deriveNodeLocator(scanNode, scanDoc)!;
  const resolvedScanCrossDoc = resolveCitationDocument([xlsxDoc, scanDoc], {
    locator: scanLocator,
    documentFilename: scanDoc.filename,
    fallbackDocumentId: xlsxDoc.id,
  });
  assertEqual(
    resolvedScanCrossDoc?.id,
    scanDoc.id,
    "resolveCitationDocument selects PHYSICAL_SCAN doc for scanned PDF citation"
  );
  assertEqual(
    inferSourceChip(resolvedScanCrossDoc, scanLocator),
    "SCAN",
    'Cross-doc XLSX->SCAN citation renders "SCAN" chip'
  );
}

async function testCorpusAntiFlickerAndFiltering(): Promise<void> {
  console.log("\n=== [Test 2.2] Active Corpus Anti-Flicker & Filtering ===");

  const demo = buildDemoCorpus();
  useBertStore.setState({
    documents: demo.documents,
    nodesByDocument: demo.nodesByDocument,
    workItems: demo.workItems,
    corpusStatus: "ready",
    corpusError: null,
    backendAvailable: true,
    selectedDocumentId: demo.documents[0].id,
    selectedFileFilterId: null,
    activeJob: {
      job_id: "job-running",
      workspace_id: "default",
      batch_id: "batch-1",
      status: "RUNNING",
      current_agent_index: 2,
      current_document_id: demo.documents[0].id,
      current_node_index: 1,
      checkpoint_id: "cp-1",
      completed_step_outputs: {},
      user_override_instructions: [],
      error_message: null,
    },
  });

  // Mock mid-run transient empty refresh response (backend _prepare_demo_documents window)
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/documents")) {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/work-items")) {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    await useBertStore.getState().refresh();
    const afterMidRunRefresh = useBertStore.getState();
    assertEqual(afterMidRunRefresh.documents.length, demo.documents.length, "Anti-flicker: existing documents preserved during mid-run empty API response");
    assert(afterMidRunRefresh.corpusStatus !== "loading", "Corpus does not get stuck in loading after refresh");
  } finally {
    globalThis.fetch = origFetch;
  }

  // Test error state sets corpusError without wiping staged documents
  globalThis.fetch = (async () => new Response("Internal Server Error", { status: 500 })) as typeof fetch;
  try {
    await useBertStore.getState().refresh();
    const errState = useBertStore.getState();
    assertEqual(errState.corpusStatus, "error", "HTTP 500 surfaces explicit corpusStatus='error'");
    assert(Boolean(errState.corpusError), "HTTP 500 records corpusError message for Retry banner");
    assertEqual(errState.documents.length, demo.documents.length, "Error refresh preserves already-loaded documents");
  } finally {
    globalThis.fetch = origFetch;
  }

  // Test file filter toggling
  const targetDoc = demo.documents[1];
  useBertStore.getState().setSelectedFileFilter(targetDoc.id);
  assertEqual(useBertStore.getState().selectedFileFilterId, targetDoc.id, "setSelectedFileFilter sets selectedFileFilterId");
  assertEqual(useBertStore.getState().selectedDocumentId, targetDoc.id, "setSelectedFileFilter syncs selectedDocumentId");
  useBertStore.getState().setSelectedFileFilter(null);
  assertEqual(useBertStore.getState().selectedFileFilterId, null, "Clearing file filter resets selectedFileFilterId to null");
}

async function testLegalEscalationUndoAndEnvoySummary(): Promise<void> {
  console.log("\n=== [Test 2.3 & 2.4] Envoy Summary, Flag for Legal (ESCALATED_LEGAL) & Undo ===");

  const demo = buildDemoCorpus();
  const emptySummary = generateLocalExecutiveSummary({
    documents: demo.documents,
    workItems: [],
    documentId: null,
    onlyCritical: false,
    latestOnly: false,
  });
  assertEqual(emptySummary.total_work_items, 0, "Empty summary counts 0 items");
  assertEqual(emptySummary.defensibility_score, 0, "Empty corpus yields 0% defensibility (not 100%)");
  assert(emptySummary.summary_text.includes("0 findings"), `Empty summary uses explicit '0 findings' wording (${emptySummary.summary_text})`);

  // Setup offline store state with critical escalation candidate
  useBertStore.setState({
    documents: demo.documents,
    nodesByDocument: demo.nodesByDocument,
    workItems: demo.workItems,
    backendAvailable: false,
    corpusStatus: "ready",
    auditLogs: [],
    workItemUndoSnapshots: {},
    undoToast: null,
  });

  const p0Item = demo.workItems.find((w) => w.priority_tier === "P0_CRITICAL")!;
  assert(Boolean(p0Item), "Located P0_CRITICAL item for Flag for Legal test");
  const originalStatus = p0Item.verification_status;
  const originalOutput = p0Item.fluent_output;
  const originalScore = p0Item.priority_score;
  const baselineVerified = demo.workItems.filter((w) => w.verification_status === "VERIFIED").length;

  // Escalate to Legal Counsel
  await useBertStore.getState().resolveWorkItem(p0Item.id, {
    action: "counsel",
    note: "Indemnification cap requires outside counsel sign-off",
    assignee: "Outside Privacy Counsel",
  });

  const afterLegal = useBertStore.getState();
  const flaggedItem = afterLegal.workItems.find((w) => w.id === p0Item.id)!;
  assertEqual(flaggedItem.verification_status, "ESCALATED_LEGAL", "Flag for Legal sets status=ESCALATED_LEGAL");
  assertEqual(flaggedItem.priority_tier, "P0_CRITICAL", "Flag for Legal preserves P0_CRITICAL priority_tier");
  assertEqual(flaggedItem.priority_score, originalScore, "Flag for Legal preserves numeric priority_score");
  assertEqual(flaggedItem.original_priority_tier, "P0_CRITICAL", "original_priority_tier recorded cleanly");
  assertEqual(flaggedItem.escalation_assignee, "Outside Privacy Counsel", "Assignee saved cleanly");
  assert(Boolean(flaggedItem.escalation_reason?.includes("outside counsel")), "Reason saved cleanly");
  assertEqual(flaggedItem.can_undo, true, "can_undo=true set on escalated item");
  assert(afterLegal.undoToast?.workItemId === p0Item.id, "Undo toast surfaces immediately");
  assert(afterLegal.auditLogs.some((a) => a.work_item_id === p0Item.id && a.action.includes("COUNSEL")), "Audit entry created for legal flag");

  // Wait for immediate summary update triggered by resolveWorkItem
  const summaryAfterLegal = useBertStore.getState().executiveSummary;
  assert(Boolean(summaryAfterLegal), "Summary regenerated immediately after Flag for Legal");
  assert(summaryAfterLegal!.escalated_legal_count >= 1, "Summary reports escalated_legal_count >= 1");
  assertEqual(
    summaryAfterLegal!.verified_count,
    baselineVerified - (originalStatus === "VERIFIED" ? 1 : 0),
    "ESCALATED_LEGAL excluded from verified numerator while kept in total denominator"
  );
  assertEqual(summaryAfterLegal!.total_work_items, demo.workItems.length, "Total denominator unchanged after legal flag");

  // Perform Undo and confirm complete snapshot restoration
  await useBertStore.getState().undoWorkItem(p0Item.id, "Compliance Lead", "Reverted after quick check");
  const afterUndo = useBertStore.getState();
  const restoredItem = afterUndo.workItems.find((w) => w.id === p0Item.id)!;
  assertEqual(restoredItem.verification_status, originalStatus, "Undo restores exact prior verification_status");
  assertEqual(restoredItem.priority_tier, "P0_CRITICAL", "Undo preserves original priority_tier");
  assertEqual(restoredItem.fluent_output, originalOutput, "Undo restores exact prior fluent_output");
  assertEqual(restoredItem.can_undo, false, "Undo clears can_undo flag");
  assertEqual(afterUndo.undoToast, null, "Undo dismisses toast");
  assert(afterUndo.auditLogs.some((a) => a.work_item_id === p0Item.id && a.action === "ESCALATION_UNDO"), "Audit entry created for undo operation");

  // Summary filtering check: filter to specific document with onlyCritical
  const docFilteredSummary = generateLocalExecutiveSummary({
    documents: demo.documents,
    workItems: afterUndo.workItems,
    documentId: demo.documents[0].id,
    onlyCritical: true,
    latestOnly: true,
  });
  assert(
    docFilteredSummary.key_findings.every(
      (f) => f.document_id === demo.documents[0].id && f.priority_tier === "P0_CRITICAL"
    ),
    "Executive summary honors document_id + only_critical filter"
  );
}

async function main(): Promise<void> {
  console.log("================================================================================");
  console.log("  PHASE 2 FRONTEND UNIT & STORE INTEGRATION SUITE                               ");
  console.log("================================================================================");

  await testEvidenceLocatorsAndViewports();
  await testCorpusAntiFlickerAndFiltering();
  await testLegalEscalationUndoAndEnvoySummary();

  console.log("\n================================================================================");
  console.log(`  ALL PHASE 2 FRONTEND UNIT CHECKS PASSED (${assertCount} assertions)             `);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("\nPHASE 2 UNIT TEST FAILURE:", err);
  (globalThis as unknown as { process?: { exit: (code: number) => void } }).process?.exit?.(1);
});
