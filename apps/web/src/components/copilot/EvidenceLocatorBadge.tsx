import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import { formatLocatorDisplay, warnMissingLocator, type SourceTypeChip } from "../../lib/evidenceLocators";
import type { BboxTuple, BoundingBox, Document, EvidenceLocator } from "../../types/bert";

interface EvidenceLocatorBadgeProps {
  locator?: EvidenceLocator | null;
  document?: Pick<Document, "source_format" | "category" | "sub_category" | "filename"> | null;
  fallbackPage?: number | null;
  fallbackBbox?: BoundingBox | BboxTuple | null;
  regionMatchScore?: number | null;
  context?: string;
}

const CHIP_STYLES: Record<SourceTypeChip, string> = {
  PDF: "bg-blue-50 text-blue-800 border-blue-200",
  SCAN: "bg-rose-50 text-rose-800 border-rose-200",
  XLSX: "bg-emerald-50 text-emerald-800 border-emerald-200",
  JSON: "bg-amber-50 text-amber-900 border-amber-200",
  TXT: "bg-zinc-100 text-zinc-800 border-zinc-300",
};

export function EvidenceLocatorBadge({
  locator,
  document,
  fallbackPage,
  fallbackBbox,
  regionMatchScore,
  context,
}: EvidenceLocatorBadgeProps) {
  const display = formatLocatorDisplay(locator, document, fallbackPage, fallbackBbox);

  useEffect(() => {
    if (!display.valid) {
      warnMissingLocator(context ?? document?.filename ?? "citation", { fallbackPage });
    }
  }, [context, display.valid, document?.filename, fallbackPage]);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
      <span
        data-testid="source-type-chip"
        className={`px-1.5 py-0.5 rounded border font-bold tracking-tight ${CHIP_STYLES[display.chip]}`}
      >
        {display.chip}
      </span>

      {display.valid ? (
        <span
          className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 truncate max-w-[200px]"
          title={display.detail}
        >
          {display.label}
        </span>
      ) : (
        <span
          data-testid="missing-locator-warning"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 font-semibold"
          title={display.detail}
        >
          <AlertTriangle size={11} className="text-amber-700 shrink-0" />
          <span>No source locator stored</span>
        </span>
      )}

      {typeof regionMatchScore === "number" && Number.isFinite(regionMatchScore) && (
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-semibold ${
            regionMatchScore >= 97
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-amber-50 text-amber-900 border-amber-200"
          }`}
          title={`Region text vs claimed quote verification: ${regionMatchScore.toFixed(1)}%`}
        >
          {regionMatchScore >= 97 ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
          <span>{regionMatchScore.toFixed(1)}% Region</span>
        </span>
      )}
    </span>
  );
}
