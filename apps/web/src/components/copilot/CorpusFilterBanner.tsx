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
      className={`flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/90 text-blue-950 ${
        compact ? "px-2.5 py-1.5 text-[11px]" : "px-3.5 py-2 text-xs"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Filter size={13} className="text-blue-700 shrink-0" />
        <span data-testid="corpus-filter-chip" className="truncate font-medium">
          Filtered to <strong className="font-semibold">{filteredDoc.filename}</strong>
        </span>
      </div>
      <button
        type="button"
        data-testid="clear-file-filter"
        onClick={() => setSelectedFileFilter(null)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-blue-100 border border-blue-300 text-blue-900 font-semibold text-[11px] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <X size={11} />
        <span>Clear</span>
      </button>
    </div>
  );
}
