import {
  Ban,
  Check,
  Edit3,
  Keyboard,
  RotateCcw,
  Scale,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  INITIAL_TRIAGE_PREVIEW_ITEMS,
  type TriagePreviewItem,
  type TriagePreviewStatus,
} from "../homeData";

interface TriageRowState extends TriagePreviewItem {
  status: TriagePreviewStatus;
}

interface UndoToastState {
  itemId: string;
  itemTitle: string;
  previousStatus: TriagePreviewStatus;
  nextStatus: TriagePreviewStatus;
  actionLabel: string;
}

const STATUS_META: Record<
  TriagePreviewStatus,
  { label: string; className: string }
> = {
  NEEDS_REVIEW: {
    label: "NEEDS REVIEW",
    className:
      "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]",
  },
  VERIFIED: {
    label: "VERIFIED",
    className:
      "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]",
  },
  HUMAN_OVERRIDE: {
    label: "HUMAN OVERRIDE",
    className:
      "bg-[var(--status-override-soft)] text-[var(--status-override-ink)] border-[var(--status-override-border)]",
  },
  ESCALATED_LEGAL: {
    label: "ESCALATED LEGAL",
    className:
      "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]",
  },
  NOT_APPLICABLE: {
    label: "N/A",
    className:
      "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]",
  },
};

