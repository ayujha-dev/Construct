import {
  AlertTriangle,
  BarChart3,
  Bot,
  HelpCircle,
  Layers,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { computeWorkItemMetrics } from "../../lib/workItemMetrics";
import { useBertStore } from "../../store/useBertStore";
import { ThemeToggle } from "../ui/ThemeToggle";

export function WeTransferIconRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workItems, activeJob, workspaceId, wsStatus, backendAvailable } = useBertStore();
  const running = activeJob?.status === "RUNNING";
  const { needsTriage } = computeWorkItemMetrics(workItems);
  const wsQuery = `?workspace=${encodeURIComponent(workspaceId || "default")}`;

  const isUploadActive = location.pathname === "/";
  const isCanvasActive =
    location.pathname === "/workspace" && location.search.includes("mode=canvas");
  const isCopilotActive = location.pathname === "/workspace" && !isCanvasActive;
  const isTriageActive = location.pathname === "/triage";
  const isAuditActive =
    location.pathname === "/results" && location.search.includes("tab=audit");
  const isReportsActive = location.pathname === "/results" && !isAuditActive;

  const railStatusTitle =
    wsStatus === "connected"
      ? "System Status: Live WebSocket Connected"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "System Status: WebSocket Connecting"
        : backendAvailable
          ? "System Status: API Connected (REST)"
          : "System Status: Offline Local Simulation Mode";

  const railDotColor =
    wsStatus === "connected"
      ? "bg-[var(--status-verified-solid)]"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "bg-[var(--status-warning-solid)] animate-pulse"
        : backendAvailable
          ? "bg-[var(--accent-brand)]"
          : "bg-[var(--status-neutral-solid)]";

  const itemClass = (active: boolean) =>
    `flex flex-col items-center gap-1 p-2 rounded-xl transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
      active
        ? "text-[var(--accent-brand-ink)] bg-[var(--accent-brand-soft)] font-semibold border border-[var(--accent-brand-border)]"
        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] border border-transparent"
    }`;

  return (
    <aside
      aria-label="Primary rail navigation"
      className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] z-40 flex-col items-center justify-between py-4"
    >
      {/* Brand Monogram */}
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="w-10 h-10 rounded-2xl bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] font-serif text-xl font-bold flex items-center justify-center shadow-sm hover:scale-105 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          title="BERT Document Intelligence"
          aria-label="BERT Home"
        >
          B
        </button>
        <span className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] font-semibold uppercase">
          BERT
        </span>
      </div>

      {/* Main Rail Navigation */}
      <nav aria-label="Quick views" className="flex flex-col items-center gap-2.5 my-auto">
        <Link to="/" className={itemClass(isUploadActive)} title="Upload & Overview">
          <UploadCloud size={18} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Upload</span>
        </Link>

        <Link
          to={`/workspace${wsQuery}`}
          className={itemClass(isCopilotActive)}
          title="Live Review Copilot"
        >
          {running && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--status-verified-solid)] animate-ping"
              aria-hidden="true"
            />
          )}
          <Bot size={18} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Copilot</span>
        </Link>

        <Link
          to={`/workspace${wsQuery}&mode=canvas`}
          className={itemClass(isCanvasActive)}
          title="Bento Document Canvas"
        >
          <Layers size={18} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Canvas</span>
        </Link>

        <Link
          to="/triage"
          className={itemClass(isTriageActive)}
          title="Human Triage Queue"
        >
          {needsTriage > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-[var(--status-danger-solid)] text-white rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums">
              {needsTriage}
            </span>
          )}
          <AlertTriangle size={18} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Triage</span>
        </Link>

        <Link
          to="/results"
          className={itemClass(isReportsActive)}
          title="Executive Reports"
        >
          <BarChart3 size={18} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Reports</span>
        </Link>

        <Link
          to="/results?tab=audit"
          className={itemClass(isAuditActive)}
          title="SHA-256 Audit Ledger"
        >
          <ShieldCheck size={18} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Audit</span>
        </Link>
      </nav>

      {/* Bottom Status, Theme Toggle & Audit Link */}
      <div className="flex flex-col items-center gap-2.5">
        <ThemeToggle variant="rail" testId="rail-theme-toggle" />
        <button
          type="button"
          data-testid="rail-connection-status"
          onClick={() => navigate(`/workspace${wsQuery}`)}
          className="w-8 h-8 rounded-full bg-[var(--bg-sunken)] hover:bg-[var(--accent-brand-soft)] border border-[var(--border-subtle)] text-[var(--text-secondary)] flex items-center justify-center text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          title={railStatusTitle}
          aria-label={railStatusTitle}
        >
          <span className={`w-2 h-2 rounded-full ${railDotColor}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => navigate("/results?tab=audit")}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
          title="Audit & Verification Ledger"
          aria-label="Open SHA-256 Audit Ledger"
        >
          <HelpCircle size={17} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
