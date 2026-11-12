import { Menu, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LANDING_NAV_ITEMS, scrollToSection } from "../../lib/landingContent";
import { useBertStore } from "../../store/useBertStore";

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
      ? "bg-emerald-600"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "bg-amber-600 animate-pulse"
        : backendAvailable
          ? "bg-blue-600"
          : "bg-zinc-600";

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
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-zinc-200 px-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => handleAnchor("hero")}
          className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
          aria-label="BERT Overview"
        >
          <span className="w-8 h-8 rounded-xl bg-[#18181B] text-white font-serif text-base font-bold flex items-center justify-center shrink-0">
            B
          </span>
          <span className="text-xs font-semibold text-zinc-900 truncate">BERT Enterprise</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div
            data-testid="top-pill-connection-status-mobile"
            className="flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-800 font-medium"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotTone}`} />
            <span>Local</span>
          </div>

          <button
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-nav"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-2 rounded-lg border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
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
          className="md:hidden fixed top-14 left-0 right-0 z-40 bg-white border-b border-zinc-200 shadow-lg px-4 py-3 space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            {LANDING_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAnchor(item.id)}
                className="text-left px-3 py-2 rounded-lg bg-zinc-50 hover:bg-zinc-100 text-xs font-medium text-zinc-900 border border-zinc-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void handleDemo()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-xs font-semibold text-blue-800 border border-blue-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Sparkles size={13} />
              <span>Demo Case</span>
            </button>
          </div>
          <div className="pt-2 border-t border-zinc-200 flex flex-wrap gap-2 text-xs">
            <Link
              to="/workspace"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2.5 py-1.5 rounded-md bg-zinc-100 text-zinc-900 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Workspace
            </Link>
            <Link
              to="/triage"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2.5 py-1.5 rounded-md bg-zinc-100 text-zinc-900 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Triage
            </Link>
            <Link
              to="/results"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2.5 py-1.5 rounded-md bg-zinc-100 text-zinc-900 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Results
            </Link>
            <Link
              to="/results?tab=audit"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2.5 py-1.5 rounded-md bg-zinc-100 text-zinc-900 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
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
          className="pointer-events-auto flex items-center gap-0.5 lg:gap-1 rounded-full bg-white shadow-sm border border-zinc-200 px-2.5 lg:px-3.5 py-1.5 text-xs font-medium text-zinc-800 max-w-full overflow-x-auto no-scrollbar"
        >
          {LANDING_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleAnchor(item.id)}
              className="px-2 lg:px-2.5 py-1 rounded-full text-zinc-800 hover:text-zinc-950 hover:bg-zinc-100 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void handleDemo()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-blue-800 bg-blue-50 hover:bg-blue-100 font-semibold transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Sparkles size={13} />
            <span>Demo Case</span>
          </button>
        </nav>

        <div
          data-testid="top-pill-connection-status"
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-white shadow-sm border border-zinc-200 px-3 py-1.5 text-xs text-zinc-900 font-medium shrink-0"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotTone}`} />
          <span className="font-semibold text-zinc-900">BERT Enterprise</span>
          <span className="hidden xl:inline text-zinc-600 font-normal">·</span>
          <span className="hidden xl:inline text-zinc-700 text-[11px]">{statusLabel}</span>
        </div>
      </div>
    </>
  );
}
