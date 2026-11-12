import type { Document, WorkItem } from "../types/bert";
import { itemMatchesDocumentFilter } from "./workItemMetrics";

export const CATEGORY_COLORS: Record<string, { fill: string; text: string }> = {
  "Access Control": { fill: "#38BDF8", text: "#0369A1" },
  "Liability & Indemnification": { fill: "#F87171", text: "#B91C1C" },
  "Cryptography & Keys": { fill: "#A78BFA", text: "#6D28D9" },
  "Data Retention": { fill: "#FBBF24", text: "#B45309" },
  "Temporal Conflicts": { fill: "#FB923C", text: "#C2410C" },
  "Cloud Infrastructure": { fill: "#818CF8", text: "#4338CA" },
  "Vendor Risk Assessment": { fill: "#34D399", text: "#047857" },
  "Disaster Recovery": { fill: "#60A5FA", text: "#1D4ED8" },
  "Degraded Scans & Physical": { fill: "#F472B6", text: "#BE185D" },
  "General Governance": { fill: "#94A3B8", text: "#334155" },
};

export const CAUTION_BUCKET_COLORS: Record<string, string> = {
  "Machine Verified": "#10B981",
  "Human Overridden": "#7C3AED",
  "Marked N/A": "#64748B",
  "Escalated Legal": "#D97706",
  "Critical Open": "#EF4444",
  "Unresolved / Review": "#F59E0B",
};

export type ResultsMetricType = "count" | "confidence";
export type ResultsGroupedBy = "documents" | "categories";
export type ResultsSegmentedBy = "caution" | "category";

export interface ChartSegment {
  key: string;
  color: string;
  count: number;
  /** In count mode: item count. In confidence mode: weighted contribution to column avg confidence (0..100). */
  value: number;
  avgConfidence: number;
  /** Percentage of the rendered bar height (0..100), normalized so column segments never exceed 100%. */
  heightPercent: number;
}

export interface ChartColumn {
  label: string;
  fullLabel: string;
  /** Primary metric value: item count in 'count' mode, average match % (0..100) in 'confidence' mode. */
  total: number;
  rawCount: number;
  /** Height of the bar container relative to maxChartValue (0..100). 0 when total === 0. */
  colHeightPercent: number;
  segments: ChartSegment[];
}

export interface ResultsChartModel {
  columns: ChartColumn[];
  maxChartValue: number;
  isEmpty: boolean;
}

