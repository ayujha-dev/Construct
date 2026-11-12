import type {
  Document,
  EvidenceLocator,
  MetricsResponse,
  VerificationStatus,
  WorkItem,
} from "../types/bert";

export interface ReasonCodeOption {
  value: string;
  label: string;
  description: string;
}

export const MANUAL_OVERRIDE_REASON_CODES: ReasonCodeOption[] = [
  {
    value: "SME_ATTESTATION",
    label: "SME Attestation (SME_ATTESTATION)",
    description: "Subject-matter expert verified control outside automated extraction",
  },
  {
    value: "ALTERNATE_DOCUMENT_EVIDENCE",
    label: "Alternate Evidence (ALTERNATE_DOCUMENT_EVIDENCE)",
    description: "Verified against another document or policy location in corpus",
  },
  {
    value: "SCAN_TRANSCRIPTION_VERIFIED",
    label: "Scan Transcription Verified (SCAN_TRANSCRIPTION_VERIFIED)",
    description: "Human reviewer visually verified degraded scan text",
  },
  {
    value: "LEGAL_APPROVED_EXCEPTION",
    label: "Approved Policy Exception (LEGAL_APPROVED_EXCEPTION)",
    description: "Documented exception approved by security/legal leadership",
  },
];

export const NOT_APPLICABLE_REASON_CODES: ReasonCodeOption[] = [
  {
    value: "OUT_OF_SCOPE_ENVIRONMENT",
    label: "Out of Scope for Environment",
    description: "Control or clause does not apply to the deployed architecture",
  },
  {
    value: "SUPERSEDED_BY_LATEST_POLICY",
    label: "Superseded Legacy Policy",
    description: "Replaced by newer authoritative documentation already evaluated",
  },
  {
    value: "DUPLICATE_QUESTIONNAIRE_ROW",
    label: "Duplicate Questionnaire Prompt",
    description: "Duplicate row covered identically elsewhere in the assessment",
  },
  {
    value: "CONTRACT_CLAUSE_NOT_TRIGGERED",
    label: "Contract Clause Not Triggered",
    description: "Conditional clause does not apply to this transaction",
  },
];

const TITLE_CONNECTORS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "type",
  "ii",
  "iii",
  "iv",
  "v",
]);

const CLAUSE_VERBS = new Set([
  "is",
  "are",
  "was",
  "were",
  "be",
  "must",
  "shall",
  "should",
  "may",
  "will",
  "can",
  "requires",
  "require",
  "enforces",
  "enforce",
  "uses",
  "use",
  "applies",
  "apply",
  "mandates",
  "mandate",
  "retains",
  "retain",
  "retained",
  "rotated",
  "encrypted",
  "archived",
  "prohibits",
  "prohibit",
  "contains",
  "contain",
  "permits",
  "permit",
]);

export function normalizeQuoteWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isBareHeaderOrTitle(normalized: string, words: string[]): boolean {
  if (!words.length) return false;
  if (normalized.includes("|") || (normalized.includes(":") && !normalized.startsWith("#"))) {
    return false;
  }
  if (/[.!?]$/.test(normalized)) return false;
  if (normalized.startsWith("#")) return true;
  if (/^(?:section|appendix|article|chapter)\s+\d+(?:\.\d+)*\b/i.test(normalized)) {
    const hasVerb = words.some((w) => CLAUSE_VERBS.has(w.toLowerCase().replace(/[.,;:]+$/g, "")));
    if (words.length <= 10 && !hasVerb) return true;
  }

  const alphaWords = words
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w.length > 0);
  if (!alphaWords.length) return false;

  const lettersOnly = normalized.replace(/[^A-Za-z]/g, "");
  if (lettersOnly && lettersOnly === lettersOnly.toUpperCase() && words.length <= 12) {
    return true;
  }

  if (words.length <= 10 && !alphaWords.some((w) => CLAUSE_VERBS.has(w.toLowerCase()))) {
    const significant = alphaWords.filter(
      (w) => !TITLE_CONNECTORS.has(w.toLowerCase()) && !/^\d+$/.test(w)
    );
    if (significant.length > 0 && significant.every((w) => w[0] === w[0].toUpperCase())) {
      return true;
    }
  }
  return false;
}

