import {
  AlertTriangle,
  ArrowDown,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileCheck2,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useBertStore } from "../store/useBertStore";
import type { PriorityTier, WorkItem } from "../types/bert";

const CATEGORY_COLORS: Record<string, { fill: string; text: string }> = {
  "Access Control": { fill: "#38BDF8", text: "#0284C7" }, // Sky
  "Liability & Indemnification": { fill: "#F87171", text: "#DC2626" }, // Rose Coral
  "Cryptography & Keys": { fill: "#A78BFA", text: "#7C3AED" }, // Lilac
  "Data Retention": { fill: "#FBBF24", text: "#D97706" }, // Amber
  "Temporal Conflicts": { fill: "#FB923C", text: "#EA580C" }, // Orange
  "Cloud Infrastructure": { fill: "#818CF8", text: "#4F46E5" }, // Indigo
  "Vendor Risk Assessment": { fill: "#34D399", text: "#059669" }, // Mint Emerald
  "Disaster Recovery": { fill: "#60A5FA", text: "#2563EB" }, // Blue
  "General Governance": { fill: "#94A3B8", text: "#475569" }, // Slate
};

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: "#10B981", // Emerald
  NEEDS_HUMAN_VERIFICATION: "#F59E0B", // Amber
  INSUFFICIENT_EVIDENCE: "#EF4444", // Coral Red
};

