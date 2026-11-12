import * as XLSX from "xlsx";
import {
  formatCanonicalJsonPath,
  parseJsonPathTokens,
} from "../lib/evidenceLocators";
import {
  assessQuoteStrength,
  computeWorkItemMetrics,
  filterWorkItemsForScope,
} from "../lib/workItemMetrics";
import type {
  ASTNode,
  CopilotChatResponse,
  Document,
  EvidenceLocator,
  ExecutiveSummary,
  JobExecution,
  WorkItem,
} from "../types/bert";

export const AGENTS = [
  "Scout",
  "Quartermaster",
  "Chronos",
  "Vanguard",
  "Ranger",
  "Arbiter",
  "Envoy",
];
export const AGENT_ROLES = [
  "Vision Rescue",
  "Categorizer",
  "Temporal Tracker",
  "Risk Prioritizer",
  "Fact Extractor",
  "Conflict Resolver",
  "Summary Scribe",
];

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

let localPaused = false;
let localResume: (() => void) | null = null;
let localRun = 0;

export function isLocalPaused(): boolean {
  return localPaused;
}

export function pauseLocalSimulation(): void {
  localPaused = true;
}

export function resumeLocalSimulation(): void {
  localPaused = false;
  localResume?.();
  localResume = null;
}

export function cancelLocalSimulation(): void {
  localRun += 1;
  localPaused = false;
  localResume?.();
  localResume = null;
}

const INSUFFICIENT_EVIDENCE_ANSWER =
  "Insufficient evidence in uploaded corpus — flagged for manual review.";
const QUERY_STOP_WORDS = new Set([
  "what",
  "does",
  "do",
  "did",
  "how",
  "who",
  "where",
  "when",
  "why",
  "which",
  "is",
  "are",
  "was",
  "were",
  "can",
  "could",
  "should",
  "would",
  "will",
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "for",
  "and",
  "or",
  "on",
  "at",
  "by",
  "with",
  "from",
  "this",
  "that",
  "these",
  "those",
  "there",
  "any",
  "all",
  "me",
  "my",
  "our",
  "your",
  "company",
  "policy",
  "policies",
  "shieldstaff",
  "bert",
  "copilot",
  "please",
  "tell",
  "about",
  "it",
  "its",
  "be",
  "been",
  "has",
  "have",
  "had",
]);

export function stemToken(token: string): string {
  return token.length > 4 ? token.replace(/(ing|ed|es|s)$/, "") : token;
}

export function queryTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !QUERY_STOP_WORDS.has(token))
    .map(stemToken);
}

export function insufficientCopilotResponse(): CopilotChatResponse {
  return {
    answer: INSUFFICIENT_EVIDENCE_ANSWER,
    verification_status: "INSUFFICIENT_EVIDENCE",
    match_score: 0,
    citations: [],
  };
}

/** Deterministic keyword search over the local AST when the API is unreachable. */
export function localCopilotSearch(
  prompt: string,
  documentId: string | null | undefined,
  state: {
    documents: Document[];
    nodesByDocument: Record<string, ASTNode[]>;
    workItems: WorkItem[];
  }
): CopilotChatResponse {
  const terms = queryTerms(prompt);
  if (!terms.length) return insufficientCopilotResponse();
  const candidates: { node: ASTNode; document: Document }[] = [];
  for (const document of state.documents) {
    if (documentId && document.id !== documentId) continue;
    for (const node of state.nodesByDocument[document.id] ?? []) {
      candidates.push({ node, document });
    }
  }
  if (!candidates.length) {
    for (const item of state.workItems) {
      const document = state.documents.find(
        (candidateDocument) => candidateDocument.id === item.document_id
      );
      if (!document || (documentId && document.id !== documentId)) continue;
      for (const citation of item.verified_citations) {
        candidates.push({
          document,
          node: {
            id: citation.ast_node_id,
            document_id: document.id,
            node_type: "CITATION",
            section_path: item.category,
            verbatim_text: citation.quote,
            structured_payload: null,
            page_number: citation.page_number,
            bounding_box: citation.bounding_box ?? null,
            ocr_confidence: item.gate_telemetry.critical_logprob || 0.98,
            node_order: 0,
            locator: citation.locator ?? null,
          },
        });
      }
    }
  }
  let best: { node: ASTNode; document: Document; score: number } | null = null;
  for (const candidate of candidates) {
    const haystack = new Set(queryTerms(candidate.node.verbatim_text));
    const matched = terms.filter((term) => haystack.has(term)).length;
    const score = Math.round((matched / terms.length) * 100);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (!best || best.score < 50) return insufficientCopilotResponse();
  const { node, document, score } = best;
  const quoteStrength = assessQuoteStrength(node.verbatim_text);
  const strongMatch = score >= 97 && !quoteStrength.isWeak;
  return {
    answer: strongMatch
      ? `${node.verbatim_text} [${document.filename}:${node.page_number ?? 1}]`
      : `Partial or weak match (${score}%) in ${document.filename}: ${node.verbatim_text}`,
    verification_status: strongMatch ? "VERIFIED" : "NEEDS_HUMAN_VERIFICATION",
    match_score: score,
    weak_evidence: quoteStrength.isWeak,
    weak_evidence_reason: quoteStrength.reason,
    citations: [
      {
        quote: node.verbatim_text,
        ast_node_id: node.id,
        page_number: node.page_number,
        bounding_box: node.bounding_box,
        document_filename: document.filename,
        confidence_score: score,
        locator: node.locator ?? null,
        region_match_score: score,
      },
    ],
  };
}

export async function checksum(value: string | ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const buffer =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : new Uint8Array(value);
    const bytes = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }
  const len = typeof value === "string" ? value.length : value.byteLength;
  return `sha256-local-${len}-${Date.now().toString(16)}`;
}

