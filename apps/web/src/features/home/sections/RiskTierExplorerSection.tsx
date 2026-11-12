import { AlertOctagon, AlertTriangle, Clock, GitBranch, Info, Shield } from "lucide-react";
import { useState } from "react";
import { RISK_TIER_SPECS, type RiskTierSpec } from "../homeData";

export function RiskTierExplorerSection() {
  const [activeTier, setActiveTier] = useState<RiskTierSpec["tier"]>("P0");
  const selected = RISK_TIER_SPECS.find((t) => t.tier === activeTier) ?? RISK_TIER_SPECS[0];

  const toneBadge = (tone: RiskTierSpec["tone"]) => {
    switch (tone) {
      case "danger":
        return "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]";
      case "warning":
        return "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]";
      case "brand":
        return "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border-[var(--accent-brand-border)]";
      default:
        return "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]";
    }
  };

  const TierIcon = (tone: RiskTierSpec["tone"]) => {
    switch (tone) {
      case "danger":
        return AlertOctagon;
      case "warning":
        return AlertTriangle;
      case "brand":
        return Shield;
      default:
        return Info;
    }
  };

  const ActiveIcon = TierIcon(selected.tone);

  return (
    <section
      id="risk-tiers"
      className="relative z-10 scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 text-[var(--text-primary)] border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/75"
    >
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="max-w-3xl space-y-2.5">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
            04 · RISK TIER EXPLORER
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
            Deterministic priority scoring from P0 Critical to P3 Informational.
          </h2>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
            Vanguard assigns every finding a 0–100 risk score and priority tier. Select any tier to
            inspect its response SLA, routing rules, and sample source findings.
          </p>
        </div>

        {/* Clickable P0 / P1 / P2 / P3 Selector Cards */}
        <div
          role="tablist"
          aria-label="Risk Priority Tiers"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {RISK_TIER_SPECS.map((spec) => {
            const isSelected = spec.tier === activeTier;
            const Icon = TierIcon(spec.tone);
            return (
              <button
                key={spec.tier}
                type="button"
                role="tab"
                id={`risk-tier-tab-${spec.tier}`}
                aria-selected={isSelected}
                aria-controls={`risk-tier-panel-${spec.tier}`}
                data-testid={`risk-tier-tab-${spec.tier}`}
                onClick={() => setActiveTier(spec.tier)}
                className={`text-left rounded-2xl border p-4 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                  isSelected
                    ? "bg-[var(--bg-surface)] border-[var(--accent-brand)] ring-2 ring-[var(--accent-brand-soft)] shadow-md"
                    : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono text-[11px] font-bold ${toneBadge(
                      spec.tone
                    )}`}
                  >
                    <Icon size={12} />
                    <span>{spec.tier}</span>
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-secondary)] tabular-nums">
                    {spec.scoreRange}
                  </span>
                </div>
                <div className="font-serif text-base font-semibold text-[var(--text-primary)] mt-2.5">
                  {spec.label}
                </div>
                <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-1">
                  {spec.code}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Tier Detail Panel */}
        <div
          role="tabpanel"
          id={`risk-tier-panel-${selected.tier}`}
          aria-labelledby={`risk-tier-tab-${selected.tier}`}
          data-testid="risk-tier-detail-panel"
          className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-7 shadow-sm space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-mono text-xs font-bold ${toneBadge(
                  selected.tone
                )}`}
              >
                <ActiveIcon size={14} />
                <span>{selected.code}</span>
              </span>
              <h3 className="font-serif text-xl font-semibold text-[var(--text-primary)]">
                {selected.label}
              </h3>
            </div>
            <span className="font-mono text-xs font-semibold text-[var(--accent-brand-ink)] tabular-nums">
              {selected.scoreRange}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-4">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
                <Clock size={12} />
                <span>Target SLA</span>
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)] mt-1.5">
                {selected.sla}
              </p>
            </div>

            <div className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-4">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
                <GitBranch size={12} />
                <span>Deterministic Routing Logic</span>
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-primary)] mt-1.5 leading-relaxed">
                {selected.routingLogic}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Sample Findings ({selected.tier})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selected.sampleFindings.map((finding, idx) => (
                <article
                  key={idx}
                  className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between space-y-2"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                      {finding.title}
                    </h4>
                    <div className="text-[11px] font-mono text-[var(--accent-brand-ink)] mt-1 break-all">
                      {finding.source} · {finding.locator}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]">
                    {finding.trigger}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
