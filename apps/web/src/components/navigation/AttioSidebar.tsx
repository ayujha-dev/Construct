import {
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronDown,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Layers,
  Plus,
  Scan,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useBertStore } from "../../store/useBertStore";
import type { Document } from "../../types/bert";

export function AttioSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    documents,
    workItems,
    selectedDocumentId,
    setSelectedDocument,
    uploadFile,
    loadDemo,
  } = useBertStore();

  const isCanvasMode = location.search.includes("mode=canvas");
  const isAuditTab = location.search.includes("tab=audit");

  const criticalCount = workItems.filter(
    (i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED"
  ).length;

  const verifiedCount = workItems.filter(
    (i) => i.verification_status === "VERIFIED"
  ).length;
  const totalCount = workItems.length || 16;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void uploadFile(file);
      navigate("/workspace");
    }
  };

  const getFormatBadge = (doc: Document) => {
    const ext = doc.filename.split(".").pop()?.toLowerCase();
    const isScan = doc.category?.toLowerCase().includes("scan") || doc.sub_category?.toLowerCase().includes("scan") || ext === "scn";
    if (isScan) {
      return { label: "SCN", bg: "bg-rose-100 text-rose-700 border-rose-200" };
    }
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      return { label: "XLS", bg: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    }
    if (ext === "json") {
      return { label: "JSN", bg: "bg-amber-100 text-amber-700 border-amber-200" };
    }
    return { label: "PDF", bg: "bg-blue-100 text-blue-700 border-blue-200" };
  };

  const exportXlsx = () => {
    navigate("/results");
  };

  return (
    <aside className="w-60 h-screen bg-[#FFFFFF] border-r border-zinc-200/80 flex flex-col justify-between shrink-0 select-none text-zinc-900">
      {/* Top Workspace Header */}
      <div>
        <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-200/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white font-serif text-sm font-bold flex items-center justify-center shrink-0 shadow-xs">
              B
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 cursor-pointer">
                <span className="text-xs font-semibold truncate text-zinc-900">BERT Compliance</span>
                <ChevronDown size={13} className="text-zinc-400 shrink-0" />
              </div>
              <span className="text-[10px] text-zinc-400 font-mono block truncate">7-Agent Regiment</span>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons (Replit Style) */}
        <div className="p-3 space-y-1.5 border-b border-zinc-200/60">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.xlsx,.xls,.json,.txt"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-800 shadow-2xs transition-all cursor-pointer"
          >
            <Plus size={14} className="text-zinc-600" />
            <span>Upload Document or Sheet</span>
          </button>

          <button
            onClick={() => {
              void loadDemo();
              navigate("/workspace");
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-50/70 hover:bg-blue-100/70 text-blue-700 text-xs font-medium transition-colors cursor-pointer"
          >
            <Sparkles size={13} className="text-blue-600" />
            <span>Load Investor Demo Case</span>
          </button>
        </div>

        {/* Main Navigation List */}
        <nav className="p-2 space-y-0.5 text-xs font-medium">
          <NavLink
            to="/workspace"
            end
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                isActive && !isCanvasMode
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50"
              }`
            }
          >
            <Bot size={16} className="text-zinc-500" />
            <span>Home & Copilot</span>
          </NavLink>

          <NavLink
            to="/workspace?mode=canvas"
            className={() =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                isCanvasMode
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50"
              }`
            }
          >
            <Layers size={16} className="text-zinc-500" />
            <span>Document Canvas</span>
          </NavLink>

          <NavLink
            to="/results"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                isActive && !isAuditTab
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50"
              }`
            }
          >
            <BarChart3 size={16} className="text-zinc-500" />
            <span>Results & Reports</span>
          </NavLink>

          <NavLink
            to="/results?filter=escalations"
            className="flex items-center justify-between px-3 py-2 rounded-lg text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={16} className="text-rose-500" />
              <span>Human Escalations</span>
            </div>
            {criticalCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                {criticalCount}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/results?tab=audit"
            className={() =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                isAuditTab
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50"
              }`
            }
          >
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>SHA-256 Audit Ledger</span>
          </NavLink>
        </nav>

        {/* Ingested Files / Records Section (Attio Style) */}
        <div className="px-3 pt-3">
          <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            <span>Active Corpus</span>
            <span className="font-mono text-[10px] text-zinc-400">{documents.length} files</span>
          </div>

          <div className="mt-1 space-y-1 max-h-[30vh] overflow-y-auto">
            {documents.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-zinc-400 italic">
                No files staged yet. Click upload or demo above.
              </div>
            ) : (
              documents.map((doc) => {
                const badge = getFormatBadge(doc);
                const isSelected = doc.id === selectedDocumentId;
                const isActionNeeded =
                  doc.priority_tier === "P0_CRITICAL" ||
                  doc.category?.toLowerCase().includes("scan");

                return (
                  <button
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocument(doc.id);
                      if (location.pathname !== "/workspace") {
                        navigate("/workspace");
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-zinc-100/90 text-zinc-950 font-medium"
                        : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-md font-mono text-[10px] font-bold border flex items-center justify-center shrink-0 ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                    <span className="truncate flex-1" title={doc.filename}>
                      {doc.filename}
                    </span>
                    {isActionNeeded && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                        title="Action Needed"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Live Status Footer */}
      <div className="p-3 border-t border-zinc-200/80 bg-zinc-50/50">
        <div className="mb-2 p-2 rounded-lg bg-white border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] mb-1 font-medium text-zinc-600">
            <span>Review Progress</span>
            <span className="font-mono text-zinc-900 font-bold">
              {verifiedCount}/{totalCount} Verified
            </span>
          </div>
          <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.round((verifiedCount / totalCount) * 100))}%`,
              }}
            />
          </div>
        </div>

        <button
          onClick={exportXlsx}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
        >
          <Download size={13} />
          <span>Export Completed .XLSX</span>
        </button>
      </div>
    </aside>
  );
}
