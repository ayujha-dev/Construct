/**
 * Challenger 1 Adversarial Stress Test Harness:
 * 1. PDF Coordinate Math & Bottom-Up Point Space vs DOM Top-Down Projections
 * 2. Citation Click Behavior & Atomic Tab Switching
 * 3. Dual inspectCitation Signature Compatibility
 */

if (typeof window === "undefined") {
  (globalThis as any).window = globalThis;
}

import { useBertStore, registerWorkspaceNavigator } from "../store/useBertStore";
import { buildDemoCorpus } from "../store/demoCorpusService";
import {
  convertPdfBboxToViewportRect,
  createFallbackPdfViewport,
  formatLocatorDisplay,
} from "../lib/evidenceLocators";

let totalAsserts = 0;
let failedAsserts = 0;

function assert(condition: boolean, message: string) {
  totalAsserts++;
  if (!condition) {
    failedAsserts++;
    console.error(`  FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  PASS: ${message}`);
  }
}

/**
 * Projects PDF bottom-up point space coordinates into DOM top-down coordinates
 * using the exact logic from PdfViewer.tsx:163-167:
 *   const left = activeForPage ? activeForPage.x0 * zoomLevel : 0;
 *   const top = activeForPage ? pageSize.height - activeForPage.y1 * zoomLevel : 0;
 *   const width = activeForPage ? Math.max(4, (activeForPage.x1 - activeForPage.x0) * zoomLevel) : 0;
 *   const height = activeForPage ? Math.max(4, (activeForPage.y1 - activeForPage.y0) * zoomLevel) : 0;
 */
function projectPdfToDom(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  pageHeightPt: number,
  pageWidthPt: number,
  zoomLevel: number
) {
  const pageSize = {
    width: pageWidthPt * zoomLevel,
    height: pageHeightPt * zoomLevel,
  };
  const left = bbox.x0 * zoomLevel;
  const top = pageSize.height - bbox.y1 * zoomLevel;
  const width = Math.max(4, (bbox.x1 - bbox.x0) * zoomLevel);
  const height = Math.max(4, (bbox.y1 - bbox.y0) * zoomLevel);
  const bottom = top + height;
  const right = left + width;

  return { left, top, width, height, bottom, right, pageSize };
}