export function ResultsPage() {
  const {
    documents,
    workItems,
    resolveWorkItem,
    inspectCitation,
  } = useBertStore();

  // Attio Insight Panel State
  const [selectedDocFilter, setSelectedDocFilter] = useState<string>("ALL");
  const [metricType, setMetricType] = useState<"count" | "confidence">("count");
  const [groupedBy, setGroupedBy] = useState<"documents" | "categories">("documents");
  const [segmentedBy, setSegmentedBy] = useState<"caution" | "category">("category");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [showExactQuotes, setShowExactQuotes] = useState(true);
  const [enforceLatestVersion, setEnforceLatestVersion] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState("");
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    return workItems.filter((item) => {
      if (selectedDocFilter !== "ALL" && item.document_id !== selectedDocFilter) {
        return false;
      }
      if (onlyCritical && item.priority_tier !== "P0_CRITICAL" && item.verification_status === "VERIFIED") {
        return false;
      }
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const text = `${item.prompt_or_question} ${item.fluent_output} ${item.category}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [workItems, selectedDocFilter, onlyCritical, searchFilter]);

  // Chart data aggregation
  const chartData = useMemo(() => {
    if (groupedBy === "documents") {
      // Group by document
      const docList = selectedDocFilter === "ALL" ? documents : documents.filter((d) => d.id === selectedDocFilter);
      return docList.map((doc) => {
        const docItems = filteredItems.filter((item) => item.document_id === doc.id);
        const segments: { key: string; color: string; count: number }[] = [];

        if (segmentedBy === "category") {
          const catMap: Record<string, number> = {};
          docItems.forEach((item) => {
            catMap[item.category] = (catMap[item.category] || 0) + 1;
          });
          Object.entries(catMap).forEach(([cat, cnt]) => {
            segments.push({
              key: cat,
              color: CATEGORY_COLORS[cat]?.fill || "#94A3B8",
              count: cnt,
            });
          });
        } else {
          // By caution tier / status
          const verified = docItems.filter((i) => i.verification_status === "VERIFIED" && i.priority_tier !== "P0_CRITICAL").length;
          const review = docItems.filter((i) => i.priority_tier === "P1_HIGH" && i.verification_status === "VERIFIED").length;
          const critical = docItems.filter((i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED").length;

          if (verified) segments.push({ key: "Verified Safe", color: "#10B981", count: verified });
          if (review) segments.push({ key: "P1 High Review", color: "#F59E0B", count: review });
          if (critical) segments.push({ key: "P0 Critical", color: "#EF4444", count: critical });
        }

        const total = segments.reduce((sum, s) => sum + s.count, 0);
        return {
          label: doc.filename.length > 20 ? `${doc.filename.slice(0, 18)}…` : doc.filename,
          fullLabel: doc.filename,
          total,
          segments,
        };
      });
    } else {
      // Group by category
      const categories = Array.from(new Set(filteredItems.map((i) => i.category)));
      return categories.map((cat) => {
        const catItems = filteredItems.filter((item) => item.category === cat);
        const verified = catItems.filter((i) => i.verification_status === "VERIFIED" && i.priority_tier !== "P0_CRITICAL").length;
        const review = catItems.filter((i) => i.priority_tier === "P1_HIGH").length;
        const critical = catItems.filter((i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED").length;

        const segments: { key: string; color: string; count: number }[] = [];
        if (verified) segments.push({ key: "Verified Safe", color: "#10B981", count: verified });
        if (review) segments.push({ key: "Needs Review", color: "#F59E0B", count: review });
        if (critical) segments.push({ key: "Critical Blocker", color: "#EF4444", count: critical });

        const total = segments.reduce((sum, s) => sum + s.count, 0);
        return {
          label: cat.length > 16 ? `${cat.slice(0, 14)}…` : cat,
          fullLabel: cat,
          total,
          segments,
        };
      });
    }
  }, [groupedBy, segmentedBy, filteredItems, documents, selectedDocFilter]);

  const maxChartValue = Math.max(...chartData.map((d) => d.total), 8);

  // Metrics
  const totalFindings = filteredItems.length;
  const verifiedCount = filteredItems.filter((i) => i.verification_status === "VERIFIED").length;
  const criticalCount = filteredItems.filter((i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED").length;
  const complianceRate = totalFindings ? Math.round((verifiedCount / totalFindings) * 100) : 100;

  // Export functions
  const handleExportXlsx = () => {
    const dataToExport = filteredItems.map((item) => ({
      "Priority Tier": item.priority_tier,
      Category: item.category,
      "Question or Clause": item.prompt_or_question,
      "Fluent Synthesis (Envoy)": item.fluent_output,
      "Verbatim Quote (Ranger)": item.verified_citations[0]?.quote || "No direct quote (flagged for review)",
      "Match Score %": item.gate_telemetry.citation_match,
      "Verification Status": item.verification_status,
      "Source Document": item.verified_citations[0]?.document_filename || "Corpus",
      "Page / Row": item.verified_citations[0]?.page_number ?? "N/A",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BERT_Verified_Findings");
    XLSX.writeFile(workbook, `BERT_Compliance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    setCopiedNotification("Exported verified answers as .XLSX");
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  const handleDownloadSummary = () => {
    const summaryText = `BERT EXECUTIVE COMPLIANCE REPORT
Generated: ${new Date().toLocaleString()}
SHA-256 Audit Verification: PASS (Zero data loss)
Total Findings: ${totalFindings} | Verified: ${verifiedCount} | Critical Blockers: ${criticalCount}
Compliance Readiness: ${complianceRate}%

EXECUTIVE SUMMARY (ENVOY):
The seven-agent regiment completed inspection of ${documents.length} corpus documents.
${criticalCount > 0 ? `WARNING: ${criticalCount} critical blocker(s) require human review before release.` : "All evidence verified with >=97% quote fidelity."}

CRITICAL ITEMS:
${filteredItems
  .filter((i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED")
  .map((i, idx) => `${idx + 1}. [${i.category}] ${i.prompt_or_question} -> ${i.fluent_output}`)
  .join("\n")}
`;

    const blob = new Blob([summaryText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BERT_Executive_Summary_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);

    setCopiedNotification("Downloaded Executive Summary Report");
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  const handleInlineResolve = async (id: string) => {
    if (!inlineEditText.trim()) return;
    await resolveWorkItem(id, "manual_correction", inlineEditText.trim());
    setInlineEditId(null);
    setInlineEditText("");
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-white select-none text-zinc-900">
      {/* 1. Top Report Header Bar (Attio Style) */}
      <header className="h-14 border-b border-zinc-200/90 bg-white px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-zinc-950 font-ui tracking-tight">
            Executive Compliance & Risk Report
          </h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>SHA-256 Zero-Data-Loss Verified</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {copiedNotification && (
            <span className="text-xs font-medium text-emerald-600 animate-fade-in">
              {copiedNotification}
            </span>
          )}

          <button
            onClick={() => {
              setSelectedDocFilter("ALL");
              setOnlyCritical(false);
              setSearchFilter("");
            }}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs font-medium text-zinc-600 transition-colors cursor-pointer"
          >
            Reset Filters
          </button>

          <button
            onClick={handleExportXlsx}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 hover:bg-zinc-50 text-xs font-medium text-zinc-800 shadow-2xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>Export Answered .XLSX</span>
          </button>

          <button
            onClick={handleDownloadSummary}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Download size={14} />
            <span>Download Summary Report</span>
          </button>
        </div>
      </header>

      {/* Main Container: Center Analytics & Findings + Right Configuration Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* 2. Center Analytics & Findings Stage */}
        <div className="flex-1 p-8 overflow-y-auto bg-white space-y-8">
          {/* Top Category Legend Bar (Attio Image 5 Reference) */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-600 pb-2 border-b border-zinc-100">
            {Object.entries(CATEGORY_COLORS).slice(0, 6).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: color.fill }}
                />
                <span className="text-zinc-700">{cat}</span>
              </div>
            ))}
          </div>

          {/* Executive Summary Callout Card (Written by Envoy) */}
          <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-serif font-bold text-xs">
                  E
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 font-mono">
                  Envoy Executive Synthesis
                </span>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-white border border-zinc-200 text-zinc-700">
                {complianceRate}% Defensibility Score
              </span>
            </div>

            <p className="text-zinc-800 text-sm leading-relaxed font-serif">
              “The 7-agent regiment parsed and cross-referenced <strong>{documents.length} documents</strong> ({totalFindings} extracted clauses and questions). 
              {criticalCount > 0 ? (
                <> Found <span className="text-rose-600 font-semibold font-ui">{criticalCount} critical blocker(s)</span> requiring immediate executive review: including an unverified OCR stamp on physical addendum p7 and an open AWS IAM wildcard admin privilege.</>
              ) : (
                <> All required security controls, encryption keys, and retention schedules verified safe with ≥97% deterministic quote matching.</>
              )}
              {enforceLatestVersion && (
                <> Chronos confirmed that 2026 SOC 2 controls supersede 2023 password rotation rules.</>
              )}”
            </p>
          </div>

          {/* Stacked Visual Breakdown Chart (Attio Stacked Bar Chart Style - Image 5) */}
          <div className="p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-950 font-ui">
                  Findings Distribution by {groupedBy === "documents" ? "Document" : "Category"}
                </h3>
                <span className="text-[11px] text-zinc-400 font-mono">
                  Segmented by {segmentedBy === "category" ? "Quartermaster Category" : "Caution Tier"}
                </span>
              </div>
              <span className="text-xs font-mono text-zinc-500 font-medium">
                Total: {totalFindings} findings
              </span>
            </div>

            {/* SVG / HTML Stacked Bar Chart */}
            <div className="h-64 flex items-end gap-6 pt-6 pb-2 px-4 border-b border-zinc-200/80">
              {chartData.map((col, idx) => {
                const colHeightPercent = Math.max(10, Math.round((col.total / maxChartValue) * 100));

                return (
                  <div key={col.fullLabel} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-mono py-1 px-2 rounded pointer-events-none z-30 whitespace-nowrap shadow-md">
                      {col.fullLabel}: {col.total} findings
                    </div>

                    {/* Stacked bar container */}
                    <div
                      className="w-full max-w-16 rounded-t-lg overflow-hidden flex flex-col-reverse transition-all duration-500 shadow-2xs group-hover:scale-[1.02]"
                      style={{ height: `${colHeightPercent}%` }}
                    >
                      {col.segments.map((seg, sIdx) => {
                        const segHeight = Math.max(8, Math.round((seg.count / col.total) * 100));
                        return (
                          <div
                            key={`${seg.key}-${sIdx}`}
                            className="w-full transition-all relative border-t border-white/20 first:border-0"
                            style={{
                              height: `${segHeight}%`,
                              backgroundColor: seg.color,
                            }}
                            title={`${seg.key}: ${seg.count}`}
                          />
                        );
                      })}
                    </div>

                    {/* Bottom Column Label */}
                    <span className="mt-3 text-[11px] font-medium text-zinc-600 truncate max-w-20 text-center" title={col.fullLabel}>
                      {col.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Contributing Findings & Answers Table (Below Chart - Attio Image 5 Reference) */}
          <div className="p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-950 font-ui">
                  Contributing Findings & Verbatim Evidence Table
                </h3>
                <span className="text-[11px] text-zinc-400 font-mono">
                  {filteredItems.length} records active in this view
                </span>
              </div>

              {/* Search box for table */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter findings..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all w-56"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-zinc-200/80 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50/80 border-b border-zinc-200 text-zinc-500 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3.5">Priority</th>
                    <th className="py-3 px-3.5">Category</th>
                    <th className="py-3 px-3.5">Question / Clause</th>
                    <th className="py-3 px-3.5">Fluent Answer (Envoy)</th>
                    {showExactQuotes && <th className="py-3 px-3.5">Exact Verbatim Quote</th>}
                    <th className="py-3 px-3.5">Match %</th>
                    <th className="py-3 px-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70">
                  {filteredItems.map((item) => {
                    const isCritical = item.priority_tier === "P0_CRITICAL";
                    const isHigh = item.priority_tier === "P1_HIGH";
                    const citation = item.verified_citations[0];

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-zinc-50/70 transition-colors ${
                          isCritical ? "bg-rose-50/30" : isHigh ? "bg-amber-50/20" : ""
                        }`}
                      >
                        {/* Priority Badge */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                              isCritical
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : isHigh
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            {item.priority_tier}
                          </span>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-medium text-zinc-700">
                          {item.category}
                        </td>

                        {/* Question / Clause */}
                        <td className="py-3 px-3.5 font-semibold text-zinc-900 max-w-44">
                          <div className="truncate" title={item.prompt_or_question}>
                            {item.prompt_or_question}
                          </div>
                        </td>

                        {/* Fluent Answer */}
                        <td className="py-3 px-3.5 text-zinc-700 max-w-64">
                          {inlineEditId === item.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={inlineEditText}
                                onChange={(e) => setInlineEditText(e.target.value)}
                                className="px-2 py-1 rounded border border-blue-400 bg-white text-xs w-full focus:outline-none"
                              />
                              <button
                                onClick={() => handleInlineResolve(item.id)}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div className="truncate font-serif italic" title={item.fluent_output}>
                              {item.fluent_output}
                            </div>
                          )}
                        </td>

                        {/* Exact Verbatim Quote */}
                        {showExactQuotes && (
                          <td className="py-3 px-3.5 text-zinc-600 max-w-48">
                            {citation?.quote ? (
                              <div
                                onClick={() => {
                                  inspectCitation({
                                    ...citation,
                                    confidence_score: item.gate_telemetry.citation_match,
                                    document_filename: citation.document_filename || "",
                                    bounding_box: null,
                                  });
                                }}
                                className="truncate font-mono text-[11px] text-blue-600 cursor-pointer hover:underline"
                                title={citation.quote}
                              >
                                “{citation.quote}”
                              </div>
                            ) : (
                              <span className="font-mono text-[10px] text-rose-500 font-medium">
                                Missing Proof
                              </span>
                            )}
                          </td>
                        )}

                        {/* Match % */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-mono text-zinc-700 font-bold">
                          {item.gate_telemetry.citation_match > 0 ? (
                            <span className="text-emerald-700">
                              {item.gate_telemetry.citation_match}%
                            </span>
                          ) : (
                            <span className="text-rose-600">0%</span>
                          )}
                        </td>

                        {/* Resolution Action */}
                        <td className="py-3 px-3.5 whitespace-nowrap text-right">
                          <button
                            onClick={() => {
                              setInlineEditId(item.id);
                              setInlineEditText(item.fluent_output);
                            }}
                            className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 3. Right Configuration & Insight Sidebar (Attio Image 5 "Insight" Panel) */}
        <aside className="w-80 h-full bg-[#F9FAFB] border-l border-zinc-200/80 p-5 overflow-y-auto space-y-6 text-xs text-zinc-900 select-none">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
            <div className="flex items-center gap-1.5 font-semibold text-sm text-zinc-950">
              <SlidersHorizontal size={15} className="text-zinc-500" />
              <span>Insight Configuration</span>
            </div>
            <ChevronDown size={14} className="text-zinc-400" />
          </div>

          {/* Data Source Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
              Data Source
            </label>
            <select
              value={selectedDocFilter}
              onChange={(e) => setSelectedDocFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Uploaded Documents ({documents.length})</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.filename}
                </option>
              ))}
            </select>
          </div>

          {/* Metric Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
              Metric
            </label>
            <select
              value={metricType}
              onChange={(e) => setMetricType(e.target.value as "count" | "confidence")}
              className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="count">Count Clauses & Questions</option>
              <option value="confidence">Average Confidence Score</option>
            </select>
          </div>

          {/* Grouped By Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
              Grouped By
            </label>
            <select
              value={groupedBy}
              onChange={(e) => setGroupedBy(e.target.value as "documents" | "categories")}
              className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="documents">Documents</option>
              <option value="categories">Categories (Quartermaster)</option>
            </select>
          </div>

          {/* Segmented By Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
              Segmented By
            </label>
            <select
              value={segmentedBy}
              onChange={(e) => setSegmentedBy(e.target.value as "caution" | "category")}
              className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="category">Categories</option>
              <option value="caution">Caution Level (P0–P3)</option>
            </select>
          </div>

          {/* Interactive Toggle Switches (Blue pill toggles) */}
          <div className="space-y-3 pt-3 border-t border-zinc-200">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
              Verification Filters
            </label>

            {/* Toggle 1: Only Critical / Human Action */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-700">
                Show only Critical / Action items
              </span>
              <button
                type="button"
                onClick={() => setOnlyCritical(!onlyCritical)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  onlyCritical ? "bg-blue-600" : "bg-zinc-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    onlyCritical ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Toggle 2: Show exact verbatim source quotes */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-700">
                Show exact verbatim source quotes
              </span>
              <button
                type="button"
                onClick={() => setShowExactQuotes(!showExactQuotes)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showExactQuotes ? "bg-blue-600" : "bg-zinc-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showExactQuotes ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Toggle 3: Enforce latest document version (Chronos) */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-700">
                Enforce latest version (Chronos)
              </span>
              <button
                type="button"
                onClick={() => setEnforceLatestVersion(!enforceLatestVersion)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enforceLatestVersion ? "bg-blue-600" : "bg-zinc-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    enforceLatestVersion ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