export function TriagePreviewSection() {
  const [items, setItems] = useState<TriageRowState[]>(() =>
    INITIAL_TRIAGE_PREVIEW_ITEMS.map((item) => ({
      ...item,
      status: item.initialStatus,
    }))
  );
  const [selectedId, setSelectedId] = useState<string>(INITIAL_TRIAGE_PREVIEW_ITEMS[0].id);
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);

  const selectedItem = items.find((i) => i.id === selectedId) ?? items[0];

  useEffect(() => {
    if (!undoToast) return;
    const timer = window.setTimeout(() => {
      setUndoToast(null);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [undoToast]);

  const applyAction = (
    targetId: string,
    nextStatus: TriagePreviewStatus,
    actionLabel: string
  ) => {
    const current = items.find((item) => item.id === targetId);
    if (!current) return;
    const previousStatus = current.status;
    setItems((prev) =>
      prev.map((item) => (item.id === targetId ? { ...item, status: nextStatus } : item))
    );
    setUndoToast({
      itemId: targetId,
      itemTitle: current.title,
      previousStatus,
      nextStatus,
      actionLabel,
    });
  };

  const handleUndo = () => {
    if (!undoToast) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === undoToast.itemId ? { ...item, status: undoToast.previousStatus } : item
      )
    );
    setSelectedId(undoToast.itemId);
    setUndoToast(null);
  };

  const handleResetAll = () => {
    setItems(
      INITIAL_TRIAGE_PREVIEW_ITEMS.map((item) => ({
        ...item,
        status: item.initialStatus,
      }))
    );
    setSelectedId(INITIAL_TRIAGE_PREVIEW_ITEMS[0].id);
    setUndoToast(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.toLowerCase();
    if (key === "a") {
      e.preventDefault();
      applyAction(selectedItem.id, "VERIFIED", "Accept");
    } else if (key === "o") {
      e.preventDefault();
      applyAction(selectedItem.id, "HUMAN_OVERRIDE", "Override");
    } else if (key === "l") {
      e.preventDefault();
      applyAction(selectedItem.id, "ESCALATED_LEGAL", "Flag for Legal");
    } else if (key === "n") {
      e.preventDefault();
      applyAction(selectedItem.id, "NOT_APPLICABLE", "N/A");
    } else if (key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      const idx = items.findIndex((i) => i.id === selectedItem.id);
      const next = items[(idx + 1) % items.length];
      setSelectedId(next.id);
    } else if (key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      const idx = items.findIndex((i) => i.id === selectedItem.id);
      const prev = items[(idx - 1 + items.length) % items.length];
      setSelectedId(prev.id);
    }
  };

  const priorityBadgeClass = (priority: TriagePreviewItem["priority"]) => {
    if (priority === "P0_CRITICAL") {
      return "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]";
    }
    if (priority === "P1_HIGH") {
      return "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]";
    }
    return "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border-[var(--accent-brand-border)]";
  };

  return (
    <section
      id="triage-preview"
      className="relative z-10 scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 text-[var(--text-primary)] border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur-[2px]"
    >
      <div
        data-testid="triage-preview-sandbox"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="max-w-5xl mx-auto space-y-6 focus:outline-none"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-3xl space-y-2.5">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
              05 · HUMAN TRIAGE PREVIEW
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
              Keyboard-first exception resolution with instant Undo.
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Try triaging three realistic escalations locally. Focus any item and press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] font-mono text-xs">
                A
              </kbd>{" "}
              Accept,{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] font-mono text-xs">
                O
              </kbd>{" "}
              Override,{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] font-mono text-xs">
                L
              </kbd>{" "}
              Flag for Legal, or{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] font-mono text-xs">
                N
              </kbd>{" "}
              N/A—purely local state, zero backend mutation.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-sunken)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)]">
              <Keyboard size={12} />
              <span>Local Sandbox</span>
            </span>
            <button
              type="button"
              data-testid="triage-preview-reset"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              <RotateCcw size={12} />
              <span>Reset Queue</span>
            </button>
          </div>
        </div>

        {/* Two-Pane Local Triage Sandbox */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left: 3 Mock Queue Items */}
          <div className="lg:col-span-5 space-y-2.5">
            {items.map((item) => {
              const selected = item.id === selectedItem.id;
              const statusMeta = STATUS_META[item.status];
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`triage-preview-item-${item.id}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    selected
                      ? "bg-[var(--bg-surface)] border-[var(--accent-brand)] ring-2 ring-[var(--accent-brand-soft)] shadow-md"
                      : "bg-[var(--bg-sunken)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${priorityBadgeClass(
                        item.priority
                      )}`}
                    >
                      {item.priority}
                    </span>
                    <span
                      data-testid={`triage-preview-status-${item.id}`}
                      className={`px-2 py-0.5 rounded-full border font-mono text-[10px] font-bold ${statusMeta.className}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[var(--text-primary)] mt-2 leading-snug">
                    {item.title}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-1 truncate">
                    {item.sourceFile} · {item.locator}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Evidence & Action Controls */}
          <div className="lg:col-span-7 rounded-3xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-5 sm:p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <div className="text-[11px] font-mono text-[var(--accent-brand-ink)] font-semibold">
                    {selectedItem.sourceFile} · {selectedItem.locator}
                  </div>
                  <h3 className="font-serif text-xl font-semibold text-[var(--text-primary)] mt-0.5">
                    {selectedItem.title}
                  </h3>
                </div>
                <span
                  data-testid="triage-preview-active-status"
                  className={`px-2.5 py-1 rounded-full border font-mono text-[11px] font-bold ${
                    STATUS_META[selectedItem.status].className
                  }`}
                >
                  {STATUS_META[selectedItem.status].label}
                </span>
              </div>

              <div className="rounded-2xl bg-[var(--bg-hero)] text-[#F4F1EA] border border-[#2F4461] p-4 space-y-1.5">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#A8D4F5]">
                  {selectedItem.hasVisionRescue
                    ? "Scout Vision Rescue Transcription"
                    : "Captured Source Evidence"}
                </div>
                <p className="font-mono text-xs leading-relaxed text-[#F4F1EA]">
                  {selectedItem.evidenceQuote}
                </p>
              </div>

              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {selectedItem.reason}
              </p>
            </div>

            {/* Action Bar */}
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="triage-action-accept"
                  onClick={() => applyAction(selectedItem.id, "VERIFIED", "Accept")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--status-verified-solid)] hover:opacity-90 text-white text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <Check size={13} />
                  <span>
                    {selectedItem.hasVisionRescue ? "Accept Vision Rescue" : "Accept"}
                  </span>
                  <kbd className="ml-1 px-1 py-0.5 rounded bg-black/25 font-mono text-[10px]">
                    A
                  </kbd>
                </button>

                <button
                  type="button"
                  data-testid="triage-action-override"
                  onClick={() => applyAction(selectedItem.id, "HUMAN_OVERRIDE", "Override")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--status-override-soft)] hover:opacity-90 text-[var(--status-override-ink)] border border-[var(--status-override-border)] text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <Edit3 size={13} />
                  <span>Override</span>
                  <kbd className="ml-1 px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--status-override-border)] font-mono text-[10px]">
                    O
                  </kbd>
                </button>

                <button
                  type="button"
                  data-testid="triage-action-legal"
                  onClick={() =>
                    applyAction(selectedItem.id, "ESCALATED_LEGAL", "Flag for Legal")
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--status-warning-soft)] hover:opacity-90 text-[var(--status-warning-ink)] border border-[var(--status-warning-border)] text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <Scale size={13} />
                  <span>Flag for Legal</span>
                  <kbd className="ml-1 px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--status-warning-border)] font-mono text-[10px]">
                    L
                  </kbd>
                </button>

                <button
                  type="button"
                  data-testid="triage-action-na"
                  onClick={() => applyAction(selectedItem.id, "NOT_APPLICABLE", "N/A")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--status-neutral-soft)] hover:opacity-90 text-[var(--status-neutral-ink)] border border-[var(--status-neutral-border)] text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <Ban size={13} />
                  <span>N/A</span>
                  <kbd className="ml-1 px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--status-neutral-border)] font-mono text-[10px]">
                    N
                  </kbd>
                </button>
              </div>

              {/* Local Undo Toast */}
              {undoToast && (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="triage-preview-undo-toast"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--bg-hero)] text-[#F4F1EA] border border-[#2F4461] px-4 py-2.5 text-xs shadow-md"
                >
                  <span className="truncate">
                    Applied <strong>{undoToast.actionLabel}</strong> ({STATUS_META[undoToast.nextStatus].label})
                  </span>
                  <button
                    type="button"
                    data-testid="triage-preview-undo-btn"
                    onClick={handleUndo}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#265D80] hover:bg-[#317099] text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white shrink-0"
                  >
                    <Undo2 size={12} />
                    <span>Undo</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