function clampScore(score: number | null | undefined): number {
  if (typeof score !== "number" || !Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function averageConfidence(items: WorkItem[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, i) => acc + clampScore(i.gate_telemetry?.citation_match), 0);
  return round1(sum / items.length);
}

/**
 * Normalize segment heights so their sum is strictly <= 100% and each non-zero segment
 * receives proportional visual space without ever overflowing its stacked bar container.
 */
function normalizeSegmentHeights(
  rawSegments: Array<Omit<ChartSegment, "heightPercent">>
): ChartSegment[] {
  const totalValue = rawSegments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (totalValue <= 0) {
    return rawSegments.map((s) => ({ ...s, heightPercent: 0 }));
  }

  const exacts = rawSegments.map((s) => (Math.max(0, s.value) / totalValue) * 100);
  const floors = exacts.map((v) => Math.floor(v));
  let remainder = 100 - floors.reduce((sum, v) => sum + v, 0);

  const byFraction = exacts
    .map((v, idx) => ({ idx, frac: v - floors[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < byFraction.length && remainder > 0; i += 1) {
    if (rawSegments[byFraction[i].idx].value > 0) {
      floors[byFraction[i].idx] += 1;
      remainder -= 1;
    }
  }

  return rawSegments.map((s, idx) => ({
    ...s,
    heightPercent: floors[idx],
  }));
}

/**
 * Strictly mutually exclusive caution buckets:
 * Machine Verified | Human Overridden | Marked N/A | Escalated Legal | Critical Open (P0) | Unresolved / Review (P1..P3).
 * Guarantees zero P1_HIGH double counting and sum(count) === items.length.
 */
export function buildCautionSegments(
  items: WorkItem[],
  metricType: ResultsMetricType = "count"
): ChartSegment[] {
  const bucketOrder = [
    "Machine Verified",
    "Human Overridden",
    "Marked N/A",
    "Escalated Legal",
    "Critical Open",
    "Unresolved / Review",
  ] as const;

  const grouped: Record<string, WorkItem[]> = {
    "Machine Verified": [],
    "Human Overridden": [],
    "Marked N/A": [],
    "Escalated Legal": [],
    "Critical Open": [],
    "Unresolved / Review": [],
  };

  for (const item of items) {
    if (item.verification_status === "VERIFIED") {
      grouped["Machine Verified"].push(item);
    } else if (item.verification_status === "HUMAN_OVERRIDE") {
      grouped["Human Overridden"].push(item);
    } else if (item.verification_status === "NOT_APPLICABLE") {
      grouped["Marked N/A"].push(item);
    } else if (item.verification_status === "ESCALATED_LEGAL") {
      grouped["Escalated Legal"].push(item);
    } else if (item.priority_tier === "P0_CRITICAL") {
      grouped["Critical Open"].push(item);
    } else {
      grouped["Unresolved / Review"].push(item);
    }
  }

  const totalItems = items.length || 1;
  const rawSegments: Array<Omit<ChartSegment, "heightPercent">> = [];

  for (const key of bucketOrder) {
    const bucketItems = grouped[key];
    if (bucketItems.length === 0) continue;
    const sumConf = bucketItems.reduce(
      (acc, i) => acc + clampScore(i.gate_telemetry?.citation_match),
      0
    );
    const avgConf = round1(sumConf / bucketItems.length);
    const value = metricType === "confidence" ? round1(sumConf / totalItems) : bucketItems.length;
    rawSegments.push({
      key,
      color: CAUTION_BUCKET_COLORS[key],
      count: bucketItems.length,
      value,
      avgConfidence: avgConf,
    });
  }

  return normalizeSegmentHeights(rawSegments);
}

function buildCategorySegments(
  items: WorkItem[],
  metricType: ResultsMetricType
): ChartSegment[] {
  const byCategory = new Map<string, WorkItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category);
    if (list) list.push(item);
    else byCategory.set(item.category, [item]);
  }

  const totalItems = items.length || 1;
  const rawSegments: Array<Omit<ChartSegment, "heightPercent">> = [];

  for (const [cat, catItems] of byCategory.entries()) {
    const sumConf = catItems.reduce(
      (acc, i) => acc + clampScore(i.gate_telemetry?.citation_match),
      0
    );
    const avgConf = round1(sumConf / catItems.length);
    const value = metricType === "confidence" ? round1(sumConf / totalItems) : catItems.length;
    rawSegments.push({
      key: cat,
      color: CATEGORY_COLORS[cat]?.fill || "#94A3B8",
      count: catItems.length,
      value,
      avgConfidence: avgConf,
    });
  }

  return normalizeSegmentHeights(rawSegments);
}

export function computeResultsChartModel(params: {
  filteredItems: WorkItem[];
  documents: Document[];
  selectedDocFilter: string;
  groupedBy: ResultsGroupedBy;
  segmentedBy: ResultsSegmentedBy;
  metricType: ResultsMetricType;
}): ResultsChartModel {
  const {
    filteredItems,
    documents,
    selectedDocFilter,
    groupedBy,
    segmentedBy,
    metricType,
  } = params;

  if (filteredItems.length === 0) {
    return {
      columns: [],
      maxChartValue: metricType === "confidence" ? 100 : 4,
      isEmpty: true,
    };
  }

  const rawCols: Array<Omit<ChartColumn, "colHeightPercent">> = [];

  if (groupedBy === "documents") {
    const docList =
      selectedDocFilter === "ALL"
        ? documents
        : documents.filter((d) => d.id === selectedDocFilter);

    for (const doc of docList) {
      const docItems = filteredItems.filter((item) =>
        itemMatchesDocumentFilter(item, doc.id, documents)
      );
      if (docItems.length === 0) continue;

      const segments =
        segmentedBy === "category"
          ? buildCategorySegments(docItems, metricType)
          : buildCautionSegments(docItems, metricType);

      const total =
        metricType === "confidence" ? averageConfidence(docItems) : docItems.length;

      rawCols.push({
        label: doc.filename.length > 20 ? `${doc.filename.slice(0, 18)}…` : doc.filename,
        fullLabel: doc.filename,
        total,
        rawCount: docItems.length,
        segments,
      });
    }
  } else {
    const categories = Array.from(new Set(filteredItems.map((i) => i.category)));
    for (const cat of categories) {
      const catItems = filteredItems.filter((item) => item.category === cat);
      if (catItems.length === 0) continue;

      const segments =
        segmentedBy === "category"
          ? buildCategorySegments(catItems, metricType)
          : buildCautionSegments(catItems, metricType);

      const total =
        metricType === "confidence" ? averageConfidence(catItems) : catItems.length;

      rawCols.push({
        label: cat.length > 16 ? `${cat.slice(0, 14)}…` : cat,
        fullLabel: cat,
        total,
        rawCount: catItems.length,
        segments,
      });
    }
  }

  if (rawCols.length === 0) {
    return {
      columns: [],
      maxChartValue: metricType === "confidence" ? 100 : 4,
      isEmpty: true,
    };
  }

  const maxChartValue =
    metricType === "confidence" ? 100 : Math.max(...rawCols.map((c) => c.total), 4);

  const columns: ChartColumn[] = rawCols.map((col) => ({
    ...col,
    colHeightPercent:
      col.total > 0
        ? Math.min(100, Math.max(4, Math.round((col.total / maxChartValue) * 100)))
        : 0,
  }));

  return {
    columns,
    maxChartValue,
    isEmpty: false,
  };
}
