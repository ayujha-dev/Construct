import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../lib/theme";

interface ThemeToggleProps {
  variant?: "pill" | "rail" | "sidebar" | "compact";
  testId?: string;
  className?: string;
}

export function ThemeToggle({
  variant = "pill",
  testId = "theme-toggle",
  className = "",
}: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? "Switch to Light theme" : "Switch to Dark theme";

  if (variant === "rail") {
    return (
      <button
        type="button"
        data-testid={testId}
        data-theme-toggle="true"
        aria-pressed={isDark}
        aria-label={label}
        title={label}
        onClick={toggleTheme}
        className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-sunken)] hover:bg-[var(--accent-brand-soft)] hover:border-[var(--accent-brand-border)] text-[var(--text-primary)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${className}`}
      >
        {isDark ? <Sun size={15} strokeWidth={1.85} /> : <Moon size={15} strokeWidth={1.85} />}
        <span className="text-[9px] font-mono font-semibold tracking-tight">
          {isDark ? "Light" : "Dark"}
        </span>
      </button>
    );
  }

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        data-testid={testId}
        data-theme-toggle="true"
        aria-pressed={isDark}
        aria-label={label}
        onClick={toggleTheme}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)] text-[var(--text-primary)] text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${className}`}
      >
        <span className="inline-flex items-center gap-1.5">
          {isDark ? (
            <Moon size={13} className="text-[var(--accent-brand-ink)]" />
          ) : (
            <Sun size={13} className="text-[var(--accent-brand-ink)]" />
          )}
          <span>Theme</span>
        </span>
        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
          {isDark ? "Dark" : "Light"}
        </span>
      </button>
    );
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        data-testid={testId}
        data-theme-toggle="true"
        aria-pressed={isDark}
        aria-label={label}
        title={label}
        onClick={toggleTheme}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] hover:bg-[var(--accent-brand-soft)] text-[var(--text-primary)] text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${className}`}
      >
        {isDark ? <Sun size={13} /> : <Moon size={13} />}
        <span>{isDark ? "Light" : "Dark"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      data-theme-toggle="true"
      aria-pressed={isDark}
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)] shadow-sm border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${className}`}
    >
      {isDark ? (
        <Sun size={13} className="text-[var(--status-warning-ink)] shrink-0" />
      ) : (
        <Moon size={13} className="text-[var(--accent-brand-ink)] shrink-0" />
      )}
      <span className="font-mono text-[11px] font-semibold">
        {isDark ? "Dark" : "Light"}
      </span>
    </button>
  );
}
