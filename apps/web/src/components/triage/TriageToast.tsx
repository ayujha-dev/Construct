import { RotateCcw, Scale, X } from "lucide-react";
import { useBertStore } from "../../store/useBertStore";

interface TriageToastProps {
  className?: string;
}

export function TriageToast({ className = "" }: TriageToastProps) {
  const undoToast = useBertStore((s) => s.undoToast);
  const undoWorkItem = useBertStore((s) => s.undoWorkItem);
  const undoWorkItems = useBertStore((s) => s.undoWorkItems);
  const dismissUndoToast = useBertStore((s) => s.dismissUndoToast);

  if (!undoToast) return null;

  const ids =
    undoToast.workItemIds && undoToast.workItemIds.length > 0
      ? undoToast.workItemIds
      : [undoToast.workItemId];

  const handleUndo = () => {
    if (ids.length > 1) {
      void undoWorkItems(ids);
    } else if (ids[0]) {
      void undoWorkItem(ids[0]);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="undo-toast"
      data-triage-toast="true"
      className={`p-3 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-strong)] text-xs flex items-center justify-between gap-3 shadow-lg ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Scale size={14} className="text-[var(--status-warning-ink)] shrink-0" />
        <span className="truncate font-medium">
          {undoToast.action}: {undoToast.label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          data-testid="triage-undo-btn"
          onClick={handleUndo}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--status-warning-solid)] hover:opacity-95 text-white font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] tabular-nums"
        >
          <RotateCcw size={12} />
          <span>{ids.length > 1 ? `Undo (${ids.length})` : "Undo"}</span>
        </button>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={dismissUndoToast}
          className="p-1 rounded hover:bg-[var(--bg-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