// ============================================================================
// SUITE 1: Coordinate Math & PDF Bottom-Up Point Space Projections
// ============================================================================
async function runSuite1_CoordinateMath() {
  console.log("\n=== SUITE 1: Coordinate Math & Bottom-Up PDF Point Space Projections ===");
  const corpus = buildDemoCorpus();

  // Find all PDF nodes with bounding boxes
  const allNodesWithBbox = Object.values(corpus.nodesByDocument)
    .flat()
    .filter((n) => n.bounding_box !== null);

  assert(allNodesWithBbox.length === 6, `Expected exactly 6 demo nodes with bounding boxes, found ${allNodesWithBbox.length}`);

  const PAGE_HEIGHT = 792; // Standard Letter height in points
  const PAGE_WIDTH = 612;  // Standard Letter width in points

  // 1.1 Verify all 6 nodes render in their expected visual sections
  console.log("\n--- 1.1 Verify all 6 demo nodes at zoomLevel = 1.0 ---");
  for (const node of allNodesWithBbox) {
    const bbox = node.bounding_box!;
    const projection = projectPdfToDom(bbox, PAGE_HEIGHT, PAGE_WIDTH, 1.0);

    // Coordinate invariants
    assert(projection.top >= 0, `Node ${node.id} (${node.section_path}) top (${projection.top}px) >= 0`);
    assert(projection.bottom <= PAGE_HEIGHT, `Node ${node.id} (${node.section_path}) bottom (${projection.bottom}px) <= page height (${PAGE_HEIGHT}px)`);
    assert(projection.left >= 0, `Node ${node.id} (${node.section_path}) left (${projection.left}px) >= 0`);
    assert(projection.right <= PAGE_WIDTH, `Node ${node.id} (${node.section_path}) right (${projection.right}px) <= page width (${PAGE_WIDTH}px)`);
    assert(projection.width > 0, `Node ${node.id} width (${projection.width}px) > 0`);
    assert(projection.height > 0, `Node ${node.id} height (${projection.height}px) > 0`);

    // Invertibility check: y1 = PAGE_HEIGHT - top, y0 = PAGE_HEIGHT - bottom
    const reconstructedY1 = PAGE_HEIGHT - projection.top;
    const reconstructedY0 = PAGE_HEIGHT - projection.bottom;
    assert(Math.abs(reconstructedY1 - bbox.y1) < 1e-6, `Node ${node.id} y1 invertibility: ${reconstructedY1} === ${bbox.y1}`);
    assert(Math.abs(reconstructedY0 - bbox.y0) < 1e-6, `Node ${node.id} y0 invertibility: ${reconstructedY0} === ${bbox.y0}`);

    // Specific section validations
    if (node.section_path?.includes("Bottom Margin")) {
      // Node 8 (n8Id): Scanned Page 1 Bottom Margin
      console.log(`  -> Validating n8Id Bottom Margin: DOM top=${projection.top}px, bottom=${projection.bottom}px, height=${projection.height}px`);
      assert(projection.top === 680, `n8Id DOM top must equal exactly 680px (got ${projection.top})`);
      assert(projection.bottom === 760, `n8Id DOM bottom must equal exactly 760px (got ${projection.bottom})`);
      assert(projection.height === 80, `n8Id DOM height must equal exactly 80px (got ${projection.height})`);
      assert(projection.top >= 680 && projection.bottom <= 760, `n8Id renders strictly within bottom margin interval [680px, 760px]`);
    } else if (node.section_path?.includes("§ 2.1")) {
      // Node 1 (n1Id): Page 4 § 2.1 Identity & Access
      console.log(`  -> Validating n1Id § 2.1: DOM top=${projection.top}px, bottom=${projection.bottom}px`);
      assert(projection.top === 140, `n1Id DOM top must equal 140px (got ${projection.top})`);
      assert(projection.bottom === 195, `n1Id DOM bottom must equal 195px (got ${projection.bottom})`);
      assert(projection.height === 55, `n1Id DOM height must equal 55px (got ${projection.height})`);
    } else if (node.section_path?.includes("§ 3.4")) {
      // Node 2 (n2Id): Page 7 § 3.4 Cryptographic Standards
      console.log(`  -> Validating n2Id § 3.4: DOM top=${projection.top}px, bottom=${projection.bottom}px`);
      assert(projection.top === 310, `n2Id DOM top must equal 310px (got ${projection.top})`);
      assert(projection.bottom === 365, `n2Id DOM bottom must equal 365px (got ${projection.bottom})`);
      assert(projection.height === 55, `n2Id DOM height must equal 55px (got ${projection.height})`);
    } else if (node.section_path?.includes("§ 4.2")) {
      // Node 3 (n3Id): Page 12 § 4.2 Audit Trails
      console.log(`  -> Validating n3Id § 4.2: DOM top=${projection.top}px, bottom=${projection.bottom}px`);
      assert(projection.top === 220, `n3Id DOM top must equal 220px (got ${projection.top})`);
      assert(projection.bottom === 275, `n3Id DOM bottom must equal 275px (got ${projection.bottom})`);
      assert(projection.height === 55, `n3Id DOM height must equal 55px (got ${projection.height})`);
    } else if (node.section_path?.includes("§ 5.1")) {
      // Node 4 (n4Id): Page 15 § 5.1 Business Continuity
      console.log(`  -> Validating n4Id § 5.1: DOM top=${projection.top}px, bottom=${projection.bottom}px`);
      assert(projection.top === 420, `n4Id DOM top must equal 420px (got ${projection.top})`);
      assert(projection.bottom === 470, `n4Id DOM bottom must equal 470px (got ${projection.bottom})`);
      assert(projection.height === 50, `n4Id DOM height must equal 50px (got ${projection.height})`);
    } else if (node.section_path?.includes("§ 6.3")) {
      // Node 5: Page 17 § 6.3 Incident Response SLA
      console.log(`  -> Validating Node 5 § 6.3: DOM top=${projection.top}px, bottom=${projection.bottom}px`);
      assert(projection.top === 160, `Node 5 DOM top must equal 160px (got ${projection.top})`);
      assert(projection.bottom === 210, `Node 5 DOM bottom must equal 210px (got ${projection.bottom})`);
      assert(projection.height === 50, `Node 5 DOM height must equal 50px (got ${projection.height})`);
    }
  }

  // 1.2 Multi-scale Zoom Stress Testing
  console.log("\n--- 1.2 Multi-scale Zoom Stress Testing (0.5x to 3.0x) ---");
  const zoomScales = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
  for (const zoom of zoomScales) {
    for (const node of allNodesWithBbox) {
      const proj = projectPdfToDom(node.bounding_box!, PAGE_HEIGHT, PAGE_WIDTH, zoom);
      const proj1 = projectPdfToDom(node.bounding_box!, PAGE_HEIGHT, PAGE_WIDTH, 1.0);

      // Verify strict linear scaling
      assert(Math.abs(proj.top - proj1.top * zoom) < 1e-4, `Linear scaling top at ${zoom}x: ${proj.top} === ${proj1.top * zoom}`);
      assert(Math.abs(proj.height - proj1.height * zoom) < 1e-4, `Linear scaling height at ${zoom}x: ${proj.height} === ${proj1.height * zoom}`);
      assert(Math.abs(proj.left - proj1.left * zoom) < 1e-4, `Linear scaling left at ${zoom}x: ${proj.left} === ${proj1.left * zoom}`);
      assert(Math.abs(proj.width - proj1.width * zoom) < 1e-4, `Linear scaling width at ${zoom}x: ${proj.width} === ${proj1.width * zoom}`);
      assert(proj.bottom <= PAGE_HEIGHT * zoom + 1e-4, `Bottom bound within zoomed page height at ${zoom}x`);
    }
  }

  // 1.3 Boundary & Degenerate Box Stress Testing
  console.log("\n--- 1.3 Adversarial Boundary & Degenerate Boxes ---");
  // Page top edge box
  const topBox = projectPdfToDom({ x0: 50, y0: 772, x1: 500, y1: 792 }, PAGE_HEIGHT, PAGE_WIDTH, 1.0);
  assert(topBox.top === 0, `PDF top edge y1=792 projects to DOM top=0`);
  assert(topBox.bottom === 20, `PDF y0=772 projects to DOM bottom=20`);

  // Page bottom edge box
  const bottomBox = projectPdfToDom({ x0: 50, y0: 0, x1: 500, y1: 25 }, PAGE_HEIGHT, PAGE_WIDTH, 1.0);
  assert(bottomBox.top === PAGE_HEIGHT - 25, `PDF bottom box top = ${PAGE_HEIGHT - 25}`);
  assert(bottomBox.bottom === PAGE_HEIGHT, `PDF bottom edge y0=0 projects to DOM bottom=${PAGE_HEIGHT}`);

  // Degenerate sub-pixel / zero-height box (clamped to min 4px)
  const zeroHeightBox = projectPdfToDom({ x0: 100, y0: 400, x1: 300, y1: 400 }, PAGE_HEIGHT, PAGE_WIDTH, 1.0);
  assert(zeroHeightBox.height === 4, `Zero-height PDF box clamped to minimum 4px in DOM (got ${zeroHeightBox.height})`);

  // Degenerate zero-width box (clamped to min 4px)
  const zeroWidthBox = projectPdfToDom({ x0: 200, y0: 300, x1: 200, y1: 350 }, PAGE_HEIGHT, PAGE_WIDTH, 1.0);
  assert(zeroWidthBox.width === 4, `Zero-width PDF box clamped to minimum 4px in DOM (got ${zeroWidthBox.width})`);

  // Alternative Page Dimensions: A4 ($595.28 \times 841.89$)
  const A4_HEIGHT = 841.89;
  const A4_WIDTH = 595.28;
  const a4Box = projectPdfToDom({ x0: 50, y0: 41.89, x1: 500, y1: 141.89 }, A4_HEIGHT, A4_WIDTH, 1.0);
  assert(Math.abs(a4Box.top - (841.89 - 141.89)) < 1e-4, `A4 box top correctly projected: ${a4Box.top} === 700`);
  assert(Math.abs(a4Box.bottom - (841.89 - 41.89)) < 1e-4, `A4 box bottom correctly projected: ${a4Box.bottom} === 800`);
  assert(Math.abs(a4Box.height - 100) < 1e-4, `A4 box height preserved as 100 (got ${a4Box.height})`);
}

