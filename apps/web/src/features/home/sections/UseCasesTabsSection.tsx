import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  GitCompare,
  Play,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBertStore } from "../../../store/useBertStore";
import { USE_CASE_TABS, type UseCaseTabSpec } from "../homeData";

export function UseCasesTabsSection() {
  const navigate = useNavigate();
  const { loadDemo, workspaceId } = useBertStore();

  const [activeTab, setActiveTab] = useState<UseCaseTabSpec["id"]>("security-questionnaire");
  const [isLaunching, setIsLaunching] = useState(false);

  // Mini Demo 1 state: Security Questionnaire (.XLSX)
  const [questionnairePopulated, setQuestionnairePopulated] = useState(true);
  const [selectedRowIdx, setSelectedRowIdx] = useState(0);

  // Mini Demo 2 state: Contract Risk Triage (Chronos + Vanguard)
  const [showChronosDiff, setShowChronosDiff] = useState(true);

  // Mini Demo 3 state: Degraded Scans (Scout Vision OCR)
  const [ocrConfidence, setOcrConfidence] = useState<number>(0.78);
  const [visionRescued, setVisionRescued] = useState(false);

  const activeSpec = USE_CASE_TABS.find((t) => t.id === activeTab) ?? USE_CASE_TABS[0];

  const handleLaunchDemo = async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    try {
      await loadDemo();
      const ws = useBertStore.getState().workspaceId || workspaceId || "default";
      navigate(`/workspace?workspace=${encodeURIComponent(ws)}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const questionnaireRows = [
    {
      row: "Row 4",
      question: "Is MFA required for all privileged production accounts?",
      answer: "Yes — multifactor authentication is required across production environments.",
      citation: "SOC2_Type_II_2026.pdf · p. 14 (99.4%)",
      status: "VERIFIED" as const,
    },
    {
      row: "Row 5",
      question: "What is the minimum password length policy?",
      answer: "14 characters per 2026 SOC 2 policy (supersedes 2023 8-char rule).",
      citation: "SOC2_Type_II_2026.pdf · p. 12 (98.2%)",
      status: "VERIFIED" as const,
    },
    {
      row: "Row 6",
      question: "Do fourth-party sub-processors guarantee a 15-minute breach SLA?",
      answer: "Insufficient evidence in uploaded corpus — flagged for manual review.",
      citation: "Closest: 72-hour notice (p. 7) -> /triage",
      status: "FLAGGED" as const,
    },
  ];

  const selectedQRow = questionnaireRows[selectedRowIdx] ?? questionnaireRows[0];
  const scanBlocked = ocrConfidence < 0.9;

  return (
    <section
      id="use-cases"
      className="relative z-10 scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[var(--accent-brand)] text-white"
    >
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-2xl space-y-2.5">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#EBF2F7]">
              06 · SHIELDSTAFF USE CASES
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-white">
              Built for messy compliance corpora across native formats.
            </h2>
            <p className="text-sm text-[#EBF2F7] leading-relaxed">
              Switch tabs to test an interactive mini-workflow for Security Questionnaires, Contract
              Risk Triage, or Degraded Scans.
            </p>
          </div>

          <button
            type="button"
            disabled={isLaunching}
            onClick={() => void handleLaunchDemo()}
            className="inline-flex items-center gap-2 py-2.5 px-5 rounded-full bg-white text-[#14384F] hover:bg-[#EBF2F7] disabled:opacity-70 text-xs font-semibold shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white shrink-0"
          >
            <span>Inspect 4-Doc Demo in Workspace</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Use Case Tabs */}
        <div
          role="tablist"
          aria-label="ShieldStaff Use Cases"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
        >
          {USE_CASE_TABS.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`use-case-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`use-case-tabpanel-${tab.id}`}
                data-testid={`use-case-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  selected
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border-white shadow-lg"
                    : "bg-[#123146] text-white border-white/25 hover:bg-[#173D57]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                      selected
                        ? "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border border-[var(--accent-brand-border)]"
                        : "bg-white text-[#14384F]"
                    }`}
                  >
                    {tab.badge}
                  </span>
                </div>
                <div className="font-serif text-lg font-semibold mt-2">{tab.label}</div>
              </button>
            );
          })}
        </div>

        {/* Active Tab Interactive Mini Demo Card */}
        <div
          role="tabpanel"
          id={`use-case-tabpanel-${activeSpec.id}`}
          aria-labelledby={`use-case-tab-${activeSpec.id}`}
          data-testid={`use-case-panel-${activeSpec.id}`}
          className="rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] p-5 sm:p-7 shadow-xl space-y-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
            <div className="space-y-1 max-w-2xl">
              <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                {activeSpec.headline}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {activeSpec.summary}
              </p>
            </div>
            <span className="font-mono text-[11px] font-semibold text-[var(--accent-brand-ink)] bg-[var(--accent-brand-soft)] border border-[var(--accent-brand-border)] px-2.5 py-1 rounded-lg">
              {activeSpec.locatorLabel}
            </span>
          </div>

          {/* MINI DEMO 1: Security Questionnaire (.XLSX) */}
          {activeTab === "security-questionnaire" && (
            <div data-testid="use-case-demo-questionnaire" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[var(--accent-brand-ink)]">
                  <FileSpreadsheet size={14} />
                  <span>Enterprise_Security_Questionnaire.xlsx · Click a row or toggle Auto-Fill</span>
                </div>
                <button
                  type="button"
                  data-testid="questionnaire-toggle-autofill"
                  onClick={() => setQuestionnairePopulated((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] text-[var(--accent-brand-contrast)] text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <Play size={12} />
                  <span>
                    {questionnairePopulated ? "Show Blank Template" : "Simulate Auto-Answer"}
                  </span>
                </button>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-sunken)] border-b border-[var(--border-subtle)] font-mono text-[10px] text-[var(--text-secondary)]">
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Security Question</th>
                      <th className="px-3 py-2">Generated Answer</th>
                      <th className="px-3 py-2">Gate Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionnaireRows.map((r, idx) => {
                      const rowSelected = idx === selectedRowIdx;
                      return (
                        <tr
                          key={r.row}
                          onClick={() => setSelectedRowIdx(idx)}
                          className={`border-b last:border-b-0 border-[var(--border-subtle)] cursor-pointer transition-colors ${
                            rowSelected ? "bg-[var(--accent-brand-soft)]" : "bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)]"
                          }`}
                        >
                          <td className="px-3 py-2.5 font-mono font-semibold text-[var(--accent-brand-ink)]">
                            {r.row}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">
                            {r.question}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                            {questionnairePopulated ? r.answer : "— (empty template cell) —"}
                          </td>
                          <td className="px-3 py-2.5">
                            {!questionnairePopulated ? (
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[var(--bg-sunken)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                                PENDING
                              </span>
                            ) : r.status === "VERIFIED" ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)]">
                                <CheckCircle2 size={10} />
                                <span>VERIFIED</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border border-[var(--status-danger-border)]">
                                <AlertTriangle size={10} />
                                <span>FLAGGED</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text-primary)]">
                  Selected {selectedQRow.row}: {selectedQRow.question}
                </span>
                <span className="font-mono text-[11px] text-[var(--accent-brand-ink)]">
                  {selectedQRow.citation}
                </span>
              </div>
            </div>
          )}

          {/* MINI DEMO 2: Contract Risk Triage (Chronos + Vanguard) */}
          {activeTab === "contract-risk-triage" && (
            <div data-testid="use-case-demo-contract" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[var(--accent-brand-ink)]">
                  <GitCompare size={14} />
                  <span>Chronos Supersession &amp; Vanguard P0 Liability Check</span>
                </div>
                <button
                  type="button"
                  data-testid="contract-toggle-chronos"
                  onClick={() => setShowChronosDiff((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] text-[var(--accent-brand-contrast)] text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <span>{showChronosDiff ? "Hide Arbiter Conflict Overlay" : "Run Chronos + Arbiter"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-[var(--text-secondary)]">
                      Legacy_InfoSec_Policy_2023.pdf · p. 3
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]">
                      SUPERSEDED
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed font-mono">
                    “User passwords must be at least <strong>8 characters</strong> and rotated every
                    180 days.”
                  </p>
                </div>

                <div className="rounded-2xl bg-[var(--status-verified-row)] border border-[var(--status-verified-border)] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-[var(--status-verified-ink)]">
                      SOC2_Type_II_2026.pdf · p. 12
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)]">
                      GOVERNING 2026
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed font-mono">
                    “Minimum password length is <strong>14 characters</strong> with phishing-resistant
                    MFA enforced.”
                  </p>
                </div>
              </div>

              {showChronosDiff && (
                <div className="rounded-2xl bg-[var(--status-danger-row)] border border-[var(--status-danger-border)] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-mono text-[11px] font-bold text-[var(--status-danger-ink)]">
                      ARBITER TEMPORAL_CONFLICT · VANGUARD P1/P0 TRIAGE LINK
                    </div>
                    <p className="text-xs text-[var(--text-primary)]">
                      Chronos marks 2023 policy as <code className="font-mono">superseded_by</code>{" "}
                      2026 SOC 2 while preserving an explicit review edge for legal/security sign-off.
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-full bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)]">
                    Governing Citation Selected
                  </span>
                </div>
              )}
            </div>
          )}

          {/* MINI DEMO 3: Degraded Scans (Scout Vision OCR) */}
          {activeTab === "degraded-scans" && (
            <div data-testid="use-case-demo-scans" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[var(--accent-brand-ink)]">
                  <ScanLine size={14} />
                  <span>Scout OCR Confidence Gate (threshold 0.90)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="scan-confidence-degraded"
                    onClick={() => {
                      setOcrConfidence(0.78);
                      setVisionRescued(false);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                      ocrConfidence < 0.9
                        ? "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]"
                        : "bg-[var(--bg-sunken)] text-[var(--text-primary)] border-[var(--border-subtle)]"
                    }`}
                  >
                    Simulate 0.78 Degraded Scan
                  </button>
                  <button
                    type="button"
                    data-testid="scan-confidence-clean"
                    onClick={() => {
                      setOcrConfidence(0.96);
                      setVisionRescued(false);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                      ocrConfidence >= 0.9
                        ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
                        : "bg-[var(--bg-sunken)] text-[var(--text-primary)] border-[var(--border-subtle)]"
                    }`}
                  >
                    Simulate 0.96 Vector PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                <div
                  className="rounded-2xl border border-[var(--border-strong)] p-4 space-y-2"
                  style={{ backgroundColor: "var(--pdf-page-bg)", color: "#181715" }}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#524E47] border-b border-[#E2DDD3] pb-1.5">
                    <span>Scanned_Addendum_p7.pdf · Page 7</span>
                    <span className="tabular-nums">ocr_confidence: {ocrConfidence.toFixed(2)}</span>
                  </div>
                  <div
                    className={`p-3 rounded-xl border-2 font-mono text-xs leading-relaxed ${
                      scanBlocked
                        ? "border-[#924D00] bg-[#FDF2DF] text-[#7D4000]"
                        : "border-[#0D6B50] bg-[#E7F6F0] text-[#0A5740]"
                    }`}
                  >
                    “Vendor completes independent CREST-accredited penetration testing at least
                    annually and shares executive summary.”
                  </div>
                  <div className="text-[10px] font-mono text-[#524E47] tabular-nums">
                    bbox [96, 412, 488, 492]
                  </div>
                </div>

                <div className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
                        visionRescued
                          ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
                          : scanBlocked
                            ? "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]"
                            : "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
                      }`}
                    >
                      {visionRescued ? (
                        <>
                          <ShieldCheck size={11} />
                          <span>VISION RESCUE APPROVED</span>
                        </>
                      ) : scanBlocked ? (
                        <>
                          <Eye size={11} />
                          <span>AUTO-VERIFY BLOCKED -&gt; /triage</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={11} />
                          <span>GATE PASSED (ocr &gt;= 0.90)</span>
                        </>
                      )}
                    </span>

                    <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                      {visionRescued
                        ? "Human reviewer inspected the cropped bounding box and confirmed the Vision Rescue transcription."
                        : scanBlocked
                          ? "Because ocr_confidence (0.78) is below 0.90, Scout blocks Envoy prose synthesis and sends the crop to /triage."
                          : "High OCR confidence (0.96) permits normal rapidfuzz >=97% quote verification."}
                    </p>
                  </div>

                  {scanBlocked && (
                    <button
                      type="button"
                      data-testid="scan-accept-vision-rescue"
                      onClick={() => setVisionRescued((prev) => !prev)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--status-verified-solid)] hover:opacity-90 text-white text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                    >
                      <CheckCircle2 size={13} />
                      <span>
                        {visionRescued ? "Revert Vision Rescue" : "Accept Vision Rescue Text"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
