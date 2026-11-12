import { Menu, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LANDING_NAV_ITEMS, scrollToSection } from "../../lib/landingContent";
import { useBertStore } from "../../store/useBertStore";
import { ThemeToggle } from "../ui/ThemeToggle";

export function WeTransferTopPill() {
  const navigate = useNavigate();
  const { loadDemo, workspaceId, wsStatus, backendAvailable } = useBertStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const statusLabel =
    wsStatus === "connected"
      ? "7-Agent Live Stream"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "WebSocket Connecting…"
        : backendAvailable
          ? "API Connected"
          : "7-Agent Local Mode";

  const dotTone =
    wsStatus === "connected"
      ? "bg-[var(--status-verified-solid)]"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "bg-[var(--status-warning-solid)] animate-pulse"
        : backendAvailable
          ? "bg-[var(--accent-brand)]"
          : "bg-[var(--status-neutral-solid)]";

  const handleAnchor = (id: string) => {
    setMobileMenuOpen(false);
    scrollToSection(id);
  };

  const handleDemo = async () => {
    setMobileMenuOpen(false);
    await loadDemo();
    navigate(`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}`);
  };

  return (
    <>
      {/* Mobile Header Bar (< md) */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => handleAnchor("hero")}
          className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] cursor-pointer"
          aria-label="BERT Overview"
        >
          <span className="w-8 h-8 rounded-xl bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] font-serif text-base font-bold flex items-center justify-center shrink-0">
            B
          </span>
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
            BERT Enterprise
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <div
            data-testid="top-pill-connection-status-mobile"
            className="flex items-center gap-1.5 rounded-full bg-[var(--bg-sunken)] border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-primary)] font-medium"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotTone}`} aria-hidden="true" />
            <span>Local</span>
          </div>

          <ThemeToggle variant="compact" testId="mobile-top-pill-theme-toggle" />

          <button
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-nav"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </header>

      {/* Mobile Dropdown Navigation Panel */}
      {mobileMenuOpen && (
        <nav
          id="landing-mobile-nav"
          aria-label="Mobile landing navigation"
          className="md:hidden fixed top-14 left-0 right-0 z-40 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shadow-lg px-4 py-3 space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            {LANDING_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAnchor(item.id)}
                className="text-left px-3 py-2 rounded-lg bg-[var(--bg-sunken)] hover:bg-[var(--accent-brand-soft)] text-xs font-medium text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void handleDemo()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent-brand-soft)] hover:opacity-90 text-xs font-semibold text-[var(--accent-brand-ink)] border border-[var(--accent-brand-border)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              <Sparkles size={13} />
              <span>Demo Case</span>
            </button>
          </div>
          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap gap-2 text-xs">
            <Link
              to="/workspace"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2.5 py-1.5 rounded-md bg-[var(--bg-sunken)] text-[var(--text-primary)] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              Workspace
            </Link>
            <Link
              to="/triage"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2.5 py-1.5 rounded-md bg-[var(--bg-sunken)] text-[var(--text-primary)] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              Triage
            </Link>
            <Link
              to="/results"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2.5 py-1.5 rounded-md bg-[var(--bg-sunken)] text-[var(--text-primary)] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              Results
            </Link>
            <Link
              to="/results?tab=audit"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2.5 py-1.5 rounded-md bg-[var(--bg-sunken)] text-[var(--text-primary)] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              Audit Ledger
            </Link>
          </div>
        </nav>
      )}

      {/* Tablet & Desktop Floating Pill (>= md) */}
      <div className="hidden md:flex fixed top-4 left-20 right-4 z-40 items-center justify-end gap-2.5 pointer-events-none">
        <nav
          aria-label="Landing section navigation"
          className="pointer-events-auto flex items-center gap-0.5 lg:gap-1 rounded-full bg-[var(--bg-surface)] shadow-sm border border-[var(--border-subtle)] px-2.5 lg:px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] max-w-full overflow-x-auto no-scrollbar"
        >
          {LANDING_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleAnchor(item.id)}
              className="px-2 lg:px-2.5 py-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void handleDemo()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[var(--accent-brand-ink)] bg-[var(--accent-brand-soft)] hover:opacity-90 font-semibold transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <Sparkles size={13} />
            <span>Demo Case</span>
          </button>
        </nav>

        <div
          data-testid="top-pill-connection-status"
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-[var(--bg-surface)] shadow-sm border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] font-medium shrink-0"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotTone}`} aria-hidden="true" />
          <span className="font-semibold text-[var(--text-primary)]">BERT Enterprise</span>
          <span className="hidden xl:inline text-[var(--text-muted)] font-normal">·</span>
          <span className="hidden xl:inline text-[var(--text-secondary)] text-[11px]">
            {statusLabel}
          </span>
        </div>

        <ThemeToggle variant="pill" testId="top-pill-theme-toggle" className="shrink-0" />
      </div>
    </>
  );
}