export function readWithFileReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failure"));
    reader.readAsText(file);
  });
}

export function categoryFor(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("access") || lower.includes("mfa") || lower.includes("account"))
    return "Access Control";
  if (lower.includes("encrypt") || lower.includes("aes") || lower.includes("key"))
    return "Cryptography & Keys";
  if (lower.includes("retention") || lower.includes("worm") || lower.includes("storage"))
    return "Data Retention";
  if (lower.includes("liability") || lower.includes("indemn") || lower.includes("cap"))
    return "Liability & Indemnification";
  if (lower.includes("password") || lower.includes("conflict") || lower.includes("supersede"))
    return "Temporal Conflicts";
  if (
    lower.includes("iam") ||
    lower.includes("wildcard") ||
    lower.includes("aws") ||
    lower.includes("s3")
  )
    return "Cloud Infrastructure";
  if (lower.includes("stamp") || lower.includes("scan") || lower.includes("low_confidence"))
    return "Degraded Scans & Physical";
  return "General Governance";
}

export function priorityFor(
  text: string,
  confidence = 1
): { tier: Document["priority_tier"]; score: number } {
  const lower = text.toLowerCase();
  if (
    confidence < 0.9 ||
    ["wildcard", "uncapped", "liability", "admin", "secret", "s3:*"].some((term) =>
      lower.includes(term)
    )
  ) {
    return { tier: "P0_CRITICAL", score: 96 };
  }
  if (["mfa", "password", "encryption", "policy"].some((term) => lower.includes(term))) {
    return { tier: "P1_HIGH", score: 72 };
  }
  return { tier: "P2_MEDIUM", score: 38 };
}

function flattenJsonEntries(
  val: unknown,
  currentPath = "$",
  out: Array<{ path: string; text: string; payload: Record<string, unknown> | null }> = []
) {
  if (Array.isArray(val)) {
    val.forEach((item, idx) =>
      flattenJsonEntries(item, `${currentPath}[${idx}]`, out)
    );
    return out;
  }
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj);
    const hasOnlyPrimitives = keys.every(
      (k) => obj[k] === null || typeof obj[k] !== "object"
    );
    if (hasOnlyPrimitives && keys.length > 0 && currentPath !== "$") {
      out.push({ path: currentPath, text: JSON.stringify(obj), payload: obj });
      return out;
    }
    for (const [k, v] of Object.entries(obj)) {
      const next = /^[A-Za-z_$-][\w$-]*$/.test(k)
        ? `${currentPath}.${k}`
        : `${currentPath}[${JSON.stringify(k)}]`;
      flattenJsonEntries(v, next, out);
    }
    return out;
  }
  if (currentPath !== "$") {
    out.push({ path: currentPath, text: String(val), payload: null });
  }
  return out;
}

