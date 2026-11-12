import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBertStore } from "../../store/useBertStore";

export function WeTransferTopPill() {
  const navigate = useNavigate();
  const { loadDemo, workspaceId, wsStatus, backendAvailable } = useBertStore();

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
        ? "bg-amber-500 animate-pulse"
        : backendAvailable
          ? "bg-blue-600"
          : "bg-zinc-500";

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleDemo = async () => {
    await loadDemo();
    navigate(`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}`);
  };

  return (
    <div className="fixed top-4 right-4 sm:top-5 sm:right-6 z-40 flex items-center gap-3 max-w-[calc(100vw-2rem)]">
      {/* Floating Navigation Pill */}
      <nav
        aria-label="Landing section navigation"
        className="hidden md:flex items-center gap-1 rounded-full bg-white/95 backdrop-blur-md shadow-sm border border-zinc-200/90 px-4 py-1.5 text-xs font-medium text-zinc-700"
      >
        <button
          type="button"
          onClick={() => handleScrollTo("use-cases")}
          className="px-3 py-1 rounded-full hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Use Cases
        </button>
        <button
          type="button"
          onClick={() => handleScrollTo("how-it-works")}
          className="px-3 py-1 rounded-full hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          How It Works
        </button>
        <button
          type="button"
          onClick={() => handleScrollTo("security-gate")}
          className="px-3 py-1 rounded-full hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Security Gate
        </button>
        <button
          type="button"
          onClick={() => void handleDemo()}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-blue-700 hover:bg-blue-50 font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Sparkles size={13} />
          <span>Demo Case</span>
        </button>
      </nav>

      {/* Workspace Indicator Pill */}
      <div
        data-testid="top-pill-connection-status"
        className="flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-md shadow-sm border border-zinc-200/90 px-3 py-1.5 text-xs text-zinc-800 font-medium shrink-0"
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotTone}`} />
        <span className="font-semibold text-zinc-900">BERT Enterprise</span>
        <span className="hidden sm:inline text-zinc-600 font-normal">·</span>
        <span className="hidden sm:inline text-zinc-700 text-[11px]">{statusLabel}</span>
      </div>
    </div>
  );
}