// ============================================================================
// SUITE 2: Citation Click Behavior & Atomic Tab Switching
// ============================================================================
async function runSuite2_CitationClickAndAtomicSwitching() {
  console.log("\n=== SUITE 2: Citation Click Behavior & Atomic Tab Switching ===");

  // Reset store to fresh demo state using buildDemoCorpus
  const demo = buildDemoCorpus();
  useBertStore.setState({
    documents: demo.documents,
    nodesByDocument: demo.nodesByDocument,
    workItems: demo.workItems,
    selectedDocumentId: demo.documents[0].id,
    selectedNodeId: null,
    activeHighlightBox: null,
    activeInspectorTab: "quotes",
  });
  const state = useBertStore.getState();

  assert(state.documents.length >= 4, `Store loaded demo corpus with ${state.documents.length} docs`);
  assert(state.workItems.length >= 5, `Store loaded demo corpus with ${state.workItems.length} work items`);

  // 2.1 Tab switching from every tab state
  console.log("\n--- 2.1 Atomic Tab Switching from every initial tab ---");
  const testTabs: Array<"quotes" | "ast" | "audit" | "visual"> = ["quotes", "ast", "audit", "visual"];

  const doc1 = state.documents[0];
  const node1 = state.nodesByDocument[doc1.id]?.[0];
  assert(Boolean(node1), `Node 1 found in doc1: ${node1?.id}`);

  for (const initialTab of testTabs) {
    state.setActiveInspectorTab(initialTab);
    assert(useBertStore.getState().activeInspectorTab === initialTab, `Initial tab successfully set to ${initialTab}`);

    // Call inspectCitation
    useBertStore.getState().inspectCitation(doc1.id, node1!.page_number!, node1!.bounding_box, node1!.id);

    const updated = useBertStore.getState();
    assert(updated.activeInspectorTab === "visual", `inspectCitation from tab '${initialTab}' switched activeInspectorTab to 'visual'`);
    assert(updated.selectedDocumentId === doc1.id, `selectedDocumentId set to ${doc1.id}`);
    assert(updated.selectedNodeId === node1!.id, `selectedNodeId set to ${node1!.id}`);
    assert(updated.activeHighlightBox !== null, `activeHighlightBox is not null`);
    assert(updated.activeHighlightBox?.nodeId === node1!.id, `activeHighlightBox.nodeId matches ${node1!.id}`);
  }

  // 2.2 Atomic Single-Batch Notification Verification
  console.log("\n--- 2.2 Atomic Single-Batch Notification Verification ---");
  // Reset tab to "quotes" and clear selectedNodeId first
  useBertStore.getState().setActiveInspectorTab("quotes");
  useBertStore.getState().setSelectedNode(null);

  let notificationCount = 0;
  let intermediateInconsistency = false;

  const unsubscribe = useBertStore.subscribe((currState) => {
    notificationCount++;
    // Invariant: If selectedNodeId changed to node1.id, activeInspectorTab MUST be "visual"
    if (currState.selectedNodeId === node1!.id && currState.activeInspectorTab !== "visual") {
      intermediateInconsistency = true;
    }
  });

  // Trigger atomic inspectCitation
  useBertStore.getState().inspectCitation(doc1.id, node1!.page_number!, node1!.bounding_box, node1!.id);

  assert(notificationCount === 1, `Atomic inspectCitation triggered exactly 1 store notification (got ${notificationCount})`);
  assert(!intermediateInconsistency, `No intermediate inconsistent state observed during atomic update`);
  unsubscribe();

  // 2.3 Simulate RightInspectorDrawer Quote Click Handlers across all work items
  console.log("\n--- 2.3 RightInspectorDrawer Quote Click Simulation across Work Items ---");
  const freshState = useBertStore.getState();
  const workItems = freshState.workItems;

  let verifiedClicksChecked = 0;
  for (const item of workItems) {
    const citation = item.verified_citations[0];
    if (!citation) {
      console.log(`  -> Skipping work item ${item.id.slice(0, 8)} (no verified citations)`);
      continue;
    }

    // Exact logic from RightInspectorDrawer.tsx:176-190
    const targetDoc = freshState.documents.find(
      (d) => d.filename === citation.document_filename || d.id === item.document_id
    ) || freshState.documents.find((d) => d.id === freshState.selectedDocumentId);
    assert(Boolean(targetDoc), `targetDoc found for citation: ${citation.document_filename}`);

    const targetNodes = targetDoc ? freshState.nodesByDocument[targetDoc.id] || [] : [];
    const matchedNode = targetNodes.find((n) => n.id === citation.ast_node_id);
    const resolvedBbox = matchedNode?.bounding_box ?? (citation as any).bounding_box ?? null;

    // Call inspectCitation with object payload (RightInspectorDrawer style)
    useBertStore.getState().inspectCitation({
      quote: citation.quote,
      ast_node_id: citation.ast_node_id,
      page_number: citation.page_number,
      bounding_box: resolvedBbox,
      document_filename: citation.document_filename || targetDoc?.filename || "",
      confidence_score: item.gate_telemetry.citation_match,
    });

    const postClickState = useBertStore.getState();
    assert(postClickState.activeInspectorTab === "visual", `Quote click switched activeInspectorTab to 'visual'`);
    assert(postClickState.selectedNodeId === citation.ast_node_id, `selectedNodeId matches citation.ast_node_id`);

    // If target document is PDF, resolvedBbox MUST NOT be null
    if (targetDoc?.source_format === "PDF") {
      assert(resolvedBbox !== null, `PDF citation for node ${citation.ast_node_id} has authentic non-null bounding box`);
      assert(postClickState.activeHighlightBox !== null, `postClickState.activeHighlightBox is not null for PDF citation`);
      assert(postClickState.activeHighlightBox?.nodeId === citation.ast_node_id, `activeHighlightBox.nodeId matches`);
      assert(typeof postClickState.activeHighlightBox?.x0 === "number", `activeHighlightBox has valid x0`);
      assert(typeof postClickState.activeHighlightBox?.y0 === "number", `activeHighlightBox has valid y0`);
      assert(typeof postClickState.activeHighlightBox?.x1 === "number", `activeHighlightBox has valid x1`);
      assert(typeof postClickState.activeHighlightBox?.y1 === "number", `activeHighlightBox has valid y1`);
    }

    verifiedClicksChecked++;
  }

  assert(verifiedClicksChecked >= 4, `Successfully simulated quote click for ${verifiedClicksChecked} verified citations`);
}

