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
  PDF: "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border-[var(--accent-brand-border)]",
  SCAN: "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]",
  XLSX: "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]",
  JSON: "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]",
  TXT: "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]",
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
    <span className="inline-flex flex-wrap items-center gap-1.5 font-mono text-[10px] tabular-nums">
      <span
        data-testid="source-type-chip"
        className={`px-1.5 py-0.5 rounded border font-bold tracking-tight ${CHIP_STYLES[display.chip]}`}
      >
        {display.chip}
      </span>

      {display.valid ? (
        <span
          className="px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] text-[var(--text-secondary)] border border-[var(--border-subtle)] truncate max-w-[200px]"
          title={display.detail}
        >
          {display.label}
        </span>
      ) : (
        <span
          data-testid="missing-locator-warning"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)] font-semibold"
          title={display.detail}
        >
          <AlertTriangle size={11} className="text-[var(--status-warning-ink)] shrink-0" />
          <span>No source locator stored</span>
        </span>
      )}

      {typeof regionMatchScore === "number" && Number.isFinite(regionMatchScore) && (
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-semibold ${
            regionMatchScore >= 97
              ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
              : "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]"
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