export interface QuoteStrengthResult {
  isWeak: boolean;
  reason: string | null;
}

/**
 * Mirrors backend `bert.verification.citation_gate.assess_quote_strength`:
 * Rejects bare section headers/titles and short fragments (`< 24` chars or `< 4` words)
 * from claiming full automated machine verification.
 */
export function assessQuoteStrength(
  quote: string,
  options?: { minQuoteChars?: number; minQuoteWords?: number }
): QuoteStrengthResult {
  const normalized = normalizeQuoteWhitespace(quote);
  if (!normalized) return { isWeak: false, reason: null };

  const charLimit = options?.minQuoteChars ?? 24;
  let wordLimit = options?.minQuoteWords ?? 4;

  // Compact JSON rules with valid structural tokens pass word check if >= min chars
  if (
    options?.minQuoteWords === undefined &&
    normalized.startsWith("{") &&
    normalized.includes(":") &&
    normalized.length >= charLimit
  ) {
    const structuralTokens = normalized.match(/[A-Za-z0-9_*]+/g) ?? [];
    if (structuralTokens.length >= 4) {
      wordLimit = 1;
    }
  }

  const words = normalized.split(" ").filter(Boolean);
  const reasons: string[] = [];
  if (normalized.length < charLimit) {
    reasons.push(`quote length ${normalized.length} chars < minimum ${charLimit}`);
  }
  if (words.length < wordLimit) {
    reasons.push(`quote word count ${words.length} < minimum ${wordLimit}`);
  }
  if (isBareHeaderOrTitle(normalized, words)) {
    reasons.push("bare heading or document title without substantive evidence");
  }
  if (reasons.length > 0) {
    return { isWeak: true, reason: reasons.join("; ") };
  }
  return { isWeak: false, reason: null };
}

export interface ManualOverrideValidationInput {
  reasonCode: string;
  correction: string;
  overrideLocator?: EvidenceLocator | null;
  overrideCitationText?: string | null;
  hasExistingLocator?: boolean;
  noEvidenceAttestation?: boolean;
}

export interface ManualOverrideValidationResult {
  valid: boolean;
  errors: {
    reasonCode?: string;
    correction?: string;
    evidence?: string;
  };
  message: string | null;
}

export function validateManualOverrideInput(
  input: ManualOverrideValidationInput
): ManualOverrideValidationResult {
  const errors: ManualOverrideValidationResult["errors"] = {};
  const trimmedCode = input.reasonCode.trim();
  const trimmedCorrection = input.correction.trim();
  const words = trimmedCorrection.split(/\s+/).filter(Boolean);
  const hasEvidenceSupport = Boolean(
    input.hasExistingLocator ||
      input.overrideLocator ||
      (input.overrideCitationText && input.overrideCitationText.trim().length > 0)
  );

  if (!trimmedCode) {
    errors.reasonCode = "Select a reason code before saving a manual override.";
  }
  if (trimmedCorrection.length < 12 || words.length < 3) {
    errors.correction =
      "Manual answer must be substantive (at least 12 characters and 3 words).";
  }
  if (!hasEvidenceSupport && !input.noEvidenceAttestation) {
    errors.evidence =
      'Provide a citation/locator or check "No evidence — reviewer attests".';
  }

  const firstMsg = errors.reasonCode ?? errors.correction ?? errors.evidence ?? null;
  return {
    valid: !firstMsg,
    errors,
    message: firstMsg,
  };
}

export interface NotApplicableValidationResult {
  valid: boolean;
  message: string | null;
}

export function validateNotApplicableInput(input: {
  reasonCode?: string | null;
  note?: string | null;
}): NotApplicableValidationResult {
  const hasCode = Boolean(input.reasonCode?.trim());
  const hasNote = Boolean(input.note?.trim());
  if (!hasCode && !hasNote) {
    return {
      valid: false,
      message: "Provide a reason code or justification note before marking an item N/A.",
    };
  }
  return { valid: true, message: null };
}