// ============================================================================
// SUITE 3: Dual inspectCitation Signature Compatibility
// ============================================================================
async function runSuite3_DualSignatureCompatibility() {
  console.log("\n=== SUITE 3: Dual inspectCitation Signature Compatibility ===");
  const state = useBertStore.getState();
  const doc1 = state.documents[0]; // SOC2_Type_II_2026.pdf
  const doc4 = state.documents.find((d) => d.filename.includes("Scanned_Addendum")) || state.documents[3];
  const node8 = state.nodesByDocument[doc4.id]?.find((n) => n.section_path?.includes("Bottom Margin"))!;
  assert(Boolean(node8), `Found node 8 (n8Id) in doc 4: ${node8?.id}`);

  // 3.1 Object Signature (RightInspectorDrawer pattern)
  console.log("\n--- 3.1 Object Signature (RightInspectorDrawer pattern) ---");
  useBertStore.getState().setActiveInspectorTab("quotes");
  useBertStore.getState().inspectCitation({
    quote: node8.verbatim_text,
    ast_node_id: node8.id,
    page_number: node8.page_number,
    bounding_box: node8.bounding_box,
    document_filename: doc4.filename,
    confidence_score: 81, // percentage scale
  });

  const stateObj = useBertStore.getState();
  assert(stateObj.activeInspectorTab === "visual", `Object signature set activeInspectorTab to 'visual'`);
  assert(stateObj.selectedDocumentId === doc4.id, `Object signature set selectedDocumentId to ${doc4.id}`);
  assert(stateObj.selectedNodeId === node8.id, `Object signature set selectedNodeId to ${node8.id}`);
  assert(stateObj.activeHighlightBox !== null, `Object signature activeHighlightBox is not null`);
  assert(stateObj.activeHighlightBox?.confidence === 0.81, `Confidence score 81 normalized to 0.81 (got ${stateObj.activeHighlightBox?.confidence})`);
  assert(stateObj.activeHighlightBox?.x0 === 60, `activeHighlightBox x0 === 60`);
  assert(stateObj.activeHighlightBox?.y0 === 32, `activeHighlightBox y0 === 32`);
  assert(stateObj.activeHighlightBox?.x1 === 540, `activeHighlightBox x1 === 540`);
  assert(stateObj.activeHighlightBox?.y1 === 112, `activeHighlightBox y1 === 112`);

  // 3.2 Positional Signature (CopilotStream pattern)
  console.log("\n--- 3.2 Positional Signature (CopilotStream pattern) ---");
  useBertStore.getState().setActiveInspectorTab("quotes");
  useBertStore.getState().inspectCitation(
    doc4.id,
    node8.page_number ?? 1,
    node8.bounding_box,
    node8.id
  );

  const statePos = useBertStore.getState();
  assert(statePos.activeInspectorTab === "visual", `Positional signature set activeInspectorTab to 'visual'`);
  assert(statePos.selectedDocumentId === doc4.id, `Positional signature set selectedDocumentId to ${doc4.id}`);
  assert(statePos.selectedNodeId === node8.id, `Positional signature set selectedNodeId to ${node8.id}`);
  assert(statePos.activeHighlightBox !== null, `Positional signature activeHighlightBox is not null`);
  assert(statePos.activeHighlightBox?.x0 === 60, `Positional x0 === 60`);
  assert(statePos.activeHighlightBox?.y0 === 32, `Positional y0 === 32`);
  assert(statePos.activeHighlightBox?.x1 === 540, `Positional x1 === 540`);
  assert(statePos.activeHighlightBox?.y1 === 112, `Positional y1 === 112`);

  // 3.3 Filename Resolution in Positional Signature
  console.log("\n--- 3.3 Filename Resolution in Positional Signature ---");
  useBertStore.getState().setActiveInspectorTab("quotes");
  // Pass filename string instead of docId UUID
  useBertStore.getState().inspectCitation(
    doc4.filename,
    1,
    node8.bounding_box,
    node8.id
  );
  const stateFilename = useBertStore.getState();
  assert(stateFilename.selectedDocumentId === doc4.id, `Positional signature resolved docId from filename string: ${stateFilename.selectedDocumentId} === ${doc4.id}`);
  assert(stateFilename.activeInspectorTab === "visual", `activeInspectorTab is visual`);

  // 3.4 Fallback Bounding Box Recovery from nodesByDocument
  console.log("\n--- 3.4 Fallback Bounding Box Recovery when bbox=null in citation ---");
  useBertStore.getState().inspectCitation({
    quote: node8.verbatim_text,
    ast_node_id: node8.id,
    page_number: node8.page_number,
    bounding_box: null, // intentionally null
    document_filename: doc4.filename,
    confidence_score: 95,
  });
  const stateRecovered = useBertStore.getState();
  assert(stateRecovered.activeHighlightBox !== null, `activeHighlightBox recovered from nodesByDocument when citation bounding_box was null`);
  assert(stateRecovered.activeHighlightBox?.x0 === 60 && stateRecovered.activeHighlightBox?.y0 === 32, `Recovered exact coordinates [60, 32, 540, 112]`);

  // 3.5 Adversarial Edge Cases & Fuzz Testing
  console.log("\n--- 3.5 Adversarial Inputs & Fuzz Testing ---");

  // Unknown docId
  useBertStore.getState().inspectCitation("non_existent_doc_id", 99, null, "fake_node_id");
  assert(useBertStore.getState().activeInspectorTab === "visual", `Survives non_existent_doc_id without throwing`);
  assert(useBertStore.getState().selectedNodeId === "fake_node_id", `Selected node set without crash`);

  // Missing optional params in positional call
  useBertStore.getState().inspectCitation("SOC2_Type_II_2026.pdf");
  assert(useBertStore.getState().activeInspectorTab === "visual", `Survives single argument inspectCitation`);

  // Object with empty / zero fields
  useBertStore.getState().inspectCitation({
    quote: "",
    ast_node_id: "unknown_id",
    page_number: null,
    bounding_box: null,
    document_filename: "",
    confidence_score: 0,
  });
  assert(useBertStore.getState().activeInspectorTab === "visual", `Survives empty object citation without crash`);

  // Rapid interleaving stress test (1000 alternations)
  console.log("\n--- 3.6 Rapid 1,000-iteration Interleaving Stress Test ---");
  const node1 = state.nodesByDocument[doc1.id]?.[0]!;
  const startMs = Date.now();
  for (let i = 0; i < 1000; i++) {
    if (i % 2 === 0) {
      useBertStore.getState().inspectCitation({
        quote: node8.verbatim_text,
        ast_node_id: node8.id,
        page_number: node8.page_number,
        bounding_box: node8.bounding_box,
        document_filename: doc4.filename,
        confidence_score: 81,
      });
    } else {
      useBertStore.getState().inspectCitation(
        doc1.id,
        node1.page_number ?? 1,
        node1.bounding_box,
        node1.id
      );
    }
  }
  const elapsedMs = Date.now() - startMs;
  console.log(`  -> Completed 1,000 rapid inspectCitation calls in ${elapsedMs}ms (${(elapsedMs / 1000).toFixed(2)}ms per call)`);
  assert(elapsedMs < 500, `1,000 rapid calls finished under 500ms`);

  const finalState = useBertStore.getState();
  assert(finalState.activeInspectorTab === "visual", `Final tab is visual`);
  assert(finalState.selectedNodeId === node1.id, `Final selectedNodeId is node1.id`);
  assert(finalState.selectedDocumentId === doc1.id, `Final selectedDocumentId is doc1.id`);
}

