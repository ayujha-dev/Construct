export interface StagedFileItem {
  id: string;
  name: string;
  sizeBytes: number;
  sizeLabel: string;
  typeLabel: string;
  file: File;
}

export interface LandingNavItem {
  id: "evidence-demo" | "how-it-works" | "security-gate" | "use-cases" | "local-mode";
  label: string;
}

export interface ClaimEvidenceDemoItem {
  id: string;
  shortLabel: string;
  claimTitle: string;
  claimText: string;
  sourceFile: string;
  sourceFormat: "PDF" | "JSON" | "XLSX" | "SCAN";
  locatorLabel: string;
  gateRule: string;
  matchScoreLabel: string;
  logprobLabel: string;
  status: "VERIFIED" | "INSUFFICIENT_EVIDENCE";
  statusBadge: string;
  sourceExcerpt: string;
  highlightedSpan: string;
  explanation: string;
}

export interface PipelineAgentItem {
  step: string;
  name: "Scout" | "Quartermaster" | "Chronos" | "Vanguard" | "Ranger" | "Arbiter" | "Envoy";
  modelTier: "Vision SLM" | "Text SLM · Deterministic";
  role: string;
  detail: string;
}

export interface GatePillarItem {
  id: string;
  tag: string;
  title: string;
  summary: string;
  contractNote: string;
}

export interface UseCaseItem {
  id: string;
  formatBadge: string;
  title: string;
  summary: string;
  detail: string;
  locatorExample: string;
}

export interface LocalModeGuarantee {
  id: string;
  tag: string;
  title: string;
  detail: string;
  artifactNote: string;
}

export const LANDING_SECTION_IDS = [
  "hero",
  "evidence-demo",
  "how-it-works",
  "security-gate",
  "use-cases",
  "local-mode",
] as const;

export const LANDING_NAV_ITEMS: LandingNavItem[] = [
  { id: "evidence-demo", label: "Evidence Demo" },
  { id: "how-it-works", label: "Pipeline" },
  { id: "security-gate", label: "Security Gate" },
  { id: "use-cases", label: "Use Cases" },
  { id: "local-mode", label: "Local Mode" },
];

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return "1 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function getScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

export function scrollToSection(id: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
  return true;
}

export function buildStagedFileItem(file: File, index = 0): StagedFileItem {
  const ext = file.name.split(".").pop()?.trim().toUpperCase() || "FILE";
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    name: file.name,
    sizeBytes: file.size,
    sizeLabel: formatFileSize(file.size),
    typeLabel: ext,
    file,
  };
}

export function mergeStagedFiles(
  existing: StagedFileItem[],
  incoming: File[]
): StagedFileItem[] {
  if (!incoming.length) return existing;
  const seen = new Set(existing.map((item) => `${item.name}::${item.sizeBytes}::${item.file.lastModified}`));
  const next = [...existing];
  incoming.forEach((file, idx) => {
    const key = `${file.name}::${file.size}::${file.lastModified}`;
    if (!seen.has(key)) {
      seen.add(key);
      next.push(buildStagedFileItem(file, next.length + idx));
    }
  });
  return next;
}

export function removeStagedFileAt(
  existing: StagedFileItem[],
  index: number
): StagedFileItem[] {
  return existing.filter((_, idx) => idx !== index);
}

export function extractRealFiles(staged: StagedFileItem[]): File[] {
  return staged.map((item) => item.file);
}

