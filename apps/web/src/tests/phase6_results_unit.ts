/**
 * Phase 6 Results Page Cleanup Unit Suite
 * Covers:
 * 1. Chart zero-state (`filteredItems.length === 0`, empty corpus, or no matching docs)
 * 2. `metricType` ("count" vs "confidence") genuine distribution & `0%` zero-phantom-bar handling
 * 3. `enforceLatestVersion` filtering superseded-doc findings while preserving `TEMPORAL_CONFLICT`
 * 4. Zero `P1_HIGH` double counting & bounded stacked segment/column heights (`<= 100%`)
 * 5. Empty-state selection & honest defensibility (`defensibilityScore === null` when empty)
 * 6. `<Select />` props & accessible keyboard state machine (ArrowUp/ArrowDown/Enter/Escape/Home/End/Tab)
 */

if (typeof window === "undefined") {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

import {
  computeSelectKeyTransition,
  getFirstEnabledOptionIndex,
  getLastEnabledOptionIndex,
  getNextEnabledOptionIndex,
  type SelectOption,
} from "../lib/selectModel";
import {
  averageConfidence,
  buildCautionSegments,
  computeResultsChartModel,
} from "../lib/resultsChart";
import {
  computeWorkItemMetrics,
  filterWorkItemsForScope,
} from "../lib/workItemMetrics";
import { buildDemoCorpus } from "../store/demoCorpusService";
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

function makeItem(base: WorkItem, id: string, overrides: Partial<WorkItem>): WorkItem {
  return {
    ...base,
    id,
    ...overrides,
  };
}

async function testChartZeroStateAndBoundedHeights(): Promise<void> {
  console.log("\n=== [6.1] Chart Zero-State & Bounded Stacked Heights ===");
  const demo = buildDemoCorpus();

  // Empty filteredItems even when documents exist -> explicit zero-state, never phantom bars
  const emptyFilteredChart = computeResultsChartModel({
    filteredItems: [],
    documents: demo.documents,
    selectedDocFilter: "ALL",
    groupedBy: "documents",
    segmentedBy: "category",
    metricType: "count",
  });
  assertEqual(emptyFilteredChart.isEmpty, true, "Empty filteredItems produces chart isEmpty=true");
  assertEqual(emptyFilteredChart.columns.length, 0, "Empty filteredItems produces 0 columns (no phantom bars)");

  // Empty documents & items
  const emptyCorpusChart = computeResultsChartModel({
    filteredItems: [],
    documents: [],
    selectedDocFilter: "ALL",
    groupedBy: "categories",
    segmentedBy: "caution",
    metricType: "confidence",
  });
  assertEqual(emptyCorpusChart.isEmpty, true, "Empty corpus produces chart isEmpty=true");
  assertEqual(emptyCorpusChart.columns.length, 0, "Empty corpus produces 0 columns");

  // Full demo chart bounds: every colHeightPercent <= 100 and segment heightPercent sum <= 100
  const fullChart = computeResultsChartModel({
    filteredItems: demo.workItems,
    documents: demo.documents,
    selectedDocFilter: "ALL",
    groupedBy: "documents",
    segmentedBy: "category",
    metricType: "count",
  });
  assertEqual(fullChart.isEmpty, false, "Full demo corpus chart is non-empty");
  for (const col of fullChart.columns) {
    assert(
      col.colHeightPercent > 0 && col.colHeightPercent <= 100,
      `Column '${col.fullLabel}' height bounded (${col.colHeightPercent}%)`
    );
    const segSum = col.segments.reduce((acc, s) => acc + s.heightPercent, 0);
    assert(
      segSum <= 100 && segSum >= 99,
      `Column '${col.fullLabel}' stacked segments sum cleanly <= 100% (got ${segSum}%)`
    );
  }
}

async function testMetricTypeConfidenceVsCount(): Promise<void> {
  console.log("\n=== [6.2] metricType 'count' vs 'confidence' Distribution ===");
  const demo = buildDemoCorpus();
  const base = demo.workItems[0];
  const docA = demo.documents[0];
  const docB = demo.documents[1];

  const items: WorkItem[] = [
    makeItem(base, "c1", {
      document_id: docA.id,
      category: "Access Control",
      verification_status: "VERIFIED",
      priority_tier: "P2_MEDIUM",
      gate_telemetry: { ...base.gate_telemetry, citation_match: 100 },
      verified_citations: [],
      temporal_conflict: null,
    }),
    makeItem(base, "c2", {
      document_id: docA.id,
      category: "Data Retention",
      verification_status: "NEEDS_HUMAN_VERIFICATION",
      priority_tier: "P1_HIGH",
      gate_telemetry: { ...base.gate_telemetry, citation_match: 50 },
      verified_citations: [],
      temporal_conflict: null,
    }),
    makeItem(base, "c3", {
      document_id: docB.id,
      category: "Access Control",
      verification_status: "INSUFFICIENT_EVIDENCE",
      priority_tier: "P0_CRITICAL",
      gate_telemetry: { ...base.gate_telemetry, citation_match: 0 },
      verified_citations: [],
      temporal_conflict: null,
    }),
  ];

  const countModel = computeResultsChartModel({
    filteredItems: items,
    documents: [docA, docB],
    selectedDocFilter: "ALL",
    groupedBy: "documents",
    segmentedBy: "category",
    metricType: "count",
  });
  const confModel = computeResultsChartModel({
    filteredItems: items,
    documents: [docA, docB],
    selectedDocFilter: "ALL",
    groupedBy: "documents",
    segmentedBy: "category",
    metricType: "confidence",
  });

  const countColA = countModel.columns.find((c) => c.fullLabel === docA.filename)!;
  const confColA = confModel.columns.find((c) => c.fullLabel === docA.filename)!;
  const confColB = confModel.columns.find((c) => c.fullLabel === docB.filename)!;

  assertEqual(countColA.total, 2, "Count mode reports 2 items for Doc A");
  assertEqual(confColA.total, 75, "Confidence mode reports avg(100, 50) = 75% for Doc A");
  assertEqual(confModel.maxChartValue, 100, "Confidence mode maxChartValue is 100");
  assertEqual(confColA.colHeightPercent, 75, "Confidence mode bar height is 75%");
  assertEqual(confColB.total, 0, "Confidence mode reports 0% for all-0% Doc B");
  assertEqual(confColB.colHeightPercent, 0, "0% confidence column gets 0% bar height (zero phantom bar)");

  // Confidence segments reflect weighted confidence contribution (Access Control 50 vs Data Retention 25)
  const accessSeg = confColA.segments.find((s) => s.key === "Access Control")!;
  const retentionSeg = confColA.segments.find((s) => s.key === "Data Retention")!;
  assertEqual(accessSeg.avgConfidence, 100, "Access Control segment avgConfidence === 100%");
  assertEqual(retentionSeg.avgConfidence, 50, "Data Retention segment avgConfidence === 50%");
  assert(
    accessSeg.heightPercent > retentionSeg.heightPercent,
    `Confidence segment heights proportional to confidence (${accessSeg.heightPercent}% > ${retentionSeg.heightPercent}%)`
  );
  assertEqual(averageConfidence([]), 0, "averageConfidence([]) returns 0");
}

async function testZeroP1HighDoubleCounting(): Promise<void> {
  console.log("\n=== [6.3] Zero P1_HIGH Double Counting & Caution Segment Exclusivity ===");
  const demo = buildDemoCorpus();
  const base = demo.workItems[0];

  const items: WorkItem[] = [
    makeItem(base, "p0-open", { priority_tier: "P0_CRITICAL", verification_status: "INSUFFICIENT_EVIDENCE" }),
    makeItem(base, "p1-open", { priority_tier: "P1_HIGH", verification_status: "NEEDS_HUMAN_VERIFICATION" }),
    makeItem(base, "p1-verified", { priority_tier: "P1_HIGH", verification_status: "VERIFIED" }),
    makeItem(base, "p1-override", { priority_tier: "P1_HIGH", verification_status: "HUMAN_OVERRIDE" }),
    makeItem(base, "p1-legal", { priority_tier: "P1_HIGH", verification_status: "ESCALATED_LEGAL" }),
    makeItem(base, "p1-na", { priority_tier: "P1_HIGH", verification_status: "NOT_APPLICABLE" }),
  ];

  const segs = buildCautionSegments(items, "count");
  const totalCounted = segs.reduce((acc, s) => acc + s.count, 0);
  const totalHeight = segs.reduce((acc, s) => acc + s.heightPercent, 0);

  assertEqual(totalCounted, items.length, "Caution segments count every item exactly once (no P1_HIGH double counting)");
  assertEqual(
    segs.find((s) => s.key === "Unresolved / Review")?.count,
    1,
    "Only open P1_HIGH item lands in Unresolved / Review"
  );
  assertEqual(segs.find((s) => s.key === "Critical Open")?.count, 1, "Only open P0_CRITICAL item lands in Critical Open");
  assertEqual(segs.find((s) => s.key === "Machine Verified")?.count, 1, "P1_HIGH VERIFIED counted only in Machine Verified");
  assert(totalHeight <= 100 && totalHeight >= 99, `Caution segment height sum bounded <= 100% (${totalHeight}%)`);
}

async function testEnforceLatestVersionAndEmptyMetrics(): Promise<void> {
  console.log("\n=== [6.4] enforceLatestVersion, TEMPORAL_CONFLICT & Honest Empty Metrics ===");
  const demo = buildDemoCorpus();
  const base = demo.workItems[0];
  const latestDoc = demo.documents.find((d) => d.is_latest_version)!;
  const legacyDoc = demo.documents.find((d) => !d.is_latest_version);

  const syntheticLegacyDoc = legacyDoc ?? {
    ...latestDoc,
    id: "doc-legacy-2023",
    filename: "Legacy_InfoSec_Policy_2023.pdf",
    is_latest_version: false,
  };
  const docs = legacyDoc ? demo.documents : [...demo.documents, syntheticLegacyDoc];

  const legacyOnlyFinding = makeItem(base, "legacy-finding", {
    document_id: syntheticLegacyDoc.id,
    item_type: "DOCUMENT_FINDING",
    verified_citations: [],
    temporal_conflict: null,
  });
  const temporalConflict =
    demo.workItems.find((w) => w.item_type === "TEMPORAL_CONFLICT") ??
    makeItem(base, "temporal-1", {
      document_id: syntheticLegacyDoc.id,
      item_type: "TEMPORAL_CONFLICT",
      temporal_conflict: {
        newer_doc_id: latestDoc.id,
        newer_filename: latestDoc.filename,
        newer_quote: "Passwords must be at least 14 characters",
        older_doc_id: syntheticLegacyDoc.id,
        older_filename: syntheticLegacyDoc.filename,
        older_quote: "Passwords must be at least 8 characters",
        resolution: "2026 SOC 2 supersedes 2023 Legacy InfoSec Policy",
      },
    });

  const scoped = filterWorkItemsForScope({
    items: [...demo.workItems, legacyOnlyFinding, temporalConflict],
    documents: docs,
    documentId: null,
    onlyCritical: false,
    latestOnly: true,
  });

  assert(
    !scoped.some((w) => w.id === legacyOnlyFinding.id),
    "enforceLatestVersion filters out non-conflict finding from superseded doc"
  );
  assert(
    scoped.some((w) => w.id === temporalConflict.id),
    "enforceLatestVersion preserves TEMPORAL_CONFLICT so supersession governance stays visible"
  );

  // Empty metrics never report 100%
  const emptyMetrics = computeWorkItemMetrics([]);
  assertEqual(emptyMetrics.total, 0, "Empty metrics total === 0");
  assertEqual(emptyMetrics.defensibilityScore, null, "Empty metrics defensibilityScore === null (never 100%)");
}

async function testSelectKeyboardModel(): Promise<void> {
  console.log("\n=== [6.5] <Select /> Accessible Keyboard State Machine ===");
  const options: SelectOption<string>[] = [
    { value: "ALL", label: "All Documents" },
    { value: "doc-1", label: "SOC2_2026.pdf" },
    { value: "doc-disabled", label: "Disabled Item", disabled: true },
    { value: "doc-2", label: "IAM_Config.json" },
  ];

  assertEqual(getFirstEnabledOptionIndex(options), 0, "First enabled option index is 0");
  assertEqual(getLastEnabledOptionIndex(options), 3, "Last enabled option index is 3");
  assertEqual(
    getNextEnabledOptionIndex(options, 1, 1),
    3,
    "ArrowDown skips disabled option at index 2 -> lands on 3"
  );
  assertEqual(
    getNextEnabledOptionIndex(options, 3, -1),
    1,
    "ArrowUp skips disabled option at index 2 -> lands on 1"
  );

  // Closed + ArrowDown -> opens at selectedIndex
  const openRes = computeSelectKeyTransition({
    key: "ArrowDown",
    isOpen: false,
    activeIndex: 0,
    selectedIndex: 1,
    options,
  });
  assertEqual(openRes.handled, true, "Closed ArrowDown handled");
  assertEqual(openRes.nextOpen, true, "Closed ArrowDown opens popup");
  assertEqual(openRes.nextActiveIndex, 1, "Closed ArrowDown starts at selectedIndex");

  // Open + ArrowDown -> advances skipping disabled -> Enter commits value
  const navRes = computeSelectKeyTransition({
    key: "ArrowDown",
    isOpen: true,
    activeIndex: 1,
    selectedIndex: 1,
    options,
  });
  assertEqual(navRes.nextActiveIndex, 3, "Open ArrowDown advances to index 3");

  const commitRes = computeSelectKeyTransition({
    key: "Enter",
    isOpen: true,
    activeIndex: 3,
    selectedIndex: 1,
    options,
  });
  assertEqual(commitRes.nextOpen, false, "Enter closes popup");
  assertEqual(commitRes.commitValue, "doc-2", "Enter commits active option value");
  assertEqual(commitRes.restoreFocus, true, "Enter restores focus to combobox trigger");

  // Home / End
  const homeRes = computeSelectKeyTransition({
    key: "Home",
    isOpen: true,
    activeIndex: 3,
    selectedIndex: 1,
    options,
  });
  assertEqual(homeRes.nextActiveIndex, 0, "Home jumps to first enabled option");

  const endRes = computeSelectKeyTransition({
    key: "End",
    isOpen: true,
    activeIndex: 0,
    selectedIndex: 1,
    options,
  });
  assertEqual(endRes.nextActiveIndex, 3, "End jumps to last enabled option");

  // Escape closes without committing
  const escRes = computeSelectKeyTransition({
    key: "Escape",
    isOpen: true,
    activeIndex: 3,
    selectedIndex: 1,
    options,
  });
  assertEqual(escRes.handled, true, "Open Escape handled");
  assertEqual(escRes.nextOpen, false, "Escape closes popup");
  assertEqual(escRes.commitValue, undefined, "Escape does NOT commit value");
  assertEqual(escRes.nextActiveIndex, 1, "Escape resets activeIndex to selectedIndex");
  assertEqual(escRes.restoreFocus, true, "Escape restores focus to trigger");
}

async function main(): Promise<void> {
  console.log("================================================================================");
  console.log("  PHASE 6 RESULTS PAGE CLEANUP UNIT SUITE                                       ");
  console.log("================================================================================");

  await testChartZeroStateAndBoundedHeights();
  await testMetricTypeConfidenceVsCount();
  await testZeroP1HighDoubleCounting();
  await testEnforceLatestVersionAndEmptyMetrics();
  await testSelectKeyboardModel();

  console.log("\n================================================================================");
  console.log(`  ALL PHASE 6 RESULTS UNIT TESTS PASSED (${assertCount} assertions)!`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error(err);
  throw err;
});
