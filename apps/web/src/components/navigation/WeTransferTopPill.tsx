import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBertStore } from "../../store/useBertStore";

export function WeTransferTopPill() {
  const navigate = useNavigate();
  const { loadDemo, activeJob } = useBertStore();

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleDemo = async () => {
    await loadDemo();
    navigate("/workspace");
  };

  return (
    <div className="fixed top-5 right-6 z-40 flex items-center gap-3">
      {/* Floating Navigation Pill */}
      <nav className="hidden md:flex items-center gap-1 rounded-full bg-white/95 backdrop-blur-md shadow-sm border border-zinc-200/90 px-4 py-1.5 text-xs font-medium text-zinc-600">
        <button
          onClick={() => handleScrollTo("use-cases")}
          className="px-3 py-1 rounded-full hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors cursor-pointer"
        >
          Use Cases
        </button>
        <button
          onClick={() => handleScrollTo("how-it-works")}
          className="px-3 py-1 rounded-full hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors cursor-pointer"
        >
          How It Works
        </button>
        <button
          onClick={() => handleScrollTo("security-gate")}
          className="px-3 py-1 rounded-full hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors cursor-pointer"
        >
          Security Gate
        </button>
        <button
          onClick={handleDemo}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-blue-600 hover:bg-blue-50 font-semibold transition-colors cursor-pointer"
        >
          <Sparkles size={13} />
          Demo Case
        </button>
      </nav>

      {/* Workspace Indicator Pill */}
      <div className="flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-md shadow-sm border border-zinc-200/90 px-3.5 py-1.5 text-xs text-zinc-800 font-medium">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-semibold text-zinc-900">BERT Enterprise</span>
        <span className="text-zinc-400 font-normal">·</span>
        <span className="text-zinc-500 text-[11px]">7-Agent Local Mode</span>
      </div>
    </div>
  );
}
