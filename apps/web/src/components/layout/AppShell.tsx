import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AttioSidebar } from "../navigation/AttioSidebar";
import { WeTransferIconRail } from "../navigation/WeTransferIconRail";
import { WeTransferTopPill } from "../navigation/WeTransferTopPill";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 flex overflow-x-clip font-ui">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#1D4ED8] focus:text-white focus:text-xs focus:font-semibold focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
            className="flex-1 md:ml-16 min-h-screen min-w-0 overflow-x-clip focus:outline-none"
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
                className="fixed inset-0 bg-zinc-950/40 backdrop-blur-2xs cursor-pointer"
              />
              <div className="relative z-10 h-full flex">
                <AttioSidebar onNavigate={() => setMobileSidebarOpen(false)} />
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-label="Close sidebar"
                  className="ml-2 mt-3 h-8 w-8 rounded-full bg-white text-zinc-900 shadow-lg flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white focus:outline-none"
          >
            {/* Compact mobile navigation toggle */}
            <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-zinc-200 bg-white shrink-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open corpus sidebar"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-800 text-xs font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <Menu size={14} />
                <span>Corpus & Menu</span>
              </button>
              <span className="text-xs font-semibold text-zinc-900">BERT Enterprise</span>
            </div>
            {children}
          </main>
        </div>
      )}
    </div>
  );
}
