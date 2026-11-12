import { Filter, X } from "lucide-react";
import { useBertStore } from "../../store/useBertStore";

export function CorpusFilterBanner({ compact = false }: { compact?: boolean }) {
  const { selectedFileFilterId, documents, setSelectedFileFilter } = useBertStore();
  if (!selectedFileFilterId) return null;

  const filteredDoc = documents.find((d) => d.id === selectedFileFilterId);
  if (!filteredDoc) return null;

  return (
    <div
      data-testid="corpus-filter-banner"
      className={`flex items-center justify-between gap-2 rounded-xl border border-[var(--accent-brand-border)] bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] ${
        compact ? "px-2.5 py-1.5 text-[11px]" : "px-3.5 py-2 text-xs"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Filter size={13} className="text-[var(--accent-brand-ink)] shrink-0" />
        <span data-testid="corpus-filter-chip" className="truncate font-medium">
          Filtered to <strong className="font-semibold">{filteredDoc.filename}</strong>
        </span>
      </div>
      <button
        type="button"
        data-testid="clear-file-filter"
        onClick={() => setSelectedFileFilter(null)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)] border border-[var(--accent-brand-border)] text-[var(--accent-brand-ink)] font-semibold text-[11px] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
      >
        <X size={11} />
        <span>Clear</span>
      </button>
    </div>
  );
}
