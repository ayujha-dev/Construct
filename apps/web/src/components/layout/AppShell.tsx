import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AttioSidebar } from "../navigation/AttioSidebar";
import { WeTransferIconRail } from "../navigation/WeTransferIconRail";
import { WeTransferTopPill } from "../navigation/WeTransferTopPill";
import { ThemeToggle } from "../ui/ThemeToggle";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex overflow-x-clip font-ui">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--accent-brand)] focus:text-[var(--accent-brand-contrast)] focus:text-xs focus:font-semibold focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip to main content
      </a>

      {isLanding ? (
        <div className="w-full min-h-screen flex flex-col">
          <WeTransferIconRail />
          <WeTransferTopPill />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 md:ml-16 min-h-screen min-w-0 overflow-x-clip bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:outline-none"
          >
            {children}
          </main>
        </div>
      ) : (
        <div className="flex w-full h-screen overflow-hidden relative">
          {/* Desktop persistent sidebar */}
          <div className="hidden md:flex shrink-0">
            <AttioSidebar />
          </div>

          {/* Mobile slide-over drawer */}
          {mobileSidebarOpen && (
            <div className="md:hidden fixed inset-0 z-50 flex">
              <div
                role="button"
                tabIndex={0}
                aria-label="Close navigation menu"
                onClick={() => setMobileSidebarOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
                    setMobileSidebarOpen(false);
                  }
                }}
                className="fixed inset-0 bg-black/50 backdrop-blur-2xs cursor-pointer"
              />
              <div className="relative z-10 h-full flex">
                <AttioSidebar onNavigate={() => setMobileSidebarOpen(false)} />
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-label="Close sidebar"
                  className="ml-2 mt-3 h-8 w-8 rounded-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-lg flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none"
          >
            {/* Compact mobile navigation toggle */}
            <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open corpus sidebar"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-[var(--text-primary)] text-xs font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
              >
                <Menu size={14} />
                <span>Corpus &amp; Menu</span>
              </button>
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                BERT Enterprise
              </span>
              <ThemeToggle variant="compact" testId="mobile-shell-theme-toggle" />
            </div>
            {children}
          </main>
        </div>
      )}
    </div>
  );
}
