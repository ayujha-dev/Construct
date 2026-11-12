import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileSearch,
  Keyboard,
  RotateCcw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EvidenceLocatorBadge } from "../components/copilot/EvidenceLocatorBadge";
import { TriageToast } from "../components/triage/TriageToast";
import {
  deriveNodeLocator,
  resolveCitationDocument,
} from "../lib/evidenceLocators";
import {
  canAcceptWithEvidence,
  filterTriageQueue,
  getAcceptActionState,
  getBulkAcceptEligibleIds,
  getItemEvidenceQuote,
  getTriageTabCounts,
  mapTriageKeyToCommand,
  TRIAGE_ACTION_LABELS,
  TRIAGE_SHORTCUT_LEGEND,
  type TriageFilterTab,
  type TriageInlineAction,
} from "../lib/triageQueue";
import {
  computeWorkItemMetrics,
  getMatchBadgeTone,
  MANUAL_OVERRIDE_REASON_CODES,
  NOT_APPLICABLE_REASON_CODES,
  validateManualOverrideInput,
  validateNotApplicableInput,
} from "../lib/workItemMetrics";
import { useBertStore } from "../store/useBertStore";
import type { WorkItem } from "../types/bert";

const TAB_DEFS: Array<{ id: TriageFilterTab; label: string }> = [
  { id: "pending", label: "Needs Review" },
  { id: "escalated_legal", label: "Legal" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

function parseTabParam(raw: string | null): TriageFilterTab {
  if (raw === "escalated_legal" || raw === "resolved" || raw === "all" || raw === "pending") {
    return raw;
  }
  return "pending";
}

function priorityBadgeStyle(tier: string): string {
  if (tier === "P0_CRITICAL") {
    return "bg-[var(--status-danger-solid)] text-white border-[var(--status-danger-solid)]";
  }
  if (tier === "P1_HIGH") {
    return "bg-[var(--status-warning-solid)] text-white border-[var(--status-warning-solid)]";
  }
  if (tier === "P2_MEDIUM") {
    return "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] border-[var(--accent-brand)]";
  }
  return "bg-[var(--status-neutral-solid)] text-white border-[var(--status-neutral-solid)]";
}

function statusBadgeStyle(status: string): string {
  if (status === "VERIFIED") {
    return "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]";
  }
  if (status === "HUMAN_OVERRIDE") {
    return "bg-[var(--status-override-soft)] text-[var(--status-override-ink)] border-[var(--status-override-border)]";
  }
  if (status === "ESCALATED_LEGAL") {
    return "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]";
  }
  if (status === "NOT_APPLICABLE") {
    return "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]";
  }
  return "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "VERIFIED") return <ShieldCheck size={11} aria-hidden="true" />;
  if (status === "HUMAN_OVERRIDE") return <Sparkles size={11} aria-hidden="true" />;
  if (status === "ESCALATED_LEGAL") return <Scale size={11} aria-hidden="true" />;
  if (status === "NOT_APPLICABLE") return <CheckCircle2 size={11} aria-hidden="true" />;
  return <AlertTriangle size={11} aria-hidden="true" />;
}

export function TriagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    documents,
    nodesByDocument,
    workItems,
    workItemUndoSnapshots,
    selectedFileFilterId,
    loadNodes,
    resolveWorkItem,
    batchResolve,
    undoWorkItem,
    inspectCitation,
  } = useBertStore();

  const initialTab = parseTabParam(searchParams.get("filter"));
  const initialDoc = searchParams.get("doc") || selectedFileFilterId || "ALL";
  const requestedItemId = searchParams.get("item");

  const [activeTab, setActiveTab] = useState<TriageFilterTab>(initialTab);
  const [docFilter, setDocFilter] = useState<string>(initialDoc);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(requestedItemId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [evidenceVisibleMap, setEvidenceVisibleMap] = useState<Record<string, boolean>>({});

  // Single-item inline action state
  const [activeForm, setActiveForm] = useState<TriageInlineAction | null>(null);
  const [overrideReasonCode, setOverrideReasonCode] = useState<string>(
    MANUAL_OVERRIDE_REASON_CODES[0].value
  );
  const [overrideAnswer, setOverrideAnswer] = useState("");
  const [overrideCitation, setOverrideCitation] = useState("");
  const [overrideNoEvidence, setOverrideNoEvidence] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const [legalAssignee, setLegalAssignee] = useState("Legal Counsel");
  const [legalReason, setLegalReason] = useState("Flagged for Legal Review.");

  const [naReasonCode, setNaReasonCode] = useState("");
  const [naNote, setNaNote] = useState("");
  const [naError, setNaError] = useState<string | null>(null);

  // Bulk inline action state
  const [bulkPanel, setBulkPanel] = useState<"legal" | "na" | null>(null);
  const [bulkLegalAssignee, setBulkLegalAssignee] = useState("Legal Counsel");
  const [bulkLegalReason, setBulkLegalReason] = useState("Bulk flagged for Legal Counsel review.");
  const [bulkNaReasonCode, setBulkNaReasonCode] = useState("");
  const [bulkNaNote, setBulkNaNote] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const evidenceCardRef = useRef<HTMLDivElement>(null);
  const queueItemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Sync URL ?filter= / ?item= when navigated to via links
  useEffect(() => {
    const paramFilter = searchParams.get("filter");
    if (paramFilter) {
      setActiveTab(parseTabParam(paramFilter));
    }
    const paramItem = searchParams.get("item");
    if (paramItem) {
      setActiveItemId(paramItem);
    }
  }, [searchParams]);

  const docScopedItems = useMemo(() => {
    if (!docFilter || docFilter === "ALL") return workItems;
    return filterTriageQueue(workItems, "all", { documentId: docFilter, documents });
  }, [workItems, docFilter, documents]);

  const tabCounts = useMemo(() => getTriageTabCounts(docScopedItems), [docScopedItems]);
  const metrics = useMemo(() => computeWorkItemMetrics(docScopedItems), [docScopedItems]);

  const queueItems = useMemo(
    () =>
      filterTriageQueue(workItems, activeTab, {
        documentId: docFilter,
        documents,
        searchQuery,
      }),
    [workItems, activeTab, docFilter, documents, searchQuery]
  );

  // Keep activeItemId pointing at a valid item in the current queue
  useEffect(() => {
    if (queueItems.length === 0) {
      setActiveItemId(null);
      return;
    }
    if (!activeItemId || !queueItems.some((item) => item.id === activeItemId)) {
      setActiveItemId(queueItems[0].id);
    }
  }, [queueItems, activeItemId]);

  // Clear selections that fell out of the current filtered queue
  useEffect(() => {
    const validSet = new Set(queueItems.map((i) => i.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => validSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [queueItems]);

  const activeItem: WorkItem | null = useMemo(
    () => queueItems.find((item) => item.id === activeItemId) ?? queueItems[0] ?? null,
    [queueItems, activeItemId]
  );

  // Ensure AST nodes are loaded for the focused item's document so locators & AST context always resolve
  useEffect(() => {
    const docId = activeItem?.document_id;
    if (docId && !nodesByDocument[docId]) {
      void loadNodes(docId);
    }
  }, [activeItem?.document_id, nodesByDocument, loadNodes]);

  // Track per-item evidenceVisible using IntersectionObserver on the left-pane evidence card
  useEffect(() => {
    const itemId = activeItem?.id;
    const cardEl = evidenceCardRef.current;
    if (!itemId || !cardEl) return;

    if (leftPaneRef.current) {
      leftPaneRef.current.scrollTop = 0;
    }

    // Reset visibility for newly focused item until observer confirms layout intersection
    setEvidenceVisibleMap((prev) => ({ ...prev, [itemId]: false }));

    if (typeof IntersectionObserver === "undefined") {
      setEvidenceVisibleMap((prev) => ({ ...prev, [itemId]: true }));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting && entry.intersectionRatio > 0;
          setEvidenceVisibleMap((prev) =>
            prev[itemId] === visible ? prev : { ...prev, [itemId]: visible }
          );
        }
      },
      {
        root: leftPaneRef.current,
        threshold: 0.05,
      }
    );
    observer.observe(cardEl);
    return () => observer.disconnect();
  }, [activeItem?.id]);

  // Scroll active queue row into view when navigating via J/K
  useEffect(() => {
    if (!activeItem?.id) return;
    queueItemRefs.current[activeItem.id]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeItem?.id]);

  const selectTab = (tab: TriageFilterTab) => {
    setActiveTab(tab);
    setActiveForm(null);
    const next = new URLSearchParams(searchParams);
    next.set("filter", tab);
    setSearchParams(next, { replace: true });
  };

  const openInlineForm = useCallback(
    (form: TriageInlineAction, item: WorkItem | null) => {
      if (!item) return;
      setActiveForm(form);
      setOverrideError(null);
      setNaError(null);
      if (form === "override") {
        setOverrideAnswer(
          item.fluent_output.includes("Insufficient") ? "" : item.fluent_output
        );
        setOverrideCitation(item.gate_telemetry?.override_citation_text || "");
        setOverrideNoEvidence(Boolean(item.no_evidence_attestation));
      } else if (form === "legal") {
        setLegalAssignee(item.escalation_assignee || "Legal Counsel");
        setLegalReason(item.escalation_reason || "Flagged for Legal Review.");
      } else if (form === "na") {
        setNaReasonCode(item.human_override_reason_code || "");
        setNaNote("");
      }
    },
    []
  );

  const handleAcceptItem = useCallback(
    async (item: WorkItem | null) => {
      if (!item) return;
      if (!canAcceptWithEvidence(item, evidenceVisibleMap)) return;
      const acceptState = getAcceptActionState(item);
      if (!acceptState.visible) return;
      setIsMutating(true);
      try {
        const adoptedText =
          acceptState.kind === "rescue"
            ? item.vision_rescue_text || item.structured_facts[0]?.verbatim_quote || ""
            : item.machine_extracted_text || item.structured_facts[0]?.verbatim_quote || "";
        await resolveWorkItem(item.id, "approve", adoptedText);
        setActiveForm(null);
      } finally {
        setIsMutating(false);
      }
    },
    [evidenceVisibleMap, resolveWorkItem]
  );

  const handleConfirmOverride = useCallback(async () => {
    if (!activeItem) return;
    const hasExistingLocator = Boolean(
      activeItem.verified_citations?.some((c) => Boolean(c.locator || c.bounding_box || c.quote))
    );
    const check = validateManualOverrideInput({
      reasonCode: overrideReasonCode,
      correction: overrideAnswer,
      overrideCitationText: overrideCitation,
      noEvidenceAttestation: overrideNoEvidence,
      hasExistingLocator,
    });
    if (!check.valid) {
      setOverrideError(check.message || "Invalid manual override submission.");
      return;
    }
    setOverrideError(null);
    setIsMutating(true);
    try {
      await resolveWorkItem(activeItem.id, {
        action: "manual_correction",
        reason_code: overrideReasonCode,
        correction: overrideAnswer.trim(),
        override_citation_text: overrideCitation.trim() || null,
        no_evidence_attestation: overrideNoEvidence,
      });
      setActiveForm(null);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : "Failed to save override.");
    } finally {
      setIsMutating(false);
    }
  }, [
    activeItem,
    overrideAnswer,
    overrideCitation,
    overrideNoEvidence,
    overrideReasonCode,
    resolveWorkItem,
  ]);

  const handleConfirmLegal = useCallback(async () => {
    if (!activeItem) return;
    setIsMutating(true);
    try {
      await resolveWorkItem(activeItem.id, {
        action: "counsel",
        assignee: legalAssignee.trim() || "Legal Counsel",
        note: legalReason.trim() || "Flagged for Legal Review.",
      });
      setActiveForm(null);
    } finally {
      setIsMutating(false);
    }
  }, [activeItem, legalAssignee, legalReason, resolveWorkItem]);

  const handleConfirmNa = useCallback(async () => {
    if (!activeItem) return;
    const check = validateNotApplicableInput({
      reasonCode: naReasonCode,
      note: naNote,
    });
    if (!check.valid) {
      setNaError(check.message || "Provide a reason before marking N/A.");
      return;
    }
    setNaError(null);
    setIsMutating(true);
    try {
      await resolveWorkItem(activeItem.id, {
        action: "skip",
        reason_code: naReasonCode || undefined,
        note: naNote.trim() || undefined,
      });
      setActiveForm(null);
    } catch (err) {
      setNaError(err instanceof Error ? err.message : "Failed to mark N/A.");
    } finally {
      setIsMutating(false);
    }
  }, [activeItem, naNote, naReasonCode, resolveWorkItem]);

  const handleConfirmActiveForm = useCallback(() => {
    if (activeForm === "override") void handleConfirmOverride();
    else if (activeForm === "legal") void handleConfirmLegal();
    else if (activeForm === "na") void handleConfirmNa();
  }, [activeForm, handleConfirmLegal, handleConfirmNa, handleConfirmOverride]);

  // Keyboard shortcuts: J/K, A, O, L, N, Enter, Escape (ignored inside input/textarea/select)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const canAccept = canAcceptWithEvidence(activeItem, evidenceVisibleMap);
      const command = mapTriageKeyToCommand({
        key: e.key,
        targetTagName: target?.tagName ?? null,
        isContentEditable: Boolean(target?.isContentEditable),
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        hasActiveForm: activeForm !== null,
        canAccept,
      });
      if (!command) return;
      e.preventDefault();

      if (command === "next" && queueItems.length > 0) {
        const idx = queueItems.findIndex((i) => i.id === activeItem?.id);
        const nextIdx = idx < 0 ? 0 : Math.min(queueItems.length - 1, idx + 1);
        setActiveItemId(queueItems[nextIdx].id);
        setActiveForm(null);
      } else if (command === "prev" && queueItems.length > 0) {
        const idx = queueItems.findIndex((i) => i.id === activeItem?.id);
        const prevIdx = idx <= 0 ? 0 : idx - 1;
        setActiveItemId(queueItems[prevIdx].id);
        setActiveForm(null);
      } else if (command === "accept") {
        void handleAcceptItem(activeItem);
      } else if (command === "override") {
        openInlineForm("override", activeItem);
      } else if (command === "legal") {
        openInlineForm("legal", activeItem);
      } else if (command === "na") {
        openInlineForm("na", activeItem);
      } else if (command === "confirm") {
        handleConfirmActiveForm();
      } else if (command === "cancel") {
        setActiveForm(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeForm,
    activeItem,
    evidenceVisibleMap,
    handleAcceptItem,
    handleConfirmActiveForm,
    openInlineForm,
    queueItems,
  ]);

  // Multi-select & bulk action handlers
  const selectedQueueItems = useMemo(
    () => queueItems.filter((item) => selectedIds.includes(item.id)),
    [queueItems, selectedIds]
  );
  const bulkAcceptEligibleIds = useMemo(
    () => getBulkAcceptEligibleIds(selectedQueueItems),
    [selectedQueueItems]
  );
  const allSelected =
    queueItems.length > 0 && queueItems.every((item) => selectedIds.includes(item.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(queueItems.map((i) => i.id));
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkAccept = async () => {
    if (bulkAcceptEligibleIds.length === 0) return;
    setBulkError(null);
    setIsMutating(true);
    try {
      await batchResolve(bulkAcceptEligibleIds, {
        action: "approve",
        note: "Bulk accepted verified machine/vision rescue evidence.",
      });
      setSelectedIds([]);
      setBulkPanel(null);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk accept failed.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleBulkLegalConfirm = async () => {
    if (selectedIds.length === 0) return;
    setBulkError(null);
    setIsMutating(true);
    try {
      await batchResolve(selectedIds, {
        action: "counsel",
        assignee: bulkLegalAssignee.trim() || "Legal Counsel",
        note: bulkLegalReason.trim() || "Bulk flagged for Legal Counsel review.",
      });
      setSelectedIds([]);
      setBulkPanel(null);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk legal flag failed.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleBulkNaConfirm = async () => {
    if (selectedIds.length === 0) return;
    const check = validateNotApplicableInput({
      reasonCode: bulkNaReasonCode,
      note: bulkNaNote,
    });
    if (!check.valid) {
      setBulkError(check.message || "Provide a reason before bulk marking N/A.");
      return;
    }
    setBulkError(null);
    setIsMutating(true);
    try {
      await batchResolve(selectedIds, {
        action: "skip",
        reason_code: bulkNaReasonCode || undefined,
        note: bulkNaNote.trim() || undefined,
      });
      setSelectedIds([]);
      setBulkPanel(null);
      setBulkNaReasonCode("");
      setBulkNaNote("");
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk mark N/A failed.");
    } finally {
      setIsMutating(false);
    }
  };

  // Resolve evidence & AST metadata for activeItem
  const activeEvidenceMeta = useMemo(() => {
    if (!activeItem) return null;
    const citation = activeItem.verified_citations[0] ?? null;
    const citDoc = resolveCitationDocument(documents, {
      locator: citation?.locator,
      documentFilename: citation?.document_filename,
      fallbackDocumentId: activeItem.document_id,
    });
    const matchedNode = citDoc
      ? nodesByDocument[citDoc.id]?.find((n) => n.id === citation?.ast_node_id) ??
        nodesByDocument[citDoc.id]?.find(
          (n) => n.id === activeItem.structured_facts[0]?.ast_node_id
        )
      : undefined;
    const resolvedLocator = citation?.locator ?? deriveNodeLocator(matchedNode, citDoc);
    const quote = getItemEvidenceQuote(activeItem);
    const inspectableCitation =
      citation ??
      (resolvedLocator
        ? {
            quote: quote || matchedNode?.verbatim_text || "",
            ast_node_id:
              matchedNode?.id || activeItem.structured_facts[0]?.ast_node_id || activeItem.id,
            page_number:
              matchedNode?.page_number ??
              ("page" in resolvedLocator && typeof resolvedLocator.page === "number"
                ? resolvedLocator.page
                : 1),
            document_filename: citDoc?.filename || "",
            bounding_box: matchedNode?.bounding_box ?? null,
            locator: resolvedLocator,
            confidence_score: activeItem.gate_telemetry?.citation_match ?? 0,
            region_match_score: activeItem.gate_telemetry?.citation_match ?? 0,
          }
        : null);
    const acceptState = getAcceptActionState(activeItem);
    const evidenceVisible = Boolean(evidenceVisibleMap[activeItem.id]);
    const acceptEnabled = canAcceptWithEvidence(activeItem, evidenceVisibleMap);
    const matchTone = getMatchBadgeTone(
      activeItem.gate_telemetry?.citation_match ?? 0,
      activeItem.verification_status,
      activeItem.weak_evidence
    );
    const canUndo = Boolean(activeItem.can_undo || workItemUndoSnapshots[activeItem.id]);

    return {
      citation: inspectableCitation,
      citDoc,
      matchedNode,
      resolvedLocator,
      quote,
      acceptState,
      evidenceVisible,
      acceptEnabled,
      matchTone,
      canUndo,
    };
  }, [activeItem, documents, nodesByDocument, evidenceVisibleMap, workItemUndoSnapshots]);

  return (
    <div
      data-testid="triage-page"
      className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]"
    >
      {/* Top Header Bar */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--status-danger-solid)] text-white flex items-center justify-center shrink-0">
              <ShieldAlert size={16} />
            </div>
            <div>
              <h1 className="font-serif text-lg sm:text-xl font-semibold text-[var(--text-primary)] tracking-tight leading-tight">
                HITL Triage Queue
              </h1>
              <p className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                Evidence-first priority review · P0 Critical → P3 Low
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border border-[var(--status-danger-border)] font-semibold">
              <AlertTriangle size={11} aria-hidden="true" />
              <span>{tabCounts.pending} Needs Review</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)] font-semibold">
              <Scale size={11} aria-hidden="true" />
              <span>{tabCounts.escalated_legal} Legal</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)] font-semibold">
              <ShieldCheck size={11} aria-hidden="true" />
              <span>{metrics.defensibilityScore ?? 0}% Defensibility</span>
            </span>
          </div>
        </div>

        {/* Keyboard Legend + Document Filter + Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            data-testid="triage-shortcut-legend"
            className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)]"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={12} className="text-[var(--text-secondary)] shrink-0" />
            {TRIAGE_SHORTCUT_LEGEND.map((sc) => (
              <span key={sc.key} className="inline-flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] font-bold">
                  {sc.key}
                </kbd>
                <span>{sc.label}</span>
              </span>
            ))}
          </div>

          <select
            aria-label="Filter triage queue by document"
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <option value="ALL">All Documents ({documents.length})</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.filename}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-[var(--text-muted)]" />
            <input
              type="text"
              aria-label="Search triage queue"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter items..."
              className="pl-8 pr-3 py-1 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] w-44"
            />
          </div>

          <Link
            to="/workspace"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)] text-xs font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <span>Workspace</span>
            <ArrowRight size={12} />
          </Link>
        </div>
      </header>

      {/* Undo Toast Banner */}
      <div className="px-4 sm:px-6 pt-3 shrink-0">
        <TriageToast />
      </div>

      {/* Main Two-Pane Workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 sm:p-6 overflow-hidden">
        {/* LEFT PANE: Full Evidence First */}
        <section
          ref={leftPaneRef}
          data-testid="triage-evidence-pane"
          aria-label="Evidence inspection pane"
          className="lg:col-span-6 h-full min-h-0 overflow-y-auto space-y-4 pr-1"
        >
          {!activeItem || !activeEvidenceMeta ? (
            <div className="p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center space-y-2">
              <CheckCircle2 size={24} className="mx-auto text-[var(--status-verified-ink)]" />
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                No items in “{TAB_DEFS.find((t) => t.id === activeTab)?.label}”
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Switch filter tabs on the right to review Legal escalations, Resolved decisions, or All items.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Evidence Card (Observed for evidenceVisible gate) */}
              <div
                ref={evidenceCardRef}
                data-testid="triage-evidence-card"
                data-item-id={activeItem.id}
                data-evidence-visible={String(activeEvidenceMeta.evidenceVisible)}
                className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm space-y-4"
              >
                {/* Priority + Status + Match % Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      data-testid="triage-evidence-priority"
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border tabular-nums ${priorityBadgeStyle(
                        activeItem.priority_tier
                      )}`}
                    >
                      {activeItem.priority_tier} · {activeItem.priority_score}
                    </span>
                    <span
                      data-testid="triage-evidence-status"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${statusBadgeStyle(
                        activeItem.verification_status
                      )}`}
                    >
                      <StatusIcon status={activeItem.verification_status} />
                      <span>{activeItem.verification_status}</span>
                    </span>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      {activeItem.category}
                    </span>
                  </div>

                  <span
                    data-testid="triage-evidence-match"
                    className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold border tabular-nums ${activeEvidenceMeta.matchTone.badgeClass}`}
                  >
                    {activeEvidenceMeta.matchTone.label}
                  </span>
                </div>

                {/* Question / Clause */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Question / Clause
                  </div>
                  <h2 className="font-serif text-lg font-semibold text-[var(--text-primary)] leading-snug">
                    {activeItem.prompt_or_question}
                  </h2>
                </div>

                {/* Weak Evidence Alert */}
                {activeItem.weak_evidence && (
                  <div
                    role="alert"
                    data-testid="triage-weak-evidence-alert"
                    className="p-3 rounded-xl bg-[var(--status-warning-soft)] border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] text-xs flex items-start gap-2"
                  >
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Weak Evidence Alert</div>
                      <div>
                        {activeItem.weak_evidence_reason ||
                          "Supporting quote failed specificity checks — verify full source context before resolving."}
                      </div>
                    </div>
                  </div>
                )}

                {/* Clickable Source Locator & Chip */}
                <div className="p-3 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                      Source Locator & Region
                    </span>
                    {activeEvidenceMeta.citation && (
                      <button
                        type="button"
                        data-testid="triage-inspect-locator-btn"
                        onClick={() => {
                          const cit = activeEvidenceMeta.citation!;
                          inspectCitation({
                            ...cit,
                            document_filename:
                              cit.document_filename || activeEvidenceMeta.citDoc?.filename || "",
                            locator: activeEvidenceMeta.resolvedLocator,
                            bounding_box:
                              cit.bounding_box ??
                              activeEvidenceMeta.matchedNode?.bounding_box ??
                              null,
                            confidence_score: activeItem.gate_telemetry?.citation_match ?? 0,
                          });
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-brand-ink)] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                      >
                        <FileSearch size={13} />
                        <span>Inspect in Source Viewer →</span>
                      </button>
                    )}
                  </div>

                  {activeEvidenceMeta.citation ? (
                    <button
                      type="button"
                      data-testid="triage-locator-chip-btn"
                      onClick={() => {
                        const cit = activeEvidenceMeta.citation!;
                        inspectCitation({
                          ...cit,
                          document_filename:
                            cit.document_filename || activeEvidenceMeta.citDoc?.filename || "",
                          locator: activeEvidenceMeta.resolvedLocator,
                          bounding_box:
                            cit.bounding_box ??
                            activeEvidenceMeta.matchedNode?.bounding_box ??
                            null,
                          confidence_score: activeItem.gate_telemetry?.citation_match ?? 0,
                        });
                      }}
                      className="inline-flex flex-wrap items-center gap-2 text-left cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                    >
                      <EvidenceLocatorBadge
                        locator={activeEvidenceMeta.resolvedLocator}
                        document={activeEvidenceMeta.citDoc}
                        fallbackPage={activeEvidenceMeta.citation.page_number}
                        fallbackBbox={
                          activeEvidenceMeta.citation.bounding_box ??
                          activeEvidenceMeta.matchedNode?.bounding_box
                        }
                        regionMatchScore={activeEvidenceMeta.citation.region_match_score}
                        context={`triage:${activeItem.id}`}
                      />
                      {activeEvidenceMeta.citDoc?.filename && (
                        <span className="text-[11px] font-medium text-[var(--text-primary)]">
                          {activeEvidenceMeta.citDoc.filename}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div
                      data-testid="triage-missing-proof-locator"
                      className="text-xs font-mono text-[var(--status-danger-ink)] font-semibold"
                    >
                      No source locator stored — missing corpus proof
                    </div>
                  )}
                </div>

                {/* Exact Verbatim Quote */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                    Exact Verbatim Quote
                  </div>
                  {activeEvidenceMeta.quote ? (
                    <blockquote
                      data-testid="triage-exact-quote"
                      className="p-3 rounded-xl bg-[var(--accent-brand-soft)] border border-[var(--accent-brand-border)] text-sm font-serif italic text-[var(--text-primary)] leading-relaxed"
                    >
                      “{activeEvidenceMeta.quote}”
                    </blockquote>
                  ) : (
                    <div
                      data-testid="triage-no-quote"
                      className="p-3 rounded-xl bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-xs text-[var(--status-danger-ink)] font-medium"
                    >
                      No verbatim quote extracted from corpus.
                    </div>
                  )}
                </div>

                {/* Machine-Extracted vs Vision Rescue Text */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                    {activeItem.has_vision_rescue && activeItem.vision_rescue_text
                      ? "Vision Rescue Text (Low-OCR Scan)"
                      : "Machine-Extracted Evidence"}
                  </div>
                  {activeItem.has_vision_rescue && activeItem.vision_rescue_text ? (
                    <div
                      data-testid="triage-vision-rescue-text"
                      className="p-3 rounded-xl bg-[var(--status-warning-soft)] border border-[var(--status-warning-border)] text-xs text-[var(--status-warning-ink)] space-y-1"
                    >
                      <div className="inline-flex items-center gap-1 font-mono text-[10px] font-bold">
                        <Sparkles size={11} />
                        <span>SCOUT VISION RESCUE TRANSCRIPTION</span>
                      </div>
                      <p className="font-serif text-sm text-[var(--text-primary)] leading-relaxed">
                        {activeItem.vision_rescue_text}
                      </p>
                    </div>
                  ) : activeItem.machine_extracted_text ? (
                    <div
                      data-testid="triage-machine-extracted-text"
                      className="p-3 rounded-xl bg-[var(--status-verified-row)] border border-[var(--status-verified-border)] text-sm text-[var(--text-primary)] font-serif leading-relaxed"
                    >
                      {activeItem.machine_extracted_text}
                    </div>
                  ) : (
                    <div
                      data-testid="triage-no-machine-text"
                      className="p-3 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]"
                    >
                      No machine-extracted or vision rescue evidence exists — choose Override, Flag for Legal, or N/A.
                    </div>
                  )}
                </div>

                {/* AST Context & Temporal Conflict */}
                <div className="p-3 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] space-y-1.5 text-xs">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                    AST & Gate Context
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[var(--text-secondary)] tabular-nums">
                    <div>
                      Node Type:{" "}
                      <strong className="text-[var(--text-primary)]">
                        {activeEvidenceMeta.matchedNode?.node_type ?? activeItem.item_type}
                      </strong>
                    </div>
                    <div>
                      OCR Conf:{" "}
                      <strong className="text-[var(--text-primary)]">
                        {activeEvidenceMeta.matchedNode
                          ? `${Math.round(activeEvidenceMeta.matchedNode.ocr_confidence * 100)}%`
                          : `${Math.round((activeItem.gate_telemetry?.critical_logprob ?? 0) * 100)}%`}
                      </strong>
                    </div>
                    {activeEvidenceMeta.matchedNode?.section_path && (
                      <div className="col-span-2 truncate">
                        Section:{" "}
                        <strong className="text-[var(--text-primary)]">
                          {activeEvidenceMeta.matchedNode.section_path}
                        </strong>
                      </div>
                    )}
                  </div>
                  {activeItem.temporal_conflict && (
                    <div className="pt-1.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--status-warning-ink)] font-medium">
                      Temporal Conflict: {activeItem.temporal_conflict.newer_filename} supersedes{" "}
                      {activeItem.temporal_conflict.older_filename}
                    </div>
                  )}
                </div>

                {/* Current Output */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                    Current Finding / Answer
                  </div>
                  <p className="p-3 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] font-serif leading-relaxed">
                    {activeItem.fluent_output}
                  </p>
                </div>
              </div>

              {/* Single-Item Triage Action Bar & Inline Forms */}
              <div
                data-testid="triage-action-panel"
                className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    <Eye size={14} className="text-[var(--accent-brand-ink)]" />
                    <span>
                      {activeEvidenceMeta.evidenceVisible
                        ? "Evidence confirmed in viewport"
                        : "Scroll evidence card into view to enable Accept"}
                    </span>
                  </div>
                  {activeEvidenceMeta.canUndo && (
                    <button
                      type="button"
                      data-testid="triage-item-undo-btn"
                      onClick={() => void undoWorkItem(activeItem.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                    >
                      <RotateCcw size={12} />
                      <span>Undo</span>
                    </button>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {activeEvidenceMeta.acceptState.visible && (
                    <button
                      type="button"
                      data-testid="triage-accept-btn"
                      disabled={!activeEvidenceMeta.acceptEnabled || isMutating}
                      title={
                        activeEvidenceMeta.acceptEnabled
                          ? `${activeEvidenceMeta.acceptState.label} (Shortcut: A)`
                          : "Confirm evidence in left pane before accepting"
                      }
                      onClick={() => void handleAcceptItem(activeItem)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--status-verified-solid)] hover:opacity-90 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                    >
                      {activeEvidenceMeta.acceptState.label}
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="triage-override-btn"
                    onClick={() => openInlineForm("override", activeItem)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                      activeForm === "override"
                        ? "bg-[var(--status-override-solid)] text-white border-[var(--status-override-solid)]"
                        : "bg-[var(--status-override-soft)] hover:opacity-90 text-[var(--status-override-ink)] border-[var(--status-override-border)]"
                    }`}
                  >
                    {TRIAGE_ACTION_LABELS.override}
                  </button>

                  <button
                    type="button"
                    data-testid="triage-legal-btn"
                    onClick={() => openInlineForm("legal", activeItem)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                      activeForm === "legal"
                        ? "bg-[var(--status-warning-solid)] text-white border-[var(--status-warning-solid)]"
                        : "bg-[var(--status-warning-soft)] hover:opacity-90 text-[var(--status-warning-ink)] border-[var(--status-warning-border)]"
                    }`}
                  >
                    {TRIAGE_ACTION_LABELS.legal}
                  </button>

                  <button
                    type="button"
                    data-testid="triage-na-btn"
                    aria-label="Mark N/A"
                    onClick={() => openInlineForm("na", activeItem)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                      activeForm === "na"
                        ? "bg-[var(--status-neutral-solid)] text-white border-[var(--status-neutral-solid)]"
                        : "bg-[var(--status-neutral-soft)] hover:opacity-90 text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]"
                    }`}
                  >
                    {TRIAGE_ACTION_LABELS.na}
                  </button>
                </div>

                {/* Inline Form: Override */}
                {activeForm === "override" && (
                  <form
                    data-testid="triage-override-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleConfirmOverride();
                    }}
                    className="p-3 rounded-xl bg-[var(--status-override-row)] border border-[var(--status-override-border)] space-y-2.5 text-xs"
                  >
                    <div className="font-semibold text-[var(--status-override-ink)]">
                      Human Override (Press Enter to confirm)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        aria-label="Override reason code"
                        value={overrideReasonCode}
                        onChange={(e) => setOverrideReasonCode(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-override-border)] text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        {MANUAL_OVERRIDE_REASON_CODES.map((rc) => (
                          <option key={rc.value} value={rc.value}>
                            {rc.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        aria-label="Override citation reference"
                        value={overrideCitation}
                        onChange={(e) => setOverrideCitation(e.target.value)}
                        placeholder="Citation / reference (optional if attesting)"
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-override-border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                    </div>
                    <input
                      type="text"
                      aria-label="Substantive override answer"
                      value={overrideAnswer}
                      onChange={(e) => {
                        setOverrideAnswer(e.target.value);
                        if (overrideError) setOverrideError(null);
                      }}
                      placeholder="Substantive verified answer (>=12 chars, >=3 words)..."
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-override-border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                    />
                    <label className="flex items-center gap-2 text-[11px] text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="No evidence — reviewer attests"
                        checked={overrideNoEvidence}
                        onChange={(e) => setOverrideNoEvidence(e.target.checked)}
                        className="rounded border-[var(--border-strong)] accent-[var(--status-override-solid)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                      <span>No evidence — reviewer attests</span>
                    </label>
                    {overrideError && (
                      <div
                        role="alert"
                        data-testid="triage-override-error"
                        className="p-2 rounded bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] font-semibold text-[11px]"
                      >
                        {overrideError}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isMutating}
                        className="px-3 py-1.5 rounded-lg bg-[var(--status-override-solid)] hover:opacity-90 text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Confirm Override
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveForm(null)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Inline Form: Flag for Legal */}
                {activeForm === "legal" && (
                  <form
                    data-testid="triage-legal-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleConfirmLegal();
                    }}
                    className="p-3 rounded-xl bg-[var(--status-warning-row)] border border-[var(--status-warning-border)] space-y-2 text-xs"
                  >
                    <div className="font-semibold text-[var(--status-warning-ink)] flex items-center gap-1.5">
                      <Scale size={13} />
                      <span>Flag for Legal Counsel (Press Enter to confirm)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label="Legal assignee"
                        value={legalAssignee}
                        onChange={(e) => setLegalAssignee(e.target.value)}
                        placeholder="Assignee"
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-warning-border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                      <input
                        type="text"
                        aria-label="Legal escalation reason"
                        value={legalReason}
                        onChange={(e) => setLegalReason(e.target.value)}
                        placeholder="Reason for counsel..."
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-warning-border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isMutating}
                        className="px-3 py-1.5 rounded-lg bg-[var(--status-warning-solid)] hover:opacity-90 text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Confirm Legal Flag
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveForm(null)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Inline Form: N/A */}
                {activeForm === "na" && (
                  <form
                    data-testid="triage-na-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleConfirmNa();
                    }}
                    className="p-3 rounded-xl bg-[var(--status-neutral-row)] border border-[var(--status-neutral-border)] space-y-2 text-xs"
                  >
                    <div className="font-semibold text-[var(--status-neutral-ink)]">
                      Mark Not Applicable (Priority {activeItem.priority_tier} preserved)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        aria-label="N/A reason code"
                        value={naReasonCode}
                        onChange={(e) => {
                          setNaReasonCode(e.target.value);
                          if (naError) setNaError(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-neutral-border)] text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        <option value="">Select N/A reason code…</option>
                        {NOT_APPLICABLE_REASON_CODES.map((rc) => (
                          <option key={rc.value} value={rc.value}>
                            {rc.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        aria-label="N/A rationale note"
                        value={naNote}
                        onChange={(e) => {
                          setNaNote(e.target.value);
                          if (naError) setNaError(null);
                        }}
                        placeholder="Required rationale..."
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-neutral-border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                    </div>
                    {naError && (
                      <div
                        role="alert"
                        data-testid="triage-na-error"
                        className="p-2 rounded bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] font-semibold text-[11px]"
                      >
                        {naError}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isMutating}
                        className="px-3 py-1.5 rounded-lg bg-[var(--status-neutral-solid)] hover:opacity-90 text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Confirm N/A
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveForm(null)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT PANE: Priority Queue + Filter Tabs + Bulk Actions */}
        <section
          data-testid="triage-queue-pane"
          aria-label="Priority triage queue"
          className="lg:col-span-6 h-full min-h-0 flex flex-col bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-sm overflow-hidden"
        >
          {/* Filter Tabs */}
          <div
            data-testid="triage-filter-tabs"
            role="tablist"
            aria-label="Triage queue status filters"
            className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)] flex flex-wrap items-center gap-1.5 shrink-0"
          >
            {TAB_DEFS.map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`triage-tab-${tab.id}`}
                  onClick={() => selectTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    isSelected
                      ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] shadow-2xs"
                      : "bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0 rounded-full text-[10px] font-mono tabular-nums ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-[var(--bg-sunken)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bulk Actions Toolbar */}
          <div
            data-testid="triage-bulk-toolbar"
            className="px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2 shrink-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <label className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)] cursor-pointer tabular-nums">
                <input
                  type="checkbox"
                  data-testid="triage-select-all"
                  aria-label="Select all items in view"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-[var(--border-strong)] accent-[var(--accent-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                />
                <span>
                  {selectedIds.length > 0
                    ? `${selectedIds.length} selected`
                    : `Select all (${queueItems.length})`}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="triage-bulk-accept"
                  disabled={bulkAcceptEligibleIds.length === 0 || isMutating}
                  onClick={() => void handleBulkAccept()}
                  className="px-2.5 py-1 rounded-lg bg-[var(--status-verified-solid)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold cursor-pointer tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  Bulk Accept ({bulkAcceptEligibleIds.length})
                </button>

                <button
                  type="button"
                  data-testid="triage-bulk-legal"
                  disabled={selectedIds.length === 0 || isMutating}
                  onClick={() => {
                    setBulkError(null);
                    setBulkPanel((p) => (p === "legal" ? null : "legal"));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[var(--status-warning-solid)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  Bulk Flag for Legal
                </button>

                <button
                  type="button"
                  data-testid="triage-bulk-na"
                  disabled={selectedIds.length === 0 || isMutating}
                  onClick={() => {
                    setBulkError(null);
                    setBulkPanel((p) => (p === "na" ? null : "na"));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[var(--status-neutral-soft)] hover:opacity-90 border border-[var(--status-neutral-border)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--status-neutral-ink)] text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  Bulk Mark N/A
                </button>
              </div>
            </div>

            {/* Bulk Legal Sub-form */}
            {bulkPanel === "legal" && selectedIds.length > 0 && (
              <div className="p-2.5 rounded-xl bg-[var(--status-warning-row)] border border-[var(--status-warning-border)] space-y-2 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    aria-label="Bulk legal assignee"
                    value={bulkLegalAssignee}
                    onChange={(e) => setBulkLegalAssignee(e.target.value)}
                    placeholder="Assignee"
                    className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--status-warning-border)] text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  />
                  <input
                    type="text"
                    aria-label="Bulk legal reason"
                    value={bulkLegalReason}
                    onChange={(e) => setBulkLegalReason(e.target.value)}
                    placeholder="Reason for legal review"
                    className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--status-warning-border)] text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="triage-bulk-legal-confirm"
                    onClick={() => void handleBulkLegalConfirm()}
                    className="px-2.5 py-1 rounded bg-[var(--status-warning-solid)] text-white font-semibold text-[11px] cursor-pointer tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  >
                    Confirm Bulk Legal ({selectedIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkPanel(null)}
                    className="px-2 py-1 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Bulk N/A Sub-form */}
            {bulkPanel === "na" && selectedIds.length > 0 && (
              <div className="p-2.5 rounded-xl bg-[var(--status-neutral-row)] border border-[var(--status-neutral-border)] space-y-2 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    aria-label="Bulk N/A reason code"
                    value={bulkNaReasonCode}
                    onChange={(e) => {
                      setBulkNaReasonCode(e.target.value);
                      if (bulkError) setBulkError(null);
                    }}
                    className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--status-neutral-border)] text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  >
                    <option value="">Select N/A reason code…</option>
                    {NOT_APPLICABLE_REASON_CODES.map((rc) => (
                      <option key={rc.value} value={rc.value}>
                        {rc.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    aria-label="Bulk N/A rationale"
                    value={bulkNaNote}
                    onChange={(e) => {
                      setBulkNaNote(e.target.value);
                      if (bulkError) setBulkError(null);
                    }}
                    placeholder="Required rationale..."
                    className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--status-neutral-border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  />
                </div>
                {bulkError && (
                  <div
                    role="alert"
                    data-testid="triage-bulk-error"
                    className="p-1.5 rounded bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] text-[11px] font-semibold"
                  >
                    {bulkError}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="triage-bulk-na-confirm"
                    onClick={() => void handleBulkNaConfirm()}
                    className="px-2.5 py-1 rounded bg-[var(--status-neutral-solid)] text-white font-semibold text-[11px] cursor-pointer tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  >
                    Confirm Bulk N/A ({selectedIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkPanel(null)}
                    className="px-2 py-1 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {bulkError && !bulkPanel && (
              <div
                role="alert"
                data-testid="triage-bulk-error"
                className="p-2 rounded bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] text-[11px] font-semibold"
              >
                {bulkError}
              </div>
            )}
          </div>

          {/* Priority-Ordered Queue List */}
          <div
            data-testid="triage-queue-list"
            className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--border-subtle)]"
          >
            {queueItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
                No work items match the current triage filter.
              </div>
            ) : (
              queueItems.map((item) => {
                const isActive = activeItem?.id === item.id;
                const isChecked = selectedIds.includes(item.id);
                const acceptState = getAcceptActionState(item);
                const matchTone = getMatchBadgeTone(
                  item.gate_telemetry?.citation_match ?? 0,
                  item.verification_status,
                  item.weak_evidence
                );

                return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      queueItemRefs.current[item.id] = el;
                    }}
                    data-testid="triage-queue-item"
                    data-item-id={item.id}
                    data-priority-tier={item.priority_tier}
                    data-active={String(isActive)}
                    className={`p-3.5 transition-colors flex items-start gap-3 ${
                      isActive
                        ? "bg-[var(--accent-brand-soft)] ring-1 ring-inset ring-[var(--accent-brand-border)]"
                        : "hover:bg-[var(--bg-sunken)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      data-testid="triage-item-checkbox"
                      aria-label={`Select ${item.prompt_or_question}`}
                      checked={isChecked}
                      onChange={() => toggleSelectId(item.id)}
                      className="mt-1 rounded border-[var(--border-strong)] accent-[var(--accent-brand)] cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setActiveItemId(item.id);
                        setActiveForm(null);
                      }}
                      aria-current={isActive ? "true" : undefined}
                      className="flex-1 min-w-0 text-left space-y-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border tabular-nums ${priorityBadgeStyle(
                              item.priority_tier
                            )}`}
                          >
                            {item.priority_tier}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border ${statusBadgeStyle(
                              item.verification_status
                            )}`}
                          >
                            <StatusIcon status={item.verification_status} />
                            <span>{item.verification_status}</span>
                          </span>
                          {acceptState.kind === "rescue" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]">
                              <Sparkles size={10} aria-hidden="true" />
                              <span>Vision Rescue</span>
                            </span>
                          )}
                          {item.weak_evidence && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]">
                              <AlertTriangle size={10} aria-hidden="true" />
                              <span>Weak</span>
                            </span>
                          )}
                        </div>

                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border tabular-nums ${matchTone.badgeClass}`}
                        >
                          {matchTone.scoreDisplay}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
                        {item.prompt_or_question}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                        <span className="truncate">{item.category}</span>
                        {!acceptState.visible && (
                          <span className="font-mono text-[10px] text-[var(--status-danger-ink)] shrink-0">
                            No machine text
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