export const CLAIM_EVIDENCE_DEMOS: ClaimEvidenceDemoItem[] = [
  {
    id: "soc2-mfa",
    shortLabel: "SOC 2 MFA",
    claimTitle: "Privileged Access Control (SOC 2)",
    claimText:
      "Access control requires multifactor authentication for all privileged accounts across production environments.",
    sourceFile: "SOC2_Type_II_2026.pdf",
    sourceFormat: "PDF",
    locatorLabel: "p. 14 · bbox [72, 610, 512, 636]",
    gateRule: "rapidfuzz partial_ratio >= 97% + specificity check",
    matchScoreLabel: "99.4% quote match",
    logprobLabel: "Entity logprob 0.98 (>= 0.92)",
    status: "VERIFIED",
    statusBadge: "VERIFIED · Gate Passed",
    sourceExcerpt:
      "Section 4.2 Logical Access: Access control requires multifactor authentication for all privileged accounts across production environments, audited quarterly.",
    highlightedSpan:
      "Access control requires multifactor authentication for all privileged accounts across production environments",
    explanation:
      "Ranger extracts the structured fact and verbatim quote; the deterministic gate confirms a 99.4% match against the persisted PDF AST node and renders the page bounding box.",
  },
  {
    id: "aws-iam-wildcard",
    shortLabel: "IAM Wildcard s3:*",
    claimTitle: "Unrestricted Cloud IAM Action",
    claimText:
      "Production IAM policy grants Effect Allow with wildcard action s3:* on resource *.",
    sourceFile: "aws_iam_prod_config.json",
    sourceFormat: "JSON",
    locatorLabel: "$.rules.wildcard-admin.action",
    gateRule: "O(1) ijson stream + canonical JSONPath locator",
    matchScoreLabel: "100.0% quote match",
    logprobLabel: "Vanguard P0_CRITICAL (96/100)",
    status: "VERIFIED",
    statusBadge: "VERIFIED · P0 Risk Flagged",
    sourceExcerpt:
      '{ "rules": { "wildcard-admin": { "effect": "Allow", "action": "s3:*", "resource": "*" } } }',
    highlightedSpan: '"action": "s3:*"',
    explanation:
      "JSONStreamer parses config payloads into canonical JSONPath nodes so Vanguard scores wildcard s3:* exposure at P0_CRITICAL with direct tree-node jump.",
  },
  {
    id: "chronos-supersession",
    shortLabel: "Chronos 2026 vs 2023",
    claimTitle: "Temporal Policy Supersession",
    claimText:
      "Minimum password length is 14 characters per 2026 SOC 2 policy, superseding the 2023 8-character policy.",
    sourceFile: "Enterprise_Security_Questionnaire.xlsx",
    sourceFormat: "XLSX",
    locatorLabel: "Questionnaire!A5:D5 · SOC2 p. 12",
    gateRule: "Chronos effective_date ordering + Arbiter conflict link",
    matchScoreLabel: "98.2% quote match",
    logprobLabel: "Entity logprob 0.96 (>= 0.92)",
    status: "VERIFIED",
    statusBadge: "VERIFIED · Chronos Resolved",
    sourceExcerpt:
      "Row 5 [Questionnaire!A5:D5]: Minimum password policy -> 2026 SOC 2 requires 14 characters (supersedes Legacy_InfoSec_Policy_2023.pdf 8-character rule).",
    highlightedSpan: "14 characters (supersedes Legacy_InfoSec_Policy_2023.pdf 8-character rule)",
    explanation:
      "Chronos tracks effective dates across versions so Arbiter surfaces TEMPORAL_CONFLICT cards and Envoy cites the active 2026 policy instead of stale 2023 text.",
  },
  {
    id: "missing-proof-escalation",
    shortLabel: "Missing-Proof Escalation",
    claimTitle: "Unsupported SLA Claim Blocked",
    claimText:
      "Vendor guarantees a 15-minute breach notification SLA across all fourth-party sub-processors.",
    sourceFile: "Vendor_SLA_Addendum.pdf",
    sourceFormat: "SCAN",
    locatorLabel: "No matching source node in corpus",
    gateRule: "Fail-closed rapidfuzz < 97% -> hard gate rejection",
    matchScoreLabel: "41.0% match (< 97% required)",
    logprobLabel: "Envoy synthesis blocked",
    status: "INSUFFICIENT_EVIDENCE",
    statusBadge: "Flagged -> Human Triage",
    sourceExcerpt:
      "Insufficient evidence in uploaded corpus — flagged for manual review. (Closest clause on p. 7 mentions '72-hour customer notification' without sub-processor SLA.)",
    highlightedSpan: "Insufficient evidence in uploaded corpus — flagged for manual review.",
    explanation:
      "When evidence falls below 97% or ocr_confidence < 0.90, Envoy raises a hard gate block and routes the item to /triage as INSUFFICIENT_EVIDENCE (P0_CRITICAL).",
  },
];