export interface WorkItemMetrics {
  total: number;
  machineVerified: number;
  humanOverride: number;
  escalatedLegal: number;
  notApplicable: number;
  unresolved: number;
  criticalTotal: number;
  criticalOpen: number;
  highOpen: number;
  needsTriage: number;
  weakEvidenceCount: number;
  defensibilityScore: number | null;
  exportWarnings: {
    hasUnresolved: boolean;
    hasEscalated: boolean;
    hasOverrides: boolean;
    hasNotApplicable: boolean;
    hasWeakEvidence: boolean;
    hasAnyWarning: boolean;
    totalWarningItems: number;
  };
}

/**
 * SINGLE source of truth for all frontend work-item counters, defensibility scoring,
 * and pre-export warnings. Matches `bert.verification.metrics.compute_work_item_metrics`.
 *
 * Guarantees:
 * - `machineVerified + humanOverride + escalatedLegal + notApplicable + unresolved === total`
 * - `defensibilityScore` includes ONLY `VERIFIED` items in the numerator
 * - `defensibilityScore` is `null` when `total === 0`, and capped `<= 99` if any P0/P1 != `VERIFIED`
 */
export function computeWorkItemMetrics(items: WorkItem[]): WorkItemMetrics {
  const total = items.length;
  let machineVerified = 0;
  let humanOverride = 0;
  let escalatedLegal = 0;
  let notApplicable = 0;
  let unresolved = 0;

  let criticalTotal = 0;
  let criticalOpen = 0;
  let highOpen = 0;
  let weakEvidenceCount = 0;
  let totalWarningItems = 0;
  let hasUnverifiedP0OrP1 = false;

  for (const item of items) {
    const status = item.verification_status;
    const tier = item.priority_tier;
    const isWeak = Boolean(item.weak_evidence || item.gate_telemetry?.weak_evidence);
    if (isWeak) weakEvidenceCount += 1;

    if (status === "VERIFIED") {
      machineVerified += 1;
    } else if (status === "HUMAN_OVERRIDE") {
      humanOverride += 1;
    } else if (status === "ESCALATED_LEGAL") {
      escalatedLegal += 1;
    } else if (status === "NOT_APPLICABLE") {
      notApplicable += 1;
    } else {
      unresolved += 1;
    }

    if (status !== "VERIFIED" || isWeak) {
      totalWarningItems += 1;
    }

    const isOpen =
      status !== "VERIFIED" && status !== "HUMAN_OVERRIDE" && status !== "NOT_APPLICABLE";
    if (tier === "P0_CRITICAL") {
      criticalTotal += 1;
      if (isOpen) criticalOpen += 1;
      if (status !== "VERIFIED") hasUnverifiedP0OrP1 = true;
    } else if (tier === "P1_HIGH") {
      if (isOpen) highOpen += 1;
      if (status !== "VERIFIED") hasUnverifiedP0OrP1 = true;
    }
  }

  const needsTriage = unresolved + escalatedLegal;

  let defensibilityScore: number | null = null;
  if (total > 0) {
    let raw = Math.round((machineVerified / total) * 100);
    if (hasUnverifiedP0OrP1 && raw >= 100) {
      raw = 99;
    }
    defensibilityScore = raw;
  }

  const hasUnresolved = unresolved > 0;
  const hasEscalated = escalatedLegal > 0;
  const hasOverrides = humanOverride > 0;
  const hasNotApplicable = notApplicable > 0;
  const hasWeakEvidence = weakEvidenceCount > 0;

  return {
    total,
    machineVerified,
    humanOverride,
    escalatedLegal,
    notApplicable,
    unresolved,
    criticalTotal,
    criticalOpen,
    highOpen,
    needsTriage,
    weakEvidenceCount,
    defensibilityScore,
    exportWarnings: {
      hasUnresolved,
      hasEscalated,
      hasOverrides,
      hasNotApplicable,
      hasWeakEvidence,
      hasAnyWarning:
        hasUnresolved || hasEscalated || hasOverrides || hasNotApplicable || hasWeakEvidence,
      totalWarningItems,
    },
  };
}

