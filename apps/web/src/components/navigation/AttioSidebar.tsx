import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Layers,
  MinusCircle,
  PencilLine,
  Plus,
  RefreshCw,
  Scale,
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
import { ThemeToggle } from "../ui/ThemeToggle";

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
      return {
        label: "SCN",
        icon: Scan,
        bg: "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]",
      };
    }
    if (chip === "XLSX") {
      return {
        label: "XLS",
        icon: FileSpreadsheet,
        bg: "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]",
      };
    }
    if (chip === "JSON") {
      return {
        label: "JSN",
        icon: FileCode2,
        bg: "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]",
      };
    }
    if (chip === "TXT") {
      return {
        label: "TXT",
        icon: FileText,
        bg: "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]",
      };
    }
    return {
      label: "PDF",
      icon: FileText,
      bg: "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border-[var(--accent-brand-border)]",
    };
  };

  const getDocStatus = (doc: Document): { label: string; style: string; icon: typeof CheckCircle2 } => {
    if (activeJob?.status === "RUNNING" && activeJob.current_document_id === doc.id) {
      return {
        label: "processing",
        style: "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border-[var(--accent-brand-border)]",
        icon: Clock,
      };
    }
    const docItems = workItems.filter((w) => itemMatchesDocumentFilter(w, doc.id));
    if (docItems.some((w) => w.verification_status === "ESCALATED_LEGAL")) {
      return {
        label: "legal",
        style: "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]",
        icon: Scale,
      };
    }
    if (
      docItems.some(
        (w) =>
          w.verification_status === "NEEDS_HUMAN_VERIFICATION" ||
          w.verification_status === "INSUFFICIENT_EVIDENCE"
      ) ||
      doc.processing_status === "FAILED"
    ) {
      return {
        label: "needs input",
        style: "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]",
        icon: AlertTriangle,
      };
    }
    if (docItems.some((w) => w.verification_status === "HUMAN_OVERRIDE")) {
      return {
        label: "override",
        style: "bg-[var(--status-override-soft)] text-[var(--status-override-ink)] border-[var(--status-override-border)]",
        icon: PencilLine,
      };
    }
    if (
      docItems.length > 0 &&
      docItems.every((w) => w.verification_status === "NOT_APPLICABLE")
    ) {
      return {
        label: "n/a",
        style: "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]",
        icon: MinusCircle,
      };
    }
    if (
      doc.processing_status === "VERIFIED" ||
      (docItems.length > 0 && docItems.every((w) => w.verification_status === "VERIFIED"))
    ) {
      return {
        label: "verified",
        style: "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]",
        icon: CheckCircle2,
      };
    }
    return {
      label: "ingested",
      style: "bg-[var(--bg-sunken)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
      icon: FileText,
    };
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
    <aside className="w-56 lg:w-60 h-screen bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex flex-col justify-between shrink-0 text-[var(--text-primary)]">
      {/* Top Workspace Header */}
      <div className="min-h-0 grow shrink basis-0 flex flex-col">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] font-serif text-sm font-bold flex items-center justify-center shrink-0 shadow-xs">
              S
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate text-[var(--text-primary)]">
                ShieldStaff
              </div>
              <span className="text-[10px] text-[var(--text-muted)] font-mono block truncate">
                7-Agent Pipeline
              </span>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="p-3 space-y-1.5 border-b border-[var(--border-subtle)] shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.xlsx,.xls,.csv,.json,.txt,.md"
            aria-label="Upload document or spreadsheet"
            className="hidden focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-[var(--border-strong)] hover:border-[var(--accent-brand-border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)] text-xs font-medium text-[var(--text-primary)] shadow-2xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <Plus size={14} className="text-[var(--text-secondary)]" />
            <span>Upload Document or Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => {
              void loadDemo();
              navigate(`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}`);
              onNavigate?.();
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[var(--accent-brand-soft)] hover:opacity-90 border border-[var(--accent-brand-border)] text-[var(--accent-brand-ink)] text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <Sparkles size={13} className="text-[var(--accent-brand-ink)]" />
            <span>Load Investor Demo Case</span>
          </button>
        </div>

        {/* Main Navigation List */}
        <nav aria-label="Workspace navigation" className="p-2 space-y-0.5 text-xs font-medium shrink-0">
          <NavLink
            to={buildWorkspaceNavUrl()}
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                isActive && location.pathname === "/workspace" && !isCanvasMode
                  ? "bg-[var(--bg-sunken)] text-[var(--text-primary)] font-semibold border border-[var(--border-subtle)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] border border-transparent"
              }`
            }
          >
            <Bot size={16} className="text-[var(--text-secondary)]" />
            <span>Home &amp; Copilot</span>
          </NavLink>

          <NavLink
            to={buildWorkspaceNavUrl("canvas")}
            onClick={() => onNavigate?.()}
            className={() =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                location.pathname === "/workspace" && isCanvasMode
                  ? "bg-[var(--bg-sunken)] text-[var(--text-primary)] font-semibold border border-[var(--border-subtle)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] border border-transparent"
              }`
            }
          >
            <Layers size={16} className="text-[var(--text-secondary)]" />
            <span>Document Canvas</span>
          </NavLink>

          <NavLink
            to="/results"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                isActive && !isAuditTab
                  ? "bg-[var(--bg-sunken)] text-[var(--text-primary)] font-semibold border border-[var(--border-subtle)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] border border-transparent"
              }`
            }
          >
            <BarChart3 size={16} className="text-[var(--text-secondary)]" />
            <span>Results &amp; Reports</span>
          </NavLink>

          <NavLink
            to="/triage"
            data-testid="sidebar-triage-link"
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                isActive || location.pathname === "/triage"
                  ? "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] font-semibold border border-[var(--status-danger-border)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] border border-transparent"
              }`
            }
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={16} className="text-[var(--status-danger-ink)]" />
              <span>Human Escalations</span>
            </div>
            {metrics.needsTriage > 0 && (
              <span
                data-testid="sidebar-triage-badge"
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border border-[var(--status-danger-border)] tabular-nums"
              >
                {metrics.needsTriage}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/results?tab=audit"
            onClick={() => onNavigate?.()}
            className={() =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                isAuditTab
                  ? "bg-[var(--bg-sunken)] text-[var(--text-primary)] font-semibold border border-[var(--border-subtle)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] border border-transparent"
              }`
            }
          >
            <ShieldCheck size={16} className="text-[var(--status-verified-ink)]" />
            <span>SHA-256 Audit Ledger</span>
          </NavLink>
        </nav>

        {/* Active Corpus Section */}
        <div className="px-3 pt-2 grow shrink basis-0 min-h-0 flex flex-col">
          <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider shrink-0">
            <span>Active Corpus</span>
            <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
              {corpusStatus === "loading" && documents.length === 0
                ? "Syncing…"
                : `${documents.length} ${documents.length === 1 ? "file" : "files"}`}
            </span>
          </div>

          {corpusStatus === "error" && (
            <div
              data-testid="corpus-error-banner"
              className="mt-1 mb-1.5 p-2 rounded-lg bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] text-[11px] flex items-center justify-between gap-2 shrink-0"
            >
              <span className="flex items-center gap-1 min-w-0 truncate" title={corpusError ?? "Sync failed"}>
                <AlertTriangle size={12} className="shrink-0 text-[var(--status-danger-ink)]" />
                <span className="truncate">{corpusError || "Corpus sync error"}</span>
              </span>
              <button
                type="button"
                onClick={() => void retryCorpusRefresh()}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] font-semibold text-[10px] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                    className="h-11 rounded-lg bg-[var(--bg-sunken)] animate-pulse border border-[var(--border-subtle)]"
                  />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">
                No files staged yet. Click upload or demo above.
              </div>
            ) : (
              documents.map((doc) => {
                const badge = getFormatBadge(doc);
                const statusBadge = getDocStatus(doc);
                const isSelected = doc.id === selectedFileFilterId;
                const FormatIcon = badge.icon;
                const StatusIcon = statusBadge.icon;

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
                    className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                      isSelected
                        ? "bg-[var(--accent-brand-soft)] text-[var(--text-primary)] font-medium border border-[var(--accent-brand-border)]"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] border border-transparent"
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
                        className="block text-xs leading-tight break-words line-clamp-2 text-[var(--text-primary)]"
                        title={doc.filename}
                      >
                        {doc.filename}
                      </span>
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0 rounded border font-semibold ${statusBadge.style}`}
                        >
                          <StatusIcon size={9} aria-hidden="true" />
                          <span>{statusBadge.label}</span>
                        </span>
                        <span className="text-[var(--text-muted)] shrink-0 tabular-nums">
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

      {/* Bottom Live Status & Theme Footer */}
      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-sunken)] shrink-0 space-y-2">
        <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xs">
          <div className="flex items-center justify-between text-[11px] mb-1 font-medium text-[var(--text-secondary)]">
            <span>Review Progress</span>
            <span className="font-mono text-[var(--text-primary)] font-bold tabular-nums">
              {metrics.machineVerified}/{metrics.total} Verified
            </span>
          </div>
          <div className="w-full h-1.5 bg-[var(--bg-sunken)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--status-verified-solid)] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {(metrics.humanOverride > 0 ||
            metrics.escalatedLegal > 0 ||
            metrics.notApplicable > 0 ||
            metrics.unresolved > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1 text-[9px] font-mono text-[var(--text-muted)] tabular-nums">
              {metrics.humanOverride > 0 && <span>{metrics.humanOverride} override</span>}
              {metrics.escalatedLegal > 0 && <span>· {metrics.escalatedLegal} legal</span>}
              {metrics.notApplicable > 0 && <span>· {metrics.notApplicable} n/a</span>}
              {metrics.unresolved > 0 && <span>· {metrics.unresolved} open</span>}
            </div>
          )}
        </div>

        <ThemeToggle variant="sidebar" testId="sidebar-theme-toggle" />

        <button
          type="button"
          data-testid="sidebar-export-xlsx-btn"
          disabled={!canExport}
          title={exportBlockedReason}
          aria-label={exportBlockedReason}
          onClick={exportXlsx}
          className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] focus-visible:ring-offset-1 ${
            canExport
              ? "bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] text-[var(--accent-brand-contrast)] cursor-pointer"
              : "bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed"
          }`}
        >
          <Download size={13} />
          <span>Export Completed .XLSX</span>
        </button>
        {!canExport && (
          <p className="text-[10px] text-[var(--text-muted)] text-center leading-tight">
            {exportBlockedReason}
          </p>
        )}
      </div>
    </aside>
  );
}