export const PIPELINE_AGENTS: PipelineAgentItem[] = [
  {
    step: "01",
    name: "Scout",
    modelTier: "Vision SLM",
    role: "OCR Rescue",
    detail:
      "Detects scanned or low-confidence regions (ocr_confidence < 0.90) and extracts bounding-box crops for human inspection.",
  },
  {
    step: "02",
    name: "Quartermaster",
    modelTier: "Text SLM · Deterministic",
    role: "Categorizer",
    detail:
      "Tags AST nodes into domains like Access Control, Cryptography, Data Retention, and Liability & Indemnification.",
  },
  {
    step: "03",
    name: "Chronos",
    modelTier: "Text SLM · Deterministic",
    role: "Temporal Tracker",
    detail:
      "Orders policy files by effective date and flags legacy documents with superseded_by lineage.",
  },
  {
    step: "04",
    name: "Vanguard",
    modelTier: "Text SLM · Deterministic",
    role: "Risk Prioritizer",
    detail:
      "Scores nodes (P0_CRITICAL >= 85, P1_HIGH >= 65, P2_MEDIUM) for wildcards (s3:*), uncapped liability, and weak OCR.",
  },
  {
    step: "05",
    name: "Ranger",
    modelTier: "Text SLM · Deterministic",
    role: "Fact Extractor",
    detail:
      "Emits strict schema-validated ExtractedFact payloads (fact_type, value, verbatim_quote, ast_node_id, confidence).",
  },
  {
    step: "06",
    name: "Arbiter",
    modelTier: "Text SLM · Deterministic",
    role: "Conflict Resolver",
    detail:
      "Cross-checks latest vs superseded documents and records explicit TEMPORAL_CONFLICT findings.",
  },
  {
    step: "07",
    name: "Envoy",
    modelTier: "Text SLM · Deterministic",
    role: "Summary Scribe",
    detail:
      "Synthesizes answers and executive summaries strictly from gate-passed ExtractedFacts—refusing prose if the gate fails.",
  },
];

export const VERIFICATION_GATE_PILLARS: GatePillarItem[] = [
  {
    id: "rapidfuzz-specificity",
    tag: "GATE 01 · VERBATIM MATCH",
    title: "rapidfuzz >= 97% + Minimum Specificity",
    summary:
      "Every cited quote must match the persisted source AST text at >= 97% rapidfuzz partial_ratio and meet minimum quote length and token specificity rules—blocking trivial 1-word matches or bloated fabricated snippets.",
    contractNote: "CITATION_THRESHOLD = 97.0 · apps/api/bert/verification/citation_gate.py",
  },
  {
    id: "entity-logprob",
    tag: "GATE 02 · CRITICAL ENTITIES",
    title: ">= 0.92 Critical-Entity Logprob Check",
    summary:
      "High-stakes entity extractions (DATE, AMOUNT, PARTY_NAME, JURISDICTION, LIABILITY_CAP) require token probability >= 0.92. Missing or low-confidence evidence fails closed to human triage rather than guessing.",
    contractNote: "LOGPROB_THRESHOLD = 0.92 · CRITICAL_ENTITY_TYPES fail closed",
  },
  {
    id: "human-vs-machine",
    tag: "GATE 03 · AUDIT SEPARATION",
    title: "Strict Separation of Human & Machine Statuses",
    summary:
      "Human overrides (HUMAN_OVERRIDE), legal escalations (ESCALATED_LEGAL, preserving original P0/P1 risk scores), and N/A items (NOT_APPLICABLE) are tracked separately from machine-verified items (VERIFIED) so defensibility metrics never inflate.",
    contractNote: "VERIFIED numerator excludes HUMAN_OVERRIDE, ESCALATED_LEGAL & NOT_APPLICABLE",
  },
];