export function fromApiMetrics(m: MetricsResponse): WorkItemMetrics {
  return {
    total: m.total,
    machineVerified: m.machine_verified,
    humanOverride: m.human_override,
    escalatedLegal: m.escalated_legal,
    notApplicable: m.not_applicable,
    unresolved: m.unresolved,
    criticalTotal: m.critical_total,
    criticalOpen: m.critical_open,
    highOpen: m.high_open,
    needsTriage: m.needs_triage,
    weakEvidenceCount: m.weak_evidence_count,
    defensibilityScore: m.defensibility_score,
    exportWarnings: {
      hasUnresolved: m.export_warnings.has_unresolved,
      hasEscalated: m.export_warnings.has_escalated,
      hasOverrides: m.export_warnings.has_overrides,
      hasNotApplicable: m.export_warnings.has_not_applicable,
      hasWeakEvidence: m.export_warnings.has_weak_evidence,
      hasAnyWarning:
        m.export_warnings.has_unresolved ||
        m.export_warnings.has_escalated ||
        m.export_warnings.has_overrides ||
        m.export_warnings.has_not_applicable ||
        m.export_warnings.has_weak_evidence,
      totalWarningItems:
        m.unresolved + m.escalated_legal + m.human_override + m.not_applicable + m.weak_evidence_count,
    },
  };
}

export type MatchBadgeTone = "emerald" | "amber" | "rose" | "purple" | "slate";

export interface MatchBadgeAppearance {
  tone: MatchBadgeTone;
  label: string;
  scoreDisplay: string;
  gateLabel: string;
  badgeClass: string;
  textClass: string;
  isMachineVerified: boolean;
}

/**
 * Determines authoritative badge tone & label from score, verification status, and weak-evidence flag:
 * - `>= 97%` & strong machine-verified -> emerald
 * - `75%..96.9%` or `weakEvidence` -> amber
 * - `< 75%` (e.g. `50%`, `0%`) -> rose (NEVER emerald)
 * - `HUMAN_OVERRIDE` -> distinct purple human-attested badge (NEVER `"rapidfuzz verified"`)
 * - `NOT_APPLICABLE` -> neutral slate badge
 */
export function getMatchBadgeTone(
  score: number | null | undefined,
  status?: VerificationStatus | string | null,
  weakEvidence?: boolean | null
): MatchBadgeAppearance {
  const safeScore =
    typeof score === "number" && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const formatted = Number.isInteger(safeScore) ? `${safeScore}` : safeScore.toFixed(1);

  if (status === "HUMAN_OVERRIDE") {
    return {
      tone: "purple",
      label: "Human Override",
      scoreDisplay: "Unverified by gate",
      gateLabel: "Reviewer override",
      badgeClass:
        "bg-[var(--status-override-soft)] text-[var(--status-override-ink)] border border-[var(--status-override-border)]",
      textClass: "text-[var(--status-override-ink)]",
      isMachineVerified: false,
    };
  }

  if (status === "NOT_APPLICABLE") {
    return {
      tone: "slate",
      label: "Marked N/A",
      scoreDisplay: "N/A",
      gateLabel: "Reviewer marked N/A",
      badgeClass:
        "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border border-[var(--status-neutral-border)]",
      textClass: "text-[var(--status-neutral-ink)]",
      isMachineVerified: false,
    };
  }

  if (status === "ESCALATED_LEGAL") {
    return {
      tone: "amber",
      label: safeScore > 0 ? `${formatted}% · Legal Review` : "Legal Review",
      scoreDisplay: `${formatted}%`,
      gateLabel: "Escalated to counsel",
      badgeClass:
        "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]",
      textClass: "text-[var(--status-warning-ink)]",
      isMachineVerified: false,
    };
  }

  if (weakEvidence) {
    return {
      tone: "amber",
      label: `${formatted}% (Weak)`,
      scoreDisplay: `${formatted}%`,
      gateLabel: "Weak quote flagged",
      badgeClass:
        "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]",
      textClass: "text-[var(--status-warning-ink)]",
      isMachineVerified: false,
    };
  }

  if (safeScore >= 97 && (!status || status === "VERIFIED")) {
    return {
      tone: "emerald",
      label: `${formatted}% Match`,
      scoreDisplay: `${formatted}%`,
      gateLabel: "rapidfuzz gate",
      badgeClass:
        "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)]",
      textClass: "text-[var(--status-verified-ink)]",
      isMachineVerified: true,
    };
  }

  if (safeScore >= 75) {
    return {
      tone: "amber",
      label: `${formatted}% Match`,
      scoreDisplay: `${formatted}%`,
      gateLabel: "Needs verification",
      badgeClass:
        "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]",
      textClass: "text-[var(--status-warning-ink)]",
      isMachineVerified: false,
    };
  }

  return {
    tone: "rose",
    label: `${formatted}% Match`,
    scoreDisplay: `${formatted}%`,
    gateLabel: safeScore > 0 ? "Below threshold" : "Unverified by gate",
    badgeClass:
      "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border border-[var(--status-danger-border)]",
    textClass: "text-[var(--status-danger-ink)]",
    isMachineVerified: false,
  };
}

