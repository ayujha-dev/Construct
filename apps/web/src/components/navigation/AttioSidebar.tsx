import {
  AlertTriangle,
  BarChart3,
  Bot,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Scan,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { inferSourceChip } from "../../lib/evidenceLocators";
import { computeWorkItemMetrics, itemMatchesDocumentFilter } from "../../lib/workItemMetrics";
import { useBertStore } from "../../store/useBertStore";
import type { Document } from "../../types/bert";

interface AttioSidebarProps {
  onNavigate?: () => void;
}

export function AttioSidebar({ onNavigate }: AttioSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    documents,
    workItems,
    activeJob,
    isSimulating,
    hasCompletedRun,
    corpusStatus,
    corpusError,
    workspaceId,
    selectedFileFilterId,
    setSelectedFileFilter,
    setActiveInspectorTab,
    retryCorpusRefresh,
    uploadFile,
    loadDemo,
  } = useBertStore();

  const isCanvasMode = location.search.includes("mode=canvas");
  const isAuditTab = location.search.includes("tab=audit");

  const metrics = computeWorkItemMetrics(workItems);
  const progressPct =
    metrics.total > 0 ? Math.min(100, Math.round((metrics.machineVerified / metrics.total) * 100)) : 0;
  const isRunning =
    isSimulating || activeJob?.status === "RUNNING" || activeJob?.status === "RESUMING";
  const canExport = !isRunning && metrics.total > 0 && hasCompletedRun;
  const exportBlockedReason = isRunning
    ? "Review run in progress — export unlocks on completion"
    : metrics.total === 0
      ? "Load or upload a corpus first"
      : !hasCompletedRun
        ? "Complete a review run before exporting"
        : "Export completed .XLSX report";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void uploadFile(file);
      navigate(`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}`);
      onNavigate?.();
    }
  };

  const getFormatBadge = (doc: Document) => {
    const chip = inferSourceChip(doc, null);
    if (chip === "SCAN") {
      return { label: "SCN", icon: Scan, bg: "bg-rose-100 text-rose-800 border-rose-200" };
    }
    if (chip === "XLSX") {
      return { label: "XLS", icon: FileSpreadsheet, bg: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    }
    if (chip === "JSON") {
      return { label: "JSN", icon: FileCode2, bg: "bg-amber-100 text-amber-900 border-amber-200" };
    }
    if (chip === "TXT") {
      return { label: "TXT", icon: FileText, bg: "bg-zinc-200 text-zinc-800 border-zinc-300" };
    }
    return { label: "PDF", icon: FileText, bg: "bg-blue-100 text-blue-800 border-blue-200" };
  };

  const getDocStatus = (doc: Document): { label: string; style: string } => {
    if (activeJob?.status === "RUNNING" && activeJob.current_document_id === doc.id) {
      return { label: "processing", style: "bg-blue-100 text-blue-800 border-blue-200" };
    }
    const docItems = workItems.filter((w) => itemMatchesDocumentFilter(w, doc.id));
    if (docItems.some((w) => w.verification_status === "ESCALATED_LEGAL")) {
      return { label: "legal", style: "bg-amber-100 text-amber-950 border-amber-300" };
    }
    if (
      docItems.some(
        (w) =>
          w.verification_status === "NEEDS_HUMAN_VERIFICATION" ||
          w.verification_status === "INSUFFICIENT_EVIDENCE"
      ) ||
      doc.processing_status === "FAILED"
    ) {
      return { label: "needs input", style: "bg-rose-100 text-rose-900 border-rose-200" };
    }
    if (docItems.some((w) => w.verification_status === "HUMAN_OVERRIDE")) {
      return { label: "override", style: "bg-purple-100 text-purple-950 border-purple-300" };
    }
    if (
      docItems.length > 0 &&
      docItems.every((w) => w.verification_status === "NOT_APPLICABLE")
    ) {
      return { label: "n/a", style: "bg-slate-100 text-slate-900 border-slate-300" };
    }
    if (
      doc.processing_status === "VERIFIED" ||
      (docItems.length > 0 && docItems.every((w) => w.verification_status === "VERIFIED"))
    ) {
      return { label: "verified", style: "bg-emerald-100 text-emerald-900 border-emerald-200" };
    }
    return { label: "ingested", style: "bg-zinc-100 text-zinc-700 border-zinc-200" };
  };

  const buildWorkspaceNavUrl = (mode?: "canvas") => {
    const params = new URLSearchParams();
    params.set("workspace", workspaceId || "default");
    if (selectedFileFilterId) params.set("file", selectedFileFilterId);
    if (mode === "canvas") params.set("mode", "canvas");
    return `/workspace?${params.toString()}`;
  };

  const exportXlsx = () => {
    if (!canExport) return;
    navigate("/results?export=1");
    onNavigate?.();
  };

  return (
    <aside className="w-56 lg:w-60 h-screen bg-[#FFFFFF] border-r border-zinc-200/80 flex flex-col justify-between shrink-0 text-zinc-900">
      {/* Top Workspace Header */}
      <div className="min-h-0 grow shrink basis-0 flex flex-col">
        <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-200/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#18181B] text-white font-serif text-sm font-bold flex items-center justify-center shrink-0 shadow-xs">
              B
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate text-zinc-900">BERT Compliance</div>
              <span className="text-[10px] text-zinc-600 font-mono block truncate">
                7-Agent Regiment
              </span>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="p-3 space-y-1.5 border-b border-zinc-200/60 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.xlsx,.xls,.csv,.json,.txt,.md"
            aria-label="Upload document or spreadsheet"
            className="hidden focus-visible:ring-2 focus-visible:ring-blue-600"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-800 shadow-2xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Plus size={14} className="text-zinc-700" />
            <span>Upload Document or Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => {
              void loadDemo();
              navigate(`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}`);
              onNavigate?.();
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Sparkles size={13} className="text-blue-700" />
            <span>Load Investor Demo Case</span>
          </button>
        </div>

        {/* Main Navigation List */}
        <nav aria-label="Workspace navigation" className="p-2 space-y-0.5 text-xs font-medium shrink-0">
          <NavLink
            to={buildWorkspaceNavUrl()}
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isActive && location.pathname === "/workspace" && !isCanvasMode
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-700 hover:text-zinc-950 hover:bg-zinc-50"
              }`
            }
          >
            <Bot size={16} className="text-zinc-600" />
            <span>Home & Copilot</span>
          </NavLink>

          <NavLink
            to={buildWorkspaceNavUrl("canvas")}
            onClick={() => onNavigate?.()}
            className={() =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                location.pathname === "/workspace" && isCanvasMode
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-700 hover:text-zinc-950 hover:bg-zinc-50"
              }`
            }
          >
            <Layers size={16} className="text-zinc-600" />
            <span>Document Canvas</span>
          </NavLink>

          <NavLink
            to="/results"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isActive && !isAuditTab
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-700 hover:text-zinc-950 hover:bg-zinc-50"
              }`
            }
          >
            <BarChart3 size={16} className="text-zinc-600" />
            <span>Results & Reports</span>
          </NavLink>

          <NavLink
            to="/results?filter=escalations"
            onClick={() => onNavigate?.()}
            className="flex items-center justify-between px-3 py-2 rounded-lg text-zinc-700 hover:text-zinc-950 hover:bg-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={16} className="text-rose-700" />
              <span>Human Escalations</span>
            </div>
            {metrics.needsTriage > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-200">
                {metrics.needsTriage}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/results?tab=audit"
            onClick={() => onNavigate?.()}
            className={() =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isAuditTab
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-700 hover:text-zinc-950 hover:bg-zinc-50"
              }`
            }
          >
            <ShieldCheck size={16} className="text-emerald-700" />
            <span>SHA-256 Audit Ledger</span>
          </NavLink>
        </nav>

        {/* Active Corpus Section */}
        <div className="px-3 pt-2 grow shrink basis-0 min-h-0 flex flex-col">
          <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0">
            <span>Active Corpus</span>
            <span className="font-mono text-[10px] text-zinc-600">
              {corpusStatus === "loading" && documents.length === 0
                ? "Syncing…"
                : `${documents.length} ${documents.length === 1 ? "file" : "files"}`}
            </span>
          </div>

          {corpusStatus === "error" && (
            <div
              data-testid="corpus-error-banner"
              className="mt-1 mb-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px] flex items-center justify-between gap-2 shrink-0"
            >
              <span className="flex items-center gap-1 min-w-0 truncate" title={corpusError ?? "Sync failed"}>
                <AlertTriangle size={12} className="shrink-0 text-rose-700" />
                <span className="truncate">{corpusError || "Corpus sync error"}</span>
              </span>
              <button
                type="button"
                onClick={() => void retryCorpusRefresh()}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-rose-300 text-rose-900 font-semibold text-[10px] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <RefreshCw size={10} />
                <span>Retry</span>
              </button>
            </div>
          )}

          <div className="mt-1 space-y-1 grow shrink basis-0 overflow-y-auto pr-0.5">
            {corpusStatus === "loading" && documents.length === 0 ? (
              <div data-testid="corpus-skeleton" className="space-y-1.5 px-1 py-1">
                {[1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="h-11 rounded-lg bg-zinc-100 animate-pulse border border-zinc-200/70"
                  />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-zinc-600">
                No files staged yet. Click upload or demo above.
              </div>
            ) : (
              documents.map((doc) => {
                const badge = getFormatBadge(doc);
                const statusBadge = getDocStatus(doc);
                const isSelected = doc.id === selectedFileFilterId;
                const FormatIcon = badge.icon;

                return (
                  <button
                    key={doc.id}
                    type="button"
                    data-testid="corpus-file-item"
                    title={doc.filename}
                    onClick={() => {
                      setSelectedFileFilter(doc.id);
                      if (badge.label === "XLS" || badge.label === "JSN" || badge.label === "TXT") {
                        setActiveInspectorTab("visual");
                      }
                      if (location.pathname !== "/workspace") {
                        const params = new URLSearchParams();
                        params.set("workspace", workspaceId || "default");
                        params.set("file", doc.id);
                        navigate(`/workspace?${params.toString()}`);
                      }
                      onNavigate?.();
                    }}
                    className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isSelected
                        ? "bg-blue-50 text-zinc-950 font-medium border border-blue-300"
                        : "text-zinc-800 hover:bg-zinc-50 border border-transparent"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-md font-mono text-[9px] font-bold border flex flex-col items-center justify-center shrink-0 mt-0.5 ${badge.bg}`}
                      title={badge.label}
                    >
                      <FormatIcon size={11} />
                    </span>

                    <div className="grow shrink basis-0 min-w-0 space-y-1">
                      <span
                        className="block text-xs leading-tight break-words line-clamp-2 text-zinc-900"
                        title={doc.filename}
                      >
                        {doc.filename}
                      </span>
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                        <span className={`px-1.5 py-0 rounded border font-semibold ${statusBadge.style}`}>
                          {statusBadge.label}
                        </span>
                        <span className="text-zinc-600 shrink-0">
                          {doc.total_ast_nodes} nodes
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Live Status Footer */}
      <div className="p-3 border-t border-zinc-200/80 bg-zinc-50/70 shrink-0">
        <div className="mb-2 p-2 rounded-lg bg-white border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] mb-1 font-medium text-zinc-700">
            <span>Review Progress</span>
            <span className="font-mono text-zinc-900 font-bold">
              {metrics.machineVerified}/{metrics.total} Verified
            </span>
          </div>
          <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {(metrics.humanOverride > 0 || metrics.escalatedLegal > 0 || metrics.notApplicable > 0 || metrics.unresolved > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1 text-[9px] font-mono text-zinc-700">
              {metrics.humanOverride > 0 && <span>{metrics.humanOverride} override</span>}
              {metrics.escalatedLegal > 0 && <span>· {metrics.escalatedLegal} legal</span>}
              {metrics.notApplicable > 0 && <span>· {metrics.notApplicable} n/a</span>}
              {metrics.unresolved > 0 && <span>· {metrics.unresolved} open</span>}
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid="sidebar-export-xlsx-btn"
          disabled={!canExport}
          title={exportBlockedReason}
          aria-label={exportBlockedReason}
          onClick={exportXlsx}
          className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
            canExport
              ? "bg-[#1D4ED8] hover:bg-[#1E40AF] text-white cursor-pointer"
              : "bg-zinc-200 text-zinc-600 cursor-not-allowed"
          }`}
        >
          <Download size={13} />
          <span>Export Completed .XLSX</span>
        </button>
        {!canExport && (
          <p className="mt-1 text-[10px] text-zinc-600 text-center leading-tight">
            {exportBlockedReason}
          </p>
        )}
      </div>
    </aside>
  );
}
