import type {
  Document,
  Escalation,
  PriorityTier,
  VerificationStatus,
  WorkItem,
} from "../types/bert";
import { itemMatchesDocumentFilter } from "./workItemMetrics";

export type TriageFilterTab = "pending" | "escalated_legal" | "resolved" | "all";

export type AcceptActionKind = "rescue" | "machine" | null;
export type AcceptActionLabel =
  | "Accept Vision Rescue Text"
  | "Accept Extracted Evidence"
  | null;

export interface AcceptActionState {
  visible: boolean;
  label: AcceptActionLabel;
  kind: AcceptActionKind;
}

export type TriageInlineAction = "override" | "legal" | "na";

export type TriageKeyCommand =
  | "next"
  | "prev"
  | "accept"
  | "override"
  | "legal"
  | "na"
  | "confirm"
  | "cancel";

export const TRIAGE_ACTION_LABELS = {
  override: "Override",
  legal: "Flag for Legal",
  na: "N/A",
} as const;

export const TRIAGE_SHORTCUT_LEGEND: ReadonlyArray<{ key: string; label: string }> = [
  { key: "J/K", label: "Next/Prev" },
  { key: "A", label: "Accept" },
  { key: "O", label: "Override" },
  { key: "L", label: "Flag Legal" },
  { key: "N", label: "N/A" },
  { key: "Enter", label: "Confirm" },
];

const PRIORITY_RANK: Record<PriorityTier, number> = {
  P0_CRITICAL: 0,
  P1_HIGH: 1,
  P2_MEDIUM: 2,
  P3_LOW: 3,
};

export function priorityTierRank(tier: PriorityTier | string | null | undefined): number {
  if (tier && tier in PRIORITY_RANK) {
    return PRIORITY_RANK[tier as PriorityTier];
  }
  return 99;
}

export function isPendingTriageStatus(status: VerificationStatus | string): boolean {
  return status === "NEEDS_HUMAN_VERIFICATION" || status === "INSUFFICIENT_EVIDENCE";
}

export function isLegalTriageStatus(status: VerificationStatus | string): boolean {
  return status === "ESCALATED_LEGAL";
}

export function isResolvedTriageStatus(status: VerificationStatus | string): boolean {
  return (
    status === "VERIFIED" ||
    status === "HUMAN_OVERRIDE" ||
    status === "NOT_APPLICABLE"
  );
}

export function matchesTriageTab(
  item: Pick<WorkItem, "verification_status">,
  tab: TriageFilterTab
): boolean {
  switch (tab) {
    case "pending":
      return isPendingTriageStatus(item.verification_status);
    case "escalated_legal":
      return isLegalTriageStatus(item.verification_status);
    case "resolved":
      return isResolvedTriageStatus(item.verification_status);
    case "all":
      return true;
  }
}

/**
 * Deterministic priority ordering:
 * P0_CRITICAL -> P1_HIGH -> P2_MEDIUM -> P3_LOW, then priority_score DESC, then created_at ASC.
 */
export function sortTriageQueue<
  T extends Pick<WorkItem, "priority_tier" | "priority_score" | "created_at" | "id">
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rankDiff = priorityTierRank(a.priority_tier) - priorityTierRank(b.priority_tier);
    if (rankDiff !== 0) return rankDiff;

    const scoreDiff = (b.priority_score ?? 0) - (a.priority_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;

    const timeA = Date.parse(a.created_at || "") || 0;
    const timeB = Date.parse(b.created_at || "") || 0;
    if (timeA !== timeB) return timeA - timeB;

    return a.id.localeCompare(b.id);
  });
}

