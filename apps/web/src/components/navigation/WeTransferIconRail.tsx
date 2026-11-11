import { ArrowUpRight, BarChart3, Bot, HelpCircle, Layers, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useBertStore } from "../../store/useBertStore";

export function WeTransferIconRail() {
  const navigate = useNavigate();
  const { workItems, activeJob } = useBertStore();
  const running = activeJob?.status === "RUNNING";
  const criticalCount = workItems.filter((i) => i.priority_tier === "P0_CRITICAL").length;

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-16 bg-white border-r border-zinc-200/90 z-40 flex flex-col items-center justify-between py-4 select-none">
      {/* Brand Monogram */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => navigate("/")}
          className="w-10 h-10 rounded-2xl bg-zinc-900 text-white font-serif text-xl font-bold flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
          title="BERT Document Intelligence"
        >
          B
        </button>
        <span className="text-[9px] font-mono tracking-widest text-zinc-400 font-semibold uppercase">BERT</span>
      </div>

      {/* Main Rail Navigation */}
      <nav className="flex flex-col items-center gap-4 my-auto">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-zinc-900 transition-colors ${
              isActive ? "text-blue-600 bg-blue-50/80 font-medium" : ""
            }`
          }
          title="Upload & Overview"
        >
          <UploadCloud size={19} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Upload</span>
        </NavLink>

        <NavLink
          to="/workspace"
          end
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-zinc-900 transition-colors relative ${
              isActive ? "text-blue-600 bg-blue-50/80 font-medium" : ""
            }`
          }
          title="Live Review Copilot"
        >
          {running && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          )}
          <Bot size={19} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Copilot</span>
        </NavLink>

        <NavLink
          to="/workspace?mode=canvas"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-zinc-900 transition-colors ${
              isActive ? "text-blue-600 bg-blue-50/80 font-medium" : ""
            }`
          }
          title="Bento Document Canvas"
        >
          <Layers size={19} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Canvas</span>
        </NavLink>

        <NavLink
          to="/results"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-zinc-900 transition-colors ${
              isActive ? "text-blue-600 bg-blue-50/80 font-medium" : ""
            }`
          }
          title="Executive Reports"
        >
          <BarChart3 size={19} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Reports</span>
        </NavLink>

        <NavLink
          to="/results?tab=audit"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-zinc-900 transition-colors relative ${
              isActive ? "text-blue-600 bg-blue-50/80 font-medium" : ""
            }`
          }
          title="SHA-256 Audit Ledger"
        >
          {criticalCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
              {criticalCount}
            </span>
          )}
          <ShieldCheck size={19} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Audit</span>
        </NavLink>
      </nav>

      {/* Bottom Status / Help */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => navigate("/workspace")}
          className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center text-xs transition-colors"
          title="System Status: Verified Gate Online"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        </button>
        <button
          onClick={() => window.open("https://github.com", "_blank")}
          className="text-zinc-400 hover:text-zinc-600 transition-colors p-1"
          title="Documentation & Help"
        >
          <HelpCircle size={17} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
