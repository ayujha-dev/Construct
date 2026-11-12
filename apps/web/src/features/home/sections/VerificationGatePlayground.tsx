import { AlertTriangle, CheckCircle2, Lock, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { VERIFICATION_GATE_PILLARS } from "../../../lib/landingContent";
import { VERIFICATION_FIXED_SOURCE, VERIFICATION_PRESETS } from "../homeData";
import {
  GATE_CITATION_THRESHOLD,
  GATE_MIN_QUOTE_CHARS,
  GATE_MIN_QUOTE_WORDS,
  evaluateVerificationGate,
} from "../verificationSim";

export function VerificationGatePlayground() {
  const [candidateQuote, setCandidateQuote] = useState<string>(VERIFICATION_PRESETS[0].quote);
  const [activePresetId, setActivePresetId] = useState<string>(VERIFICATION_PRESETS[0].id);

  const result = useMemo(
    () => evaluateVerificationGate(candidateQuote, VERIFICATION_FIXED_SOURCE, GATE_CITATION_THRESHOLD),
    [candidateQuote]
  );

  const badgeTone =
    result.status === "PASS"
      ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
      : result.status === "WEAK_EVIDENCE"
        ? "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]"
        : "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]";

  const barColor =
    result.status === "PASS"
      ? "bg-[var(--status-verified-solid)]"
      : result.status === "WEAK_EVIDENCE"
        ? "bg-[var(--status-warning-solid)]"
        : "bg-[var(--status-danger-solid)]";

  const StatusIcon =
    result.status === "PASS"
      ? CheckCircle2
      : result.status === "WEAK_EVIDENCE"
        ? ShieldAlert
        : AlertTriangle;

  return (
    <section
      id="verification-gate"
      className="relative z-10 scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 text-[var(--text-primary)] border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur-[2px]"
    >
      <span id="security-gate" className="scroll-mt-20 block h-0 w-0 overflow-hidden" aria-hidden="true" />
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="max-w-3xl space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
            03 · VERIFICATION GATE PLAYGROUND
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
            Test the &ge;97% verbatim quote gate and specificity checks live.
          </h2>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
            Edit the candidate quote below against the fixed source sentence to watch ShieldStaff’s
            fail-closed gate classify <strong>Pass</strong>, <strong>Weak Evidence</strong>, and{" "}
            <strong>Fail</strong> states.
          </p>
        </div>

        {/* Interactive Playground Card */}
        <div
          data-testid="verification-gate-playground"
          className="rounded-3xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-5 sm:p-7 space-y-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <span className="font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
              Interactive JS illustration of{" "}
              <code className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                apps/api/bert/verification/citation_gate.py
              </code>{" "}
              (production backend uses Python <code className="font-mono">rapidfuzz</code>)
            </span>
            <span className="font-mono text-[11px] font-bold text-[var(--accent-brand-ink)] tabular-nums">
              Threshold: &ge;97.0% · Min {GATE_MIN_QUOTE_CHARS} chars / {GATE_MIN_QUOTE_WORDS} words
            </span>
          </div>

          {/* Preset Scenarios */}
          <div className="flex flex-wrap items-center gap-2">
            {VERIFICATION_PRESETS.map((preset) => {
              const selected = activePresetId === preset.id && candidateQuote === preset.quote;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`gate-preset-${preset.id}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setActivePresetId(preset.id);
                    setCandidateQuote(preset.quote);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    selected
                      ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] border-[var(--accent-brand)]"
                      : "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--accent-brand-border)]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Fixed Source Sentence + Editable Quote */}
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-2xl bg-[var(--bg-hero)] text-[#F4F1EA] border border-[#2F4461] p-4 space-y-1.5">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#A8D4F5]">
                  Fixed Source AST Sentence (SOC2_Type_II_2026.pdf · p. 14)
                </div>
                <p
                  data-testid="gate-source-sentence"
                  className="font-mono text-xs leading-relaxed text-[#F4F1EA]"
                >
                  {VERIFICATION_FIXED_SOURCE}
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="verification-quote-input"
                  className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-primary)]"
                >
                  Candidate Quote Input (edit to test score)
                </label>
                <textarea
                  id="verification-quote-input"
                  data-testid="gate-quote-input"
                  rows={3}
                  value={candidateQuote}
                  onChange={(e) => {
                    setActivePresetId("");
                    setCandidateQuote(e.target.value);
                  }}
                  placeholder="Type or edit a verbatim quote from the source sentence above…"
                  className="w-full rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] p-3 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                />
              </div>
            </div>

            {/* Live Score & Decision Panel */}
            <div className="lg:col-span-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 sm:p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Gate Decision
                  </span>
                  <span
                    data-testid="gate-result-badge"
                    data-gate-status={result.status}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${badgeTone}`}
                  >
                    <StatusIcon size={13} />
                    <span>{result.statusBadge}</span>
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      data-testid="gate-score-value"
                      className="font-serif text-3xl font-semibold text-[var(--text-primary)] tabular-nums"
                    >
                      {result.score.toFixed(1)}%
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                      vs {GATE_CITATION_THRESHOLD.toFixed(1)}% threshold
                    </span>
                  </div>

                  {/* Progress Track with 97% Marker */}
                  <div className="relative h-2.5 rounded-full bg-[var(--bg-sunken)] border border-[var(--border-subtle)] mt-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${barColor}`}
                      style={{ width: `${Math.min(100, Math.max(0, result.score))}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
                  {result.headline}
                </p>

                <ul className="space-y-1 text-xs text-[var(--text-secondary)] list-disc pl-4">
                  {result.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-3 gap-2 text-center font-mono text-[11px] tabular-nums">
                <div className="p-2 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)]">CHARS</div>
                  <div className="font-bold text-[var(--text-primary)]">
                    {result.charCount}/{GATE_MIN_QUOTE_CHARS}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)]">WORDS</div>
                  <div className="font-bold text-[var(--text-primary)]">
                    {result.wordCount}/{GATE_MIN_QUOTE_WORDS}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)]">TITLE ONLY</div>
                  <div className="font-bold text-[var(--text-primary)]">
                    {result.isBareTitle ? "Blocked" : "Clear"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gate Pillars Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {VERIFICATION_GATE_PILLARS.map((pillar) => (
            <article
              key={pillar.id}
              className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-6 flex flex-col justify-between"
            >
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-[var(--accent-brand-ink)]">
                  <Lock size={13} />
                  <span>{pillar.tag}</span>
                </div>
                <h3 className="font-serif text-lg font-semibold text-[var(--text-primary)] mt-2">
                  {pillar.title}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
                  {pillar.summary}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]">
                {pillar.contractNote}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
