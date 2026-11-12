import {
  AlertTriangle,
  BarChart3,
  Bot,
  Command,
  Compass,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { scrollToSection } from "../../lib/landingContent";
import { useTheme } from "../../lib/theme";
import { useBertStore } from "../../store/useBertStore";
import { STORY_NAV_ITEMS } from "./homeData";

interface CommandItem {
  id: string;
  group: "Sections" | "Routes" | "Preferences";
  label: string;
  hint: string;
  keywords: string;
  run: () => void | Promise<void>;
}

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPaletteModal({ open, onClose }: CommandPaletteModalProps) {
  const navigate = useNavigate();
  const { loadDemo, workspaceId } = useBertStore();
  const { isDark, toggleTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    const ws = encodeURIComponent(workspaceId || "default");
    const sectionCommands: CommandItem[] = STORY_NAV_ITEMS.map((item) => ({
      id: `section-${item.id}`,
      group: "Sections",
      label: item.label,
      hint: `#${item.id}`,
      keywords: `${item.label} ${item.id} section jump`,
      run: () => {
        onClose();
        scrollToSection(item.id);
      },
    }));

    const routeCommands: CommandItem[] = [
      {
        id: "route-workspace",
        group: "Routes",
        label: "Open Live Review Copilot",
        hint: "/workspace",
        keywords: "workspace copilot canvas chat",
        run: () => {
          onClose();
          navigate(`/workspace?workspace=${ws}`);
        },
      },
      {
        id: "route-triage",
        group: "Routes",
        label: "Open Human Triage Queue",
        hint: "/triage",
        keywords: "triage queue escalations p0 p1",
        run: () => {
          onClose();
          navigate("/triage");
        },
      },
      {
        id: "route-results",
        group: "Routes",
        label: "Open Executive Results",
        hint: "/results",
        keywords: "results analytics export xlsx report",
        run: () => {
          onClose();
          navigate("/results");
        },
      },
      {
        id: "route-audit",
        group: "Routes",
        label: "Open SHA-256 Audit Ledger",
        hint: "/results?tab=audit",
        keywords: "audit ledger sha256 checksum log",
        run: () => {
          onClose();
          navigate("/results?tab=audit");
        },
      },
      {
        id: "action-load-demo",
        group: "Routes",
        label: "Load Demo Case & Open Workspace",
        hint: "4-doc corpus",
        keywords: "demo corpus load sample soc2 iam",
        run: async () => {
          onClose();
          await loadDemo();
          const latestWs = useBertStore.getState().workspaceId || workspaceId || "default";
          navigate(`/workspace?workspace=${encodeURIComponent(latestWs)}`);
        },
      },
    ];

    const prefCommands: CommandItem[] = [
      {
        id: "pref-theme",
        group: "Preferences",
        label: isDark ? "Switch to Light Theme" : "Switch to Dark Theme",
        hint: isDark ? "Dark -> Light" : "Light -> Dark",
        keywords: "theme dark light appearance mode",
        run: () => {
          toggleTheme();
          onClose();
        },
      },
    ];

    return [...sectionCommands, ...routeCommands, ...prefCommands];
  }, [isDark, loadDemo, navigate, onClose, toggleTheme, workspaceId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.hint.toLowerCase().includes(q) ||
        cmd.keywords.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const safeIndex = filtered.length > 0 ? Math.min(activeIndex, filtered.length - 1) : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void filtered[safeIndex]?.run();
    }
  };

  const iconForItem = (item: CommandItem) => {
    if (item.group === "Sections") return Compass;
    if (item.id === "route-workspace") return Bot;
    if (item.id === "route-triage") return AlertTriangle;
    if (item.id === "route-results") return BarChart3;
    if (item.id === "route-audit") return ShieldCheck;
    if (item.id === "action-load-demo") return Sparkles;
    return isDark ? Sun : Moon;
  };

  return (
    <div
      data-testid="command-palette-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-2xs flex items-start justify-center pt-16 sm:pt-24 px-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick command palette"
        data-testid="command-palette-dialog"
        className="w-full max-w-xl rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-2xl overflow-hidden"
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
          <Search size={16} className="text-[var(--accent-brand-ink)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="command-palette-input"
            aria-label="Search sections, routes, or theme commands"
            placeholder="Jump to section, open /triage, or toggle theme…"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] rounded-md px-1.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
              No matching commands for “{query}”.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = iconForItem(item);
              const active = idx === safeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`command-item-${item.id}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => void item.run()}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    active
                      ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--bg-sunken)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      size={15}
                      className={active ? "text-white shrink-0" : "text-[var(--accent-brand-ink)] shrink-0"}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.label}</div>
                      <div
                        className={`text-[10px] font-mono ${
                          active ? "text-white/90" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {item.group}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded shrink-0 ${
                      active
                        ? "bg-[var(--accent-brand-hover)] text-white"
                        : "bg-[var(--bg-sunken)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                    }`}
                  >
                    {item.hint}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-sunken)] flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1">
            <Command size={11} />
            <span>Up/Down to navigate · Enter to run</span>
          </span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