export const USE_CASES: UseCaseItem[] = [
  {
    id: "vendor-questionnaires",
    formatBadge: ".XLSX",
    title: "Vendor Questionnaires",
    summary: "Populate blank security & due-diligence spreadsheets with exact cell-anchored citations.",
    detail:
      "XLSXHandler streams sheets row-by-row, pairs each question against policy and config AST nodes, enforces the >=97% quote gate, and exports completed workbooks without mutating the source template.",
    locatorExample: "Locator: Questionnaire!A5:D5 -> SOC2_Type_II_2026.pdf p. 14",
  },
  {
    id: "policy-version-audits",
    formatBadge: ".PDF + CHRONOS",
    title: "Policy Version Audits",
    summary: "Detect contradictory rules between legacy 2023 policies and current 2026 reports.",
    detail:
      "Chronos ranks documents by effective date, marks older policies as superseded, and Arbiter preserves TEMPORAL_CONFLICT findings so reviewers verify which requirement governs.",
    locatorExample: "Locator: Legacy_InfoSec_Policy_2023.pdf p. 3 vs SOC2_Type_II_2026.pdf p. 12",
  },
  {
    id: "cloud-iam-audits",
    formatBadge: ".JSON",
    title: "Cloud IAM Audits",
    summary: "Stream large IAM policy configs and pinpoint wildcard permissions by JSONPath.",
    detail:
      "JSONStreamer parses files using O(1) incremental ijson streaming without loading huge root objects in memory, anchoring P0_CRITICAL findings like s3:* directly to canonical JSONPaths.",
    locatorExample: "Locator: $.rules.wildcard-admin.action",
  },
  {
    id: "scanned-physical-addenda",
    formatBadge: "SCOUT OCR",
    title: "Scanned Physical Addenda",
    summary: "Isolate low-confidence stamps, handwriting, and degraded PDF scans for human review.",
    detail:
      "When Scout detects ocr_confidence < 0.90, BERT blocks automatic verification, attaches page bounding-box coordinates, and queues the crop in /triage with transactional Undo.",
    locatorExample: "Locator: Scanned_Addendum_p7.pdf p. 7 · bbox [96, 412, 488, 492]",
  },
];

export const LOCAL_MODE_GUARANTEES: LocalModeGuarantee[] = [
  {
    id: "sqlite-local-vllm",
    tag: "01 · DEPLOYMENT",
    title: "Local SQLite + Offline Fallback or local_vllm",
    detail:
      "Persist documents, AST nodes, work items, and checkpoints locally in SQLite (sqlite_async). Run either with deterministic offline simulation or local_vllm (Qwen2.5-14B / Qwen2.5-VL-7B) with no mandatory external cloud upload.",
    artifactNote: "db_mode: sqlite_async · inference_mode: demo_simulator | local_vllm",
  },
  {
    id: "sha256-ast",
    tag: "02 · INTEGRITY",
    title: "SHA-256 AST Completeness Verification",
    detail:
      "Every ingested file updates a rolling SHA-256 digest across ordered AST nodes (ast_checksum) and re-verifies persisted DB node text on ingestion completion—marking mismatches FAILED.",
    artifactNote: "verify_ingestion_completeness · payload_hash SHA-256",
  },
  {
    id: "audit-ledger",
    tag: "03 · TRACEABILITY",
    title: "Immutable AuditLog Entries",
    detail:
      "Every agent step, citation gate check, sandbox probe, manual override, legal escalation, N/A attestation, and undo writes a timestamped AuditLog row with input_hash and output_hash.",
    artifactNote: "GET /api/v1/audit-log · /results?tab=audit",
  },
];