export function itemMatchesDocumentFilter(
  item: WorkItem,
  documentId: string | null | undefined,
  documents: Document[] = []
): boolean {
  if (!documentId || documentId === "ALL") return true;
  if (item.document_id === documentId) return true;
  const targetDoc = documents.find((d) => d.id === documentId);
  for (const cit of item.verified_citations ?? []) {
    if (cit.locator?.doc_id === documentId) return true;
    if (targetDoc && cit.document_filename === targetDoc.filename) return true;
  }
  const tc = item.temporal_conflict;
  if (tc && (tc.newer_doc_id === documentId || tc.older_doc_id === documentId)) {
    return true;
  }
  return false;
}

export function itemMatchesLatestFilter(item: WorkItem, documents: Document[]): boolean {
  if (item.item_type === "TEMPORAL_CONFLICT") return true;
  const supersededIds = new Set(documents.filter((d) => !d.is_latest_version).map((d) => d.id));
  const supersededNames = new Set(
    documents.filter((d) => !d.is_latest_version).map((d) => d.filename)
  );
  if (item.document_id && supersededIds.has(item.document_id)) {
    return false;
  }
  if (item.verified_citations.length > 0) {
    const allSuperseded = item.verified_citations.every(
      (c) =>
        (c.locator?.doc_id ? supersededIds.has(c.locator.doc_id) : false) ||
        (c.document_filename ? supersededNames.has(c.document_filename) : false)
    );
    if (allSuperseded) return false;
  }
  return true;
}

export function filterWorkItemsForScope(options: {
  items: WorkItem[];
  documents: Document[];
  documentId?: string | null;
  onlyCritical?: boolean;
  latestOnly?: boolean;
}): WorkItem[] {
  const {
    items,
    documents,
    documentId = null,
    onlyCritical = false,
    latestOnly = false,
  } = options;
  return items.filter((item) => {
    if (documentId && documentId !== "ALL" && !itemMatchesDocumentFilter(item, documentId, documents)) {
      return false;
    }
    if (latestOnly && !itemMatchesLatestFilter(item, documents)) {
      return false;
    }
    if (onlyCritical && item.priority_tier !== "P0_CRITICAL") {
      return false;
    }
    return true;
  });
}

export function formatExportReviewWarning(item: WorkItem): string {
  const status = item.verification_status;
  const weak = Boolean(item.weak_evidence || item.gate_telemetry?.weak_evidence);
  const weakReason = item.weak_evidence_reason || item.gate_telemetry?.weak_evidence_reason;
  if (status === "INSUFFICIENT_EVIDENCE") {
    return "UNRESOLVED / INSUFFICIENT_EVIDENCE: Missing verified corpus proof — manual review required";
  }
  if (status === "NEEDS_HUMAN_VERIFICATION") {
    const suffix = weak && weakReason ? ` (${weakReason})` : "";
    return `UNRESOLVED / NEEDS_HUMAN_VERIFICATION: Requires reviewer verification${suffix}`;
  }
  if (status === "ESCALATED_LEGAL") {
    return `ESCALATED_LEGAL: Referred to ${item.escalation_assignee || "Legal Counsel"} — unresolved`;
  }
  if (status === "HUMAN_OVERRIDE") {
    return "HUMAN_OVERRIDE: Manually overridden by reviewer (unverified by deterministic gate)";
  }
  if (status === "NOT_APPLICABLE") {
    return "NOT_APPLICABLE: Marked N/A by reviewer (original priority preserved)";
  }
  if (weak) {
    return `WEAK_EVIDENCE: ${weakReason || "Flagged for weak supporting quote"}`;
  }
  return "";
}