export function filterTriageQueue(
  items: WorkItem[],
  tab: TriageFilterTab,
  options?: {
    documentId?: string | null;
    documents?: Document[];
    searchQuery?: string;
  }
): WorkItem[] {
  const docId = options?.documentId ?? null;
  const documents = options?.documents ?? [];
  const query = options?.searchQuery?.trim().toLowerCase() ?? "";

  const filtered = items.filter((item) => {
    if (!matchesTriageTab(item, tab)) return false;
    if (docId && docId !== "ALL" && !itemMatchesDocumentFilter(item, docId, documents)) {
      return false;
    }
    if (query) {
      const haystack = [
        item.prompt_or_question,
        item.fluent_output,
        item.category,
        item.verification_status,
        item.priority_tier,
        item.machine_extracted_text ?? "",
        item.vision_rescue_text ?? "",
        item.escalation_reason ?? "",
        item.human_override_reason_code ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return sortTriageQueue(filtered);
}

export function getTriageTabCounts(items: WorkItem[]): Record<TriageFilterTab, number> {
  let pending = 0;
  let escalated_legal = 0;
  let resolved = 0;
  for (const item of items) {
    if (isPendingTriageStatus(item.verification_status)) pending += 1;
    else if (isLegalTriageStatus(item.verification_status)) escalated_legal += 1;
    else if (isResolvedTriageStatus(item.verification_status)) resolved += 1;
  }
  return {
    pending,
    escalated_legal,
    resolved,
    all: items.length,
  };
}

function isNonEmptyEvidenceText(text: string | null | undefined): boolean {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return false;
  if (/^insufficient evidence\b/i.test(trimmed)) return false;
  if (/^\[unanswered\b/i.test(trimmed)) return false;
  return true;
}

/**
 * Single source of truth for whether an item can show an Accept button and which label it gets.
 * - Hidden (`visible: false`) when neither machine_extracted_text nor vision_rescue_text exists.
 * - `"Accept Vision Rescue Text"` ONLY when `has_vision_rescue === true` and `vision_rescue_text` is non-empty.
 * - `"Accept Extracted Evidence"` when `machine_extracted_text` is non-empty (and not vision rescue).
 */
export function getAcceptActionState(
  item:
    | Pick<WorkItem, "has_vision_rescue" | "vision_rescue_text" | "machine_extracted_text">
    | Pick<Escalation, "has_vision_rescue" | "vision_rescue_text" | "machine_extracted_text">
    | null
    | undefined
): AcceptActionState {
  if (!item) {
    return { visible: false, label: null, kind: null };
  }

  const hasRescueText = isNonEmptyEvidenceText(item.vision_rescue_text);
  const hasMachineText = isNonEmptyEvidenceText(item.machine_extracted_text);

  if (item.has_vision_rescue === true && hasRescueText) {
    return {
      visible: true,
      label: "Accept Vision Rescue Text",
      kind: "rescue",
    };
  }

  if (hasMachineText) {
    return {
      visible: true,
      label: "Accept Extracted Evidence",
      kind: "machine",
    };
  }

  return {
    visible: false,
    label: null,
    kind: null,
  };
}

/**
 * Enforces the evidence-visibility gate: Accept remains disabled until the item's
 * evidence card has been confirmed visible in the left pane.
 */
export function canAcceptWithEvidence(
  item: WorkItem | null | undefined,
  evidenceVisibleMap: Record<string, boolean>
): boolean {
  if (!item) return false;
  if (item.verification_status === "VERIFIED") return false;
  const acceptState = getAcceptActionState(item);
  if (!acceptState.visible) return false;
  return Boolean(evidenceVisibleMap[item.id]);
}

export function getBulkAcceptEligibleIds(items: WorkItem[]): string[] {
  return items
    .filter(
      (item) =>
        item.verification_status !== "VERIFIED" && getAcceptActionState(item).visible
    )
    .map((item) => item.id);
}

export function getItemEvidenceQuote(item: WorkItem): string {
  const citQuote = item.verified_citations?.[0]?.quote?.trim();
  if (citQuote) return citQuote;
  const factQuote = item.structured_facts?.[0]?.verbatim_quote?.trim();
  if (factQuote) return factQuote;
  if (item.has_vision_rescue && isNonEmptyEvidenceText(item.vision_rescue_text)) {
    return item.vision_rescue_text!.trim();
  }
  if (isNonEmptyEvidenceText(item.machine_extracted_text)) {
    return item.machine_extracted_text!.trim();
  }
  return "";
}

export function isEditableEventTarget(
  targetTagName: string | null | undefined,
  isContentEditable = false
): boolean {
  if (isContentEditable) return true;
  const tag = (targetTagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function mapTriageKeyToCommand(params: {
  key: string;
  targetTagName?: string | null;
  isContentEditable?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  hasActiveForm?: boolean;
  canAccept?: boolean;
}): TriageKeyCommand | null {
  if (params.ctrlKey || params.metaKey || params.altKey) return null;
  if (isEditableEventTarget(params.targetTagName, params.isContentEditable)) {
    return null;
  }

  const normalized = params.key.toLowerCase();
  switch (normalized) {
    case "j":
    case "arrowdown":
      return "next";
    case "k":
    case "arrowup":
      return "prev";
    case "a":
      return params.canAccept ? "accept" : null;
    case "o":
      return "override";
    case "l":
      return "legal";
    case "n":
      return "na";
    case "enter":
      return params.hasActiveForm ? "confirm" : null;
    case "escape":
      return params.hasActiveForm ? "cancel" : null;
    default:
      return null;
  }
}