export async function parseUploadedFileLocally(
  file: File,
  workspaceId?: string
): Promise<{ document: Document; nodes: ASTNode[] }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "txt";
  const isSpreadsheet = ext === "xlsx" || ext === "xls" || ext === "csv";
  const isJson = ext === "json";
  const isPdf = ext === "pdf";

  const arrayBuffer = await file.arrayBuffer();
  const hash = await checksum(arrayBuffer);

  if (isSpreadsheet) {
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const id = uid();
    const nodes: ASTNode[] = [];
    for (const sheetName of workbook.SheetNames.slice(0, 5)) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });
      rows.slice(0, 200).forEach((row, rIdx) => {
        const rowNum = rIdx + 1;
        const cells = (row as unknown[]).map((c) => String(c ?? "").trim());
        const text = cells.filter(Boolean).join(" | ");
        if (!text) return;
        const nodeId = uid();
        nodes.push({
          id: nodeId,
          document_id: id,
          node_type: "TABLE_ROW",
          section_path: `${sheetName} > Row ${rowNum}`,
          verbatim_text: text,
          structured_payload: {
            sheet_name: sheetName,
            row_index: rowNum,
            row: rowNum,
            col_A: cells[0] ?? "",
            col_B: cells[1] ?? "",
          },
          page_number: 1,
          bounding_box: null,
          ocr_confidence: 1.0,
          node_order: nodes.length,
          locator: {
            source_type: "xlsx",
            doc_id: id,
            sheet: sheetName,
            row: rowNum,
            col_range: `A${rowNum}:Z${rowNum}`,
            node_id: nodeId,
            checksum: hash,
          },
        });
      });
    }
    const sourceNodes = nodes.length
      ? nodes
      : [
          {
            id: uid(),
            document_id: id,
            node_type: "TABLE_ROW",
            section_path: "Sheet1 > Row 1",
            verbatim_text: `${file.name} uploaded for local review.`,
            structured_payload: { sheet_name: "Sheet1", row_index: 1, row: 1 },
            page_number: 1,
            bounding_box: null,
            ocr_confidence: 1.0,
            node_order: 0,
          } satisfies ASTNode,
        ];
    const risk = priorityFor(sourceNodes[0].verbatim_text, 1);
    return {
      document: {
        id,
        filename: file.name,
        source_format: "XLSX",
        category: categoryFor(sourceNodes[0].verbatim_text),
        sub_category: null,
        priority_tier: risk.tier,
        priority_score: risk.score,
        ast_checksum: hash,
        file_size_bytes: file.size,
        total_pages: 0,
        total_ast_nodes: sourceNodes.length,
        processing_status: "COMPLETED",
        effective_date: null,
        is_latest_version: true,
        workspace_id: workspaceId ?? null,
      },
      nodes: sourceNodes,
    };
  }

  if (isJson) {
    const text = new TextDecoder().decode(arrayBuffer);
    const id = uid();
    let entries: Array<{ path: string; text: string; payload: Record<string, unknown> | null }> = [];
    try {
      const parsed = JSON.parse(text);
      entries = flattenJsonEntries(parsed).slice(0, 200);
    } catch {
      entries = [{ path: "$", text, payload: null }];
    }
    if (!entries.length) entries = [{ path: "$", text: file.name, payload: null }];
    const nodes: ASTNode[] = entries.map((entry, idx) => {
      const nodeId = uid();
      const canonical = formatCanonicalJsonPath(parseJsonPathTokens(entry.path));
      return {
        id: nodeId,
        document_id: id,
        node_type: "JSON_RULE",
        section_path: canonical,
        verbatim_text: entry.text,
        structured_payload: entry.payload,
        page_number: null,
        bounding_box: null,
        ocr_confidence: 1.0,
        node_order: idx,
        locator: {
          source_type: "json",
          doc_id: id,
          json_path: canonical,
          node_id: nodeId,
          checksum: hash,
        },
      };
    });
    const risk = priorityFor(nodes.map((n) => n.verbatim_text).join(" "), 1);
    return {
      document: {
        id,
        filename: file.name,
        source_format: "JSON",
        category: categoryFor(nodes[0].verbatim_text),
        sub_category: null,
        priority_tier: risk.tier,
        priority_score: risk.score,
        ast_checksum: hash,
        file_size_bytes: file.size,
        total_pages: 0,
        total_ast_nodes: nodes.length,
        processing_status: "COMPLETED",
        effective_date: null,
        is_latest_version: true,
        workspace_id: workspaceId ?? null,
      },
      nodes,
    };
  }

  if (isPdf) {
    // Do NOT corrupt binary PDF bytes via readAsText! Extract readable summary cleanly.
    const asciiPreview = new TextDecoder("latin1")
      .decode(arrayBuffer.slice(0, 65536))
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const id = uid();
    const nodeId = uid();
    const fallbackText =
      asciiPreview.length > 24 && !asciiPreview.startsWith("%PDF-")
        ? asciiPreview.slice(0, 280)
        : `${file.name} uploaded (${Math.max(1, Math.round(file.size / 1024))} KB) — visual layout loaded in PDF viewer.`;
    const node: ASTNode = {
      id: nodeId,
      document_id: id,
      node_type: "PARAGRAPH",
      section_path: "Page 1",
      verbatim_text: fallbackText,
      structured_payload: null,
      page_number: 1,
      bounding_box: { x0: 72, y0: 660, x1: 540, y1: 720 },
      ocr_confidence: /scan/i.test(file.name) ? 0.84 : 0.99,
      node_order: 0,
      locator: {
        source_type: "pdf",
        doc_id: id,
        page: 1,
        bbox: [72, 660, 540, 720],
        coord_system: "pdf_user_space_bl_pt",
        page_width: 612,
        page_height: 792,
        crop_box: [0, 0, 612, 792],
        rotation: 0,
        node_id: nodeId,
        checksum: hash,
        is_scan: /scan/i.test(file.name),
      },
    };
    const risk = priorityFor(node.verbatim_text, node.ocr_confidence);
    return {
      document: {
        id,
        filename: file.name,
        source_format: /scan/i.test(file.name) ? "PHYSICAL_SCAN" : "PDF",
        category: categoryFor(file.name),
        sub_category: /scan/i.test(file.name) ? "Scanned PDF" : null,
        priority_tier: risk.tier,
        priority_score: risk.score,
        ast_checksum: hash,
        file_size_bytes: file.size,
        total_pages: 1,
        total_ast_nodes: 1,
        processing_status: "COMPLETED",
        effective_date: null,
        is_latest_version: true,
        workspace_id: workspaceId ?? null,
      },
      nodes: [node],
    };
  }

  const text = new TextDecoder().decode(arrayBuffer);
  return localDocument(file, text, hash, workspaceId);
}