export interface XlsxExportRow {
  "Original_Priority": string;
  "Effective_Priority": string;
  "Priority Tier": string;
  Category: string;
  "Question or Clause": string;
  AI_Response: string;
  AI_Status: string;
  Review_Warning: string;
  Reason_Code: string;
  Reviewer_Note: string;
  Escalation_Assignee: string;
  Escalation_Reason: string;
  Weak_Evidence: string;
  "Verbatim Quote (Ranger)": string;
  "Match Score %": number | string;
  "Source Document": string;
  "Page / Row": string | number;
}

export function buildXlsxExportRows(items: WorkItem[], documents: Document[] = []): XlsxExportRow[] {
  const docById = new Map(documents.map((d) => [d.id, d]));
  return items.map((item) => {
    const originalPriority = item.original_priority_tier || item.priority_tier;
    const isWeak = Boolean(item.weak_evidence || item.gate_telemetry?.weak_evidence);
    const weakReason = (item.weak_evidence_reason || item.gate_telemetry?.weak_evidence_reason || "").trim();
    const weakText = isWeak ? (weakReason ? `YES: ${weakReason}` : "YES") : "NO";
    const status = item.verification_status;
    const reasonCode =
      item.human_override_reason_code ||
      (status === "ESCALATED_LEGAL" || status === "NOT_APPLICABLE"
        ? item.escalation_reason || ""
        : "");
    const sourceDoc =
      item.verified_citations[0]?.document_filename ||
      (item.document_id ? docById.get(item.document_id)?.filename : undefined) ||
      "Corpus";

    return {
      Original_Priority: originalPriority,
      Effective_Priority: item.priority_tier,
      "Priority Tier": originalPriority,
      Category: item.category,
      "Question or Clause": item.prompt_or_question,
      AI_Response: item.fluent_output,
      AI_Status: status,
      Review_Warning: formatExportReviewWarning(item),
      Reason_Code: reasonCode,
      Reviewer_Note: item.escalation_reason ?? "",
      Escalation_Assignee: item.escalation_assignee ?? "",
      Escalation_Reason: item.escalation_reason ?? "",
      Weak_Evidence: weakText,
      "Verbatim Quote (Ranger)":
        item.verified_citations[0]?.quote ||
        item.gate_telemetry?.override_citation_text ||
        "No direct quote (flagged for review)",
      "Match Score %":
        status === "HUMAN_OVERRIDE"
          ? `0 (Unverified override)`
          : item.gate_telemetry.citation_match,
      "Source Document": sourceDoc,
      "Page / Row": item.verified_citations[0]?.page_number ?? "N/A",
    };
  });
}

export function formatExportWarningLines(metrics: WorkItemMetrics): string[] {
  const lines: string[] = [];
  if (metrics.unresolved > 0) {
    lines.push(`${metrics.unresolved} unresolved item(s) still awaiting evidence or triage`);
  }
  if (metrics.escalatedLegal > 0) {
    lines.push(`${metrics.escalatedLegal} item(s) escalated to Legal Counsel`);
  }
  if (metrics.humanOverride > 0) {
    lines.push(
      `${metrics.humanOverride} manual Human Override answer(s) (unverified by deterministic gate)`
    );
  }
  if (metrics.notApplicable > 0) {
    lines.push(`${metrics.notApplicable} item(s) marked Not Applicable (N/A)`);
  }
  if (metrics.weakEvidenceCount > 0) {
    lines.push(`${metrics.weakEvidenceCount} item(s) flagged with Weak Evidence quotes`);
  }
  return lines;
}
