import { BarChart3, Bot, HelpCircle, Layers, ShieldCheck, UploadCloud } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useBertStore } from "../../store/useBertStore";

export function WeTransferIconRail() {
  const navigate = useNavigate();
  const { workItems, activeJob, workspaceId } = useBertStore();
  const running = activeJob?.status === "RUNNING";
  const criticalCount = workItems.filter(
    (i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED"
  ).length;
  const wsQuery = `?workspace=${encodeURIComponent(workspaceId || "default")}`;

  return (
    <aside
      aria-label="Primary rail navigation"
      className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 bg-white border-r border-zinc-200/90 z-40 flex-col items-center justify-between py-4"
    >
      {/* Brand Monogram */}
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="w-10 h-10 rounded-2xl bg-[#18181B] text-white font-serif text-xl font-bold flex items-center justify-center shadow-sm hover:scale-105 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          title="BERT Document Intelligence"
          aria-label="BERT Home"
        >
          B
        </button>
        <span className="text-[9px] font-mono tracking-widest text-zinc-600 font-semibold uppercase">
          BERT
        </span>
      </div>

      {/* Main Rail Navigation */}
      <nav aria-label="Quick views" className="flex flex-col items-center gap-4 my-auto">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-700 hover:text-zinc-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isActive ? "text-blue-700 bg-blue-50 font-semibold" : ""
            }`
          }
          title="Upload & Overview"
        >
          <UploadCloud size={19} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Upload</span>
        </NavLink>

        <NavLink
          to={`/workspace${wsQuery}`}
          end
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-700 hover:text-zinc-950 transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isActive ? "text-blue-700 bg-blue-50 font-semibold" : ""
            }`
          }
          title="Live Review Copilot"
        >
          {running && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
          )}
          <Bot size={19} strokeWidth={1.8} />
          <span className="text-[10px] tracking-tight">Copilot</span>
        </NavLink>

        <NavLink
          to={`/workspace${wsQuery}&mode=canvas`}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-700 hover:text-zinc-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isActive ? "text-blue-700 bg-blue-50 font-semibold" : ""
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
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-700 hover:text-zinc-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isActive ? "text-blue-700 bg-blue-50 font-semibold" : ""
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
            `flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-700 hover:text-zinc-950 transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isActive ? "text-blue-700 bg-blue-50 font-semibold" : ""
            }`
          }
          title="SHA-256 Audit Ledger"
        >
          {criticalCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#BE123C] text-white rounded-full text-[9px] font-bold flex items-center justify-center">
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
          type="button"
          onClick={() => navigate(`/workspace${wsQuery}`)}
          className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          title="System Status: Verified Gate Online"
          aria-label="Open verified workspace status"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
        </button>
        <button
          type="button"
          onClick={() => navigate("/results?tab=audit")}
          className="text-zinc-600 hover:text-zinc-900 transition-colors p-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
          title="Audit & Verification Help"
          aria-label="Audit documentation and help"
        >
          <HelpCircle size={17} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