// ============================================================================
// SUITE 4: Phase 2 Locators, Rotation/CropBox/Non-Letter & Confidence Guard
// ============================================================================
async function runSuite4_Phase2EvidenceLocators() {
  console.log("\n=== SUITE 4: Phase 2 Evidence Locators, Viewport Math & Cross-Route Hook ===");

  // 4.1 960x540 non-Letter slide geometry (pitch deck) + Zoom scale 1.5
  const slideVp1 = createFallbackPdfViewport(960, 540, 0, 1.0);
  const slideVp15 = createFallbackPdfViewport(960, 540, 0, 1.5);
  const slideBox = { x0: 80, y0: 420, x1: 480, y1: 460 };
  const slideRect1 = convertPdfBboxToViewportRect(slideVp1, slideBox);
  const slideRect15 = convertPdfBboxToViewportRect(slideVp15, slideBox);
  assert(Math.abs(slideRect1.top - (540 - 460)) < 1e-4, `960x540 slide top = 80px (got ${slideRect1.top})`);
  assert(Math.abs(slideRect15.top - slideRect1.top * 1.5) < 1e-4, `960x540 scales linearly at 1.5x`);

  // 4.2 Rotated 90/180/270 degrees + CropBox viewport transforms
  const rot90 = createFallbackPdfViewport(612, 792, 90, 1.0);
  assert(rot90.width === 792 && rot90.height === 612, `90deg rotation swaps width/height to 792x612`);
  const rect90 = convertPdfBboxToViewportRect(rot90, { x0: 100, y0: 600, x1: 200, y1: 650 });
  assert(rect90.width >= 4 && rect90.height >= 4 && rect90.right <= 792 && rect90.bottom <= 612, `90deg rotated rect stays inside rotated viewport`);

  const cropped = createFallbackPdfViewport(612, 792, 0, 1.0, [36, 36, 576, 756]);
  assert(cropped.width === 540 && cropped.height === 720, `CropBox reduces viewport to 540x720`);
  const croppedRect = convertPdfBboxToViewportRect(cropped, { x0: 72, y0: 700, x1: 272, y1: 720 });
  assert(Math.abs(croppedRect.left - 36) < 1e-4, `CropBox X offset translates x0=72 -> left=36 (got ${croppedRect.left})`);
  assert(Math.abs(croppedRect.top - 36) < 1e-4, `CropBox Y offset translates y1=720 -> top=36 (got ${croppedRect.top})`);

  // 4.3 Non-overwrite confidence bug regression (explicit citation_match not clobbered by node.ocr_confidence)
  const demo = buildDemoCorpus();
  useBertStore.setState({
    documents: demo.documents,
    nodesByDocument: demo.nodesByDocument,
    workItems: demo.workItems,
    selectedDocumentId: demo.documents[0].id,
  });
  const docScan = demo.documents.find((d) => d.filename.includes("Scanned_Addendum"))!;
  const nodeScan = demo.nodesByDocument[docScan.id].find((n) => n.section_path?.includes("Bottom Margin"))!;
  assert(nodeScan.locator?.source_type === "pdf", `Demo scan node carries full PdfEvidenceLocator`);

  let crossRouteCall: { docId?: string | null; page?: number | null; nodeId?: string | null } | null = null;
  registerWorkspaceNavigator((opts) => {
    crossRouteCall = opts;
  });

  useBertStore.getState().inspectCitation({
    quote: nodeScan.verbatim_text,
    ast_node_id: nodeScan.id,
    page_number: nodeScan.page_number,
    bounding_box: nodeScan.bounding_box,
    document_filename: docScan.filename,
    confidence_score: 0, // zero must not fall back to node.ocr_confidence
    locator: nodeScan.locator,
    region_match_score: 98.4,
  });

  const postState = useBertStore.getState();
  assert(postState.activeHighlightBox?.confidence === 0, `Zero confidence_score preserved instead of overwritten by ocr_confidence (${postState.activeHighlightBox?.confidence})`);
  assert(postState.activeRegionMatchScore === 98.4, `activeRegionMatchScore populated (98.4)`);
  assert(postState.activeLocator?.source_type === "pdf", `activeLocator populated on inspectCitation`);
  const navResult = crossRouteCall as { docId?: string | null; page?: number | null; nodeId?: string | null } | null;
  assert(navResult !== null && navResult.docId === docScan.id && navResult.nodeId === nodeScan.id, `Registered workspace navigator notified for cross-route citation click`);
  registerWorkspaceNavigator(null);

  const disp = formatLocatorDisplay(nodeScan.locator, docScan);
  assert(disp.valid && disp.chip === "SCAN" && disp.label.includes("p.1"), `Scan locator formats with SCAN chip and p.1 label (${disp.label})`);
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  console.log("================================================================================");
  console.log("CHALLENGER 1 EMPIRICAL ADVERSARIAL STRESS TEST SUITE");
  console.log("Targets: Coordinate Math (PdfViewer.tsx:165), Atomic Tab Switch, Dual Signatures");
  console.log("================================================================================");

  try {
    await runSuite1_CoordinateMath();
    await runSuite2_CitationClickAndAtomicSwitching();
    await runSuite3_DualSignatureCompatibility();
    await runSuite4_Phase2EvidenceLocators();

    console.log("\n================================================================================");
    console.log(`STRESS TEST SUMMARY: ${totalAsserts} asserts executed, ${failedAsserts} failures.`);
    console.log("VERDICT: ALL EMPIRICAL CHALLENGES PASSED SUCCESSFULLY");
    console.log("================================================================================");
  } catch (error) {
    console.error("\nFATAL TEST FAILURE:", error);
    (globalThis as any).process?.exit?.(1);
  }
}

void main();