export function localDocument(
  file: File,
  text: string,
  hash: string,
  workspaceId?: string
): { document: Document; nodes: ASTNode[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sourceLines = lines.length
    ? lines
    : [`${file.name} uploaded for local review.`];
  const id = uid();
  const isJson = file.name.endsWith(".json");
  const isPdf = file.name.endsWith(".pdf");
  const nodes: ASTNode[] = sourceLines.map((line, index) => {
    const nodeId = uid();
    const isLow = /stamp|unreadable|low_confidence/i.test(line);
    const locator: EvidenceLocator = isJson
      ? {
          source_type: "json",
          doc_id: id,
          json_path: `$.item[${index}]`,
          node_id: nodeId,
          checksum: hash,
        }
      : isPdf
        ? {
            source_type: "pdf",
            doc_id: id,
            page: index + 1,
            bbox: [72, 680, 520, 720],
            coord_system: "pdf_user_space_bl_pt",
            page_width: 612,
            page_height: 792,
            crop_box: [0, 0, 612, 792],
            rotation: 0,
            node_id: nodeId,
            checksum: hash,
          }
        : {
            source_type: "text",
            doc_id: id,
            page: 1,
            line_start: index + 1,
            line_end: index + 1,
            node_id: nodeId,
            checksum: hash,
          };

    return {
      id: nodeId,
      document_id: id,
      node_type: isJson ? "JSON_RULE" : "PARAGRAPH",
      section_path: isJson ? `$.item[${index}]` : `Line ${index + 1}`,
      verbatim_text: line,
      structured_payload: null,
      page_number: isPdf ? index + 1 : 1,
      bounding_box: isPdf ? { x0: 72, y0: 680, x1: 520, y1: 720 } : null,
      ocr_confidence: isLow ? 0.82 : 1,
      node_order: index,
      locator,
    };
  });
  const risk = priorityFor(nodes[0].verbatim_text, nodes[0].ocr_confidence);
  return {
    document: {
      id,
      filename: file.name,
      source_format: file.name.split(".").pop()?.toUpperCase() ?? "TEXT",
      category: categoryFor(nodes[0].verbatim_text),
      sub_category: null,
      priority_tier: risk.tier,
      priority_score: risk.score,
      ast_checksum: hash,
      file_size_bytes: file.size,
      total_pages: isPdf ? nodes.length : 1,
      total_ast_nodes: nodes.length,
      processing_status: "COMPLETED",
      effective_date: null,
      is_latest_version: true,
      workspace_id: workspaceId ?? null,
    },
    nodes,
  };
}

export function localItems(
  document: Document,
  nodes: ASTNode[],
  workspaceId: string,
  batchId: string
): WorkItem[] {
  return nodes.map((node) => {
    const cleanNodeText = node.verbatim_text.replace(/^\[LOW_CONFIDENCE\]\s*/i, "").trim();
    const isMissingPlaceholder =
      !cleanNodeText || /evidence missing|unanswered|no matching text/i.test(cleanNodeText);
    const risk = priorityFor(node.verbatim_text, node.ocr_confidence);
    const quoteStrength = assessQuoteStrength(node.verbatim_text);
    const confident = !isMissingPlaceholder && node.ocr_confidence >= 0.9;
    const isWeak = confident && quoteStrength.isWeak;
    const verified = confident && !isWeak;
    const priorityTier = !confident
      ? "P0_CRITICAL"
      : isWeak && risk.tier === "P2_MEDIUM"
        ? "P1_HIGH"
        : risk.tier;
    const priorityScore = !confident ? 100 : isWeak ? Math.max(risk.score, 65) : risk.score;
    const isScanRescue =
      !isMissingPlaceholder &&
      (!confident ||
        node.node_type === "SCAN_STAMP" ||
        node.node_type === "STAMP_NOTE" ||
        Boolean(node.locator?.source_type === "pdf" && node.locator.is_scan));
    const hasVisionRescue = isScanRescue;
    const visionRescueText = isScanRescue ? cleanNodeText : null;
    const machineExtractedText =
      !isMissingPlaceholder && !isScanRescue ? cleanNodeText : null;

    return {
      id: uid(),
      workspace_id: workspaceId,
      batch_id: batchId,
      document_id: document.id,
      item_type: "DOCUMENT_FINDING",
      category: categoryFor(node.verbatim_text),
      priority_tier: priorityTier,
      original_priority_tier: priorityTier,
      priority_score: priorityScore,
      prompt_or_question: node.section_path ?? "Source item",
      fluent_output: verified
        ? `Verified against the exact source text in ${document.filename}.`
        : isWeak
          ? `Weak evidence flagged (${quoteStrength.reason}): '${node.verbatim_text}' requires reviewer verification.`
          : "Insufficient evidence in uploaded corpus — flagged for manual review.",
      structured_facts: [
        {
          fact_type: "SOURCE_EXCERPT",
          value: node.verbatim_text.slice(0, 120),
          verbatim_quote: node.verbatim_text,
          ast_node_id: node.id,
          confidence: verified ? 0.98 : isWeak ? 0.85 : 0.72,
        },
      ],
      verified_citations: confident
        ? [
            {
              quote: node.verbatim_text,
              ast_node_id: node.id,
              page_number: node.page_number,
              document_filename: document.filename,
              bounding_box: node.bounding_box,
              locator: node.locator ?? null,
              confidence_score: 99.0,
              region_match_score: 99.0,
            },
          ]
        : [],
      verification_status: verified
        ? "VERIFIED"
        : isWeak
          ? "NEEDS_HUMAN_VERIFICATION"
          : "INSUFFICIENT_EVIDENCE",
      resolved_by_tier: hasVisionRescue ? "SCOUT_VISION_RESCUE" : "TIER2_SLM_REGIMENT",
      has_vision_rescue: hasVisionRescue,
      vision_rescue_text: visionRescueText,
      machine_extracted_text: machineExtractedText,
      weak_evidence: isWeak,
      weak_evidence_reason: quoteStrength.reason,
      evidence_quality: !confident ? "missing" : isWeak ? "weak" : "strong",
      gate_telemetry: {
        citation_match: confident ? 100 : 0,
        critical_logprob: verified ? 0.98 : isWeak ? 0.85 : 0.72,
        failed_citations: isWeak ? ["weak_quote_specificity"] : [],
        failed_logprobs: [],
      },
      created_at: new Date().toISOString(),
    };
  });
}

export function generateLocalExecutiveSummary({
  documents,
  workItems,
  documentId = null,
  onlyCritical = false,
  latestOnly = false,
  workspaceId = null,
}: {
  documents: Document[];
  workItems: WorkItem[];
  documentId?: string | null;
  onlyCritical?: boolean;
  latestOnly?: boolean;
  workspaceId?: string | null;
}): ExecutiveSummary {
  const docById = new Map(documents.map((d) => [d.id, d]));
  const scopedDoc =
    documentId && documentId !== "ALL" ? docById.get(documentId) ?? null : null;

  const filtered = filterWorkItemsForScope({
    items: workItems,
    documents,
    documentId,
    onlyCritical,
    latestOnly,
  });

  const metrics = computeWorkItemMetrics(filtered);
  const totalWorkItems = metrics.total;
  const verifiedCount = metrics.machineVerified;
  const escalatedLegalCount = metrics.escalatedLegal;
  const unresolvedCount = metrics.unresolved;
  const criticalCount = metrics.criticalTotal;
  const defensibilityScore = metrics.defensibilityScore ?? 0;

  const latestDocs = documents
    .filter((d) => d.is_latest_version)
    .map((d) => d.filename);
  const supersededDocs = documents
    .filter((d) => !d.is_latest_version)
    .map((d) => d.filename);
  const arbiterResolutions = {
    latest_documents: latestDocs,
    superseded_documents: supersededDocs,
    resolved: supersededDocs.length > 0 || documents.length > 0,
  };

  if (totalWorkItems === 0) {
    const scopeLabel = scopedDoc ? scopedDoc.filename : "the active filters";
    const emptyMsg = `0 findings for this document/filter (${scopeLabel}).`;
    const md = [
      "# ShieldStaff Executive Review Summary (Envoy)",
      "",
      `Scope: ${scopedDoc ? scopedDoc.filename : "All Documents"} | Only Critical: ${onlyCritical} | Latest Version Only: ${latestOnly}`,
      "",
      emptyMsg,
    ].join("\n");
    return {
      id: `local-${uid()}`,
      workspace_id: workspaceId,
      document_id: documentId && documentId !== "ALL" ? documentId : null,
      only_critical: onlyCritical,
      latest_only: latestOnly,
      total_work_items: 0,
      verified_count: 0,
      unresolved_count: 0,
      escalated_legal_count: 0,
      critical_count: 0,
      human_override_count: 0,
      not_applicable_count: 0,
      critical_open_count: 0,
      high_open_count: 0,
      weak_evidence_count: 0,
      defensibility_score: 0,
      summary_text: emptyMsg,
      markdown: md,
      key_findings: [],
      arbiter_resolutions: arbiterResolutions,
      is_stale: false,
      created_at: new Date().toISOString(),
    };
  }

  const keyFindings = filtered.slice(0, 10).map((item) => ({
    work_item_id: item.id,
    document_id: item.document_id,
    document_filename: item.document_id
      ? docById.get(item.document_id)?.filename ?? null
      : null,
    priority_tier: item.priority_tier,
    verification_status: item.verification_status,
    category: item.category,
    prompt_or_question: item.prompt_or_question,
    fluent_output: item.fluent_output,
  }));

  const scopeText = scopedDoc
    ? `${scopedDoc.filename}`
    : `${documents.length} corpus document(s)`;
  const parts: string[] = [
    `Envoy synthesized ${totalWorkItems} finding(s) across ${scopeText}: ${verifiedCount} Machine Verified (${defensibilityScore}% defensibility)`,
  ];
  if (metrics.humanOverride > 0) {
    parts.push(`${metrics.humanOverride} human overridden (unverified by gate)`);
  }
  if (escalatedLegalCount > 0) {
    parts.push(`${escalatedLegalCount} escalated to Legal Counsel (excluded from machine-verified numerator)`);
  }
  if (metrics.notApplicable > 0) {
    parts.push(`${metrics.notApplicable} marked N/A`);
  }
  if (unresolvedCount > 0) {
    parts.push(`${unresolvedCount} pending human verification`);
  }
  if (metrics.weakEvidenceCount > 0) {
    parts.push(`${metrics.weakEvidenceCount} weak evidence`);
  }
  if (supersededDocs.length > 0 && latestOnly) {
    parts.push(
      `Chronos superseded filter excluded legacy source(s): ${supersededDocs.join(", ")}`
    );
  }
  const summaryText = parts.join(" · ") + ".";

  const lines = [
    "# ShieldStaff Executive Review Summary (Envoy)",
    "",
    `- **Scope**: ${scopedDoc ? scopedDoc.filename : "All Documents"}`,
    `- **Total Findings**: ${totalWorkItems}`,
    `- **Machine Verified**: ${verifiedCount}`,
    `- **Human Overridden**: ${metrics.humanOverride}`,
    `- **Escalated (Legal)**: ${escalatedLegalCount}`,
    `- **Marked N/A**: ${metrics.notApplicable}`,
    `- **Unresolved**: ${unresolvedCount}`,
    `- **Defensibility Score**: ${defensibilityScore}%`,
    "",
    "## Executive Synthesis",
    summaryText,
    "",
    "## Key Findings",
    ...keyFindings.map(
      (f, idx) =>
        `${idx + 1}. **[${f.priority_tier} · ${f.verification_status}]** ${f.category}: ${f.prompt_or_question} — ${f.fluent_output}`
    ),
  ];

  return {
    id: `local-${uid()}`,
    workspace_id: workspaceId,
    document_id: documentId && documentId !== "ALL" ? documentId : null,
    only_critical: onlyCritical,
    latest_only: latestOnly,
    total_work_items: totalWorkItems,
    verified_count: verifiedCount,
    unresolved_count: unresolvedCount,
    escalated_legal_count: escalatedLegalCount,
    critical_count: criticalCount,
    human_override_count: metrics.humanOverride,
    not_applicable_count: metrics.notApplicable,
    critical_open_count: metrics.criticalOpen,
    high_open_count: metrics.highOpen,
    weak_evidence_count: metrics.weakEvidenceCount,
    defensibility_score: defensibilityScore,
    summary_text: summaryText,
    markdown: lines.join("\n"),
    key_findings: keyFindings,
    arbiter_resolutions: arbiterResolutions,
    is_stale: false,
    created_at: new Date().toISOString(),
  };
}

export interface LocalReviewOptions {
  nodesByDocument?: Record<string, ASTNode[]>;
  workItems?: WorkItem[];
  stepDelayMs?: number;
}

export async function runLocalMultiAgentReview(
  set: (updater: (state: any) => any) => void,
  get: () => any,
  documents: Document[],
  job: JobExecution,
  options?: LocalReviewOptions
): Promise<void> {
  const runId = ++localRun;
  const telemetryRunId = job.job_id || `local-${runId}`;
  const stepDelayMs = options?.stepDelayMs ?? 420;
  const stagedNodesMap = options?.nodesByDocument;
  const stagedItems = options?.workItems;
  const effectiveNodesMap: Record<string, ASTNode[]> =
    stagedNodesMap ?? (get().nodesByDocument ?? {});
  const allNodesList = Object.values(effectiveNodesMap).flat();
  const effectiveAllItems: WorkItem[] = stagedItems ?? (get().workItems ?? []);
  const revealedItemIds = new Set<string>();

  const waitIfPaused = async (): Promise<boolean> => {
    if (runId !== localRun) return false;
    if (localPaused) {
      await new Promise<void>((resolve) => {
        localResume = resolve;
      });
      if (runId !== localRun) return false;
    }
    return true;
  };

  const revealNodes = (docIds: string[]) => {
    if (!stagedNodesMap) return;
    set((s: any) => {
      const nextNodes: Record<string, ASTNode[]> = { ...(s.nodesByDocument ?? {}) };
      for (const dId of docIds) {
        if (stagedNodesMap[dId]) {
          nextNodes[dId] = stagedNodesMap[dId];
        }
      }
      return { nodesByDocument: nextNodes };
    });
  };

  const revealWorkItems = (itemsToAdd: WorkItem[], emitEvents = false) => {
    if (!stagedItems) return;
    const fresh = itemsToAdd.filter((w) => !revealedItemIds.has(w.id));
    if (fresh.length === 0) return;
    fresh.forEach((w) => revealedItemIds.add(w.id));
    set((s: any) => ({
      workItems: [...(s.workItems ?? []), ...fresh],
    }));
    if (emitEvents) {
      for (const item of fresh) {
        get().appendEvent({
          type: "work_item",
          id: item.id,
          status: item.verification_status,
          job_id: job.job_id,
          run_id: telemetryRunId,
          document_id: item.document_id,
        });
      }
    }
  };

  const totalPages = Math.max(
    1,
    documents.reduce((acc, d) => acc + (d.total_pages || 1), 0)
  );
  const lowConfNodes = allNodesList.filter((n) => n.ocr_confidence < 0.9);
  const scanDoc =
    documents.find(
      (d) =>
        d.source_format === "PHYSICAL_SCAN" ||
        d.filename.toLowerCase().includes("scan")
    ) ?? documents[0] ?? null;
  const supersededDocs = documents.filter((d) => !d.is_latest_version);
  const latestDocs = documents.filter((d) => d.is_latest_version);
  const temporalItems = effectiveAllItems.filter(
    (w) => w.item_type === "TEMPORAL_CONFLICT"
  );
  const p0Count = effectiveAllItems.filter((w) => w.priority_tier === "P0_CRITICAL").length;
  const p1Count = effectiveAllItems.filter((w) => w.priority_tier === "P1_HIGH").length;
  const totalMetrics = computeWorkItemMetrics(effectiveAllItems);

  for (let index = 0; index < AGENTS.length; index += 1) {
    if (!(await waitIfPaused())) return;
    const agentName = AGENTS[index];
    const role = AGENT_ROLES[index];

    const stageDoc =
      index === 0
        ? scanDoc
        : index === 4
          ? documents.find((d) => d.source_format === "XLSX") ?? documents[0] ?? null
          : null;

    const current: JobExecution = {
      ...job,
      status: "RUNNING",
      current_agent_index: index,
      current_document_id: stageDoc?.id ?? documents[0]?.id ?? null,
      current_node_index: 0,
    };
    set(() => ({ activeJob: current, job: current, isSimulating: true }));

    const startedMs = Date.now();
    const perfStart =
      typeof globalThis.performance?.now === "function"
        ? globalThis.performance.now()
        : startedMs;

    const stageRunningSummary = [
      `Scanning ${totalPages} pages for low-confidence & stamped regions`,
      `Categorizing ${allNodesList.length || documents.length} AST nodes across ${documents.length} documents`,
      `Sequencing ${documents.length} documents & checking policy supersession`,
      `Scoring ${allNodesList.length || effectiveAllItems.length} nodes for P0/P1 risk severity`,
      `Extracting verbatim facts & running ≥97% rapidfuzz citation gate`,
      `Resolving cross-document contradictions & temporal conflicts`,
      `Synthesizing executive compliance briefing & defensibility score`,
    ][index];

    const inputHash = await checksum(
      JSON.stringify({ runId: telemetryRunId, agentName, index, docs: documents.map((d) => d.id) })
    );
    if (runId !== localRun) return;

    get().appendEvent({
      type: "agent_transition",
      agent_name: agentName,
      current_agent_index: index,
      status: "running",
      job_status: "RUNNING",
      job_id: job.job_id,
      run_id: telemetryRunId,
      started_at: startedMs,
      input_hash: inputHash,
      document_id: stageDoc?.id ?? null,
      document_filename: stageDoc?.filename ?? null,
      summary: stageRunningSummary,
      message: stageRunningSummary,
      details: {
        stage: agentName,
        role,
        documents_in_scope: documents.length,
      },
    });

    if (stepDelayMs > 0) {
      await sleep(stepDelayMs);
    }
    if (!(await waitIfPaused())) return;

    // Progressive Inspector Population across Scout..Envoy
    if (index === 0) {
      const initialDocIds = [scanDoc?.id, documents[0]?.id].filter(
        (v): v is string => Boolean(v)
      );
      revealNodes(initialDocIds);
    } else if (index === 1) {
      revealNodes(documents.map((d) => d.id));
    } else if (index === 2) {
      revealWorkItems(temporalItems, true);
    } else if (index === 3) {
      revealWorkItems(
        effectiveAllItems.filter(
          (w) => w.priority_tier === "P0_CRITICAL" || w.priority_tier === "P1_HIGH"
        ),
        true
      );
    } else if (index === 4) {
      revealWorkItems(effectiveAllItems, true);
    } else if (index === 5) {
      revealWorkItems(effectiveAllItems, false);
    }

    const completedMs = Date.now();
    const perfEnd =
      typeof globalThis.performance?.now === "function"
        ? globalThis.performance.now()
        : completedMs;
    const latencyMs = Math.max(1, Math.round(perfEnd - perfStart));

    let completedSummary = `${role} completed`;
    let details: Record<string, unknown> = { stage: agentName, role };

    if (index === 0) {
      completedSummary = `${totalPages} pages scanned · ${lowConfNodes.length} low-confidence region${lowConfNodes.length === 1 ? "" : "s"} flagged`;
      details = {
        pages_scanned: totalPages,
        low_confidence_regions: lowConfNodes.length,
        flagged_document: scanDoc?.filename ?? null,
      };
    } else if (index === 1) {
      completedSummary = `${allNodesList.length} nodes tagged across ${documents.length} documents`;
      details = {
        total_nodes: allNodesList.length,
        documents: documents.length,
        categories: Array.from(new Set(documents.map((d) => d.category).filter(Boolean))),
      };
    } else if (index === 2) {
      completedSummary = `${documents.length} docs sequenced · ${temporalItems.length} supersession conflict${temporalItems.length === 1 ? "" : "s"}`;
      details = {
        latest_documents: latestDocs.map((d) => d.filename),
        superseded_documents: supersededDocs.map((d) => d.filename),
        conflicts: temporalItems.length,
      };
    } else if (index === 3) {
      completedSummary = `Scored ${allNodesList.length} nodes · ${p0Count} critical (P0) · ${p1Count} high (P1)`;
      details = {
        total_nodes: allNodesList.length,
        p0_critical: p0Count,
        p1_high: p1Count,
      };
    } else if (index === 4) {
      completedSummary = `${totalMetrics.total} findings extracted · ${totalMetrics.machineVerified} verified ≥97%`;
      details = {
        findings_extracted: totalMetrics.total,
        verified_97_plus: totalMetrics.machineVerified,
        needs_triage: totalMetrics.needsTriage,
      };
    } else if (index === 5) {
      completedSummary = `${temporalItems.length} temporal contradiction${temporalItems.length === 1 ? "" : "s"} resolved · authoritative policy precedence enforced`;
      details = {
        conflicts_resolved: temporalItems.length,
        resolved: true,
        latest_documents: latestDocs.map((d) => d.filename),
      };
    } else {
      const score = totalMetrics.defensibilityScore ?? 0;
      completedSummary = `Executive synthesis generated · ${score}% defensibility (${totalMetrics.machineVerified}/${totalMetrics.total} verified)`;
      details = {
        defensibility_score: score,
        machine_verified: totalMetrics.machineVerified,
        total_items: totalMetrics.total,
        needs_triage: totalMetrics.needsTriage,
      };
    }

    const outputHash = await checksum(JSON.stringify({ agentName, details, latencyMs }));
    if (runId !== localRun) return;

    get().appendEvent({
      type: "agent_transition",
      agent_name: agentName,
      current_agent_index: index,
      status: "completed",
      job_status: index === AGENTS.length - 1 ? "COMPLETED" : "RUNNING",
      job_id: job.job_id,
      run_id: telemetryRunId,
      started_at: startedMs,
      completed_at: completedMs,
      latency_ms: latencyMs,
      input_hash: inputHash,
      output_hash: outputHash,
      document_id: stageDoc?.id ?? null,
      document_filename: stageDoc?.filename ?? null,
      summary: completedSummary,
      message: completedSummary,
      details,
    });
  }

  if (runId !== localRun) return;
  const items: WorkItem[] = get().workItems ?? effectiveAllItems;
  const metrics = computeWorkItemMetrics(items);
  const completedJob: JobExecution = {
    ...job,
    status: "COMPLETED",
    current_agent_index: 6,
    current_document_id: documents[0]?.id ?? null,
    current_node_index: Math.max(0, items.length - 1),
  };
  set(() => ({
    activeJob: completedJob,
    job: completedJob,
    isSimulating: false,
    hasCompletedRun: true,
    jobCompletedAt: Date.now(),
    notice: `Review complete — ${metrics.machineVerified}/${metrics.total} machine-verified. ${metrics.needsTriage} item(s) require action.`,
  }));
  if (typeof get().loadSummary === "function") {
    void get().loadSummary(get().summaryParams, true);
  }
}
