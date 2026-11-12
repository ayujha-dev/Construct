import { Command } from "lucide-react";
import { useEffect, useState } from "react";
import { scrollToSection } from "../../../lib/landingContent";
import { STORY_NAV_ITEMS, type StorySectionId } from "../homeData";

interface StoryNavBarProps {
  onOpenCommandPalette: () => void;
}

export function StoryNavBar({ onOpenCommandPalette }: StoryNavBarProps) {
  const [activeId, setActiveId] = useState<StorySectionId>("evidence-demo");

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const sectionIds = STORY_NAV_ITEMS.map((item) => item.id);

    const updateFromScroll = () => {
      const threshold = 180;
      let current: StorySectionId = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= threshold) {
          current = id;
        }
      }
      setActiveId(current);
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length > 0) {
            const id = visible[0].target.id as StorySectionId;
            if (sectionIds.includes(id)) {
              setActiveId(id);
            }
          }
        },
        {
          rootMargin: "-18% 0px -65% 0px",
          threshold: 0.05,
        }
      );

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      }
    }

    updateFromScroll();
    window.addEventListener("scroll", updateFromScroll, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", updateFromScroll);
    };
  }, []);

  const handleJump = (id: StorySectionId) => {
    setActiveId(id);
    scrollToSection(id);
  };

  return (
    <div
      data-testid="story-nav-bar"
      className="sticky top-14 md:top-16 z-30 px-4 sm:px-8 md:px-10 lg:px-14 py-2 pointer-events-none"
    >
      <nav
        aria-label="Interactive story sections"
        className="pointer-events-auto max-w-5xl mx-auto rounded-full bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border-subtle)] shadow-md px-2.5 py-1.5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar"
      >
        <div className="flex items-center gap-1 min-w-0">
          {STORY_NAV_ITEMS.map((item) => {
            const active = activeId === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                data-testid={`story-nav-link-${item.id}`}
                aria-current={active ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  handleJump(item.id);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                  active
                    ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] font-semibold shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)]"
                }`}
              >
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    active ? "text-white" : "text-[var(--accent-brand-ink)]"
                  }`}
                >
                  {item.step}
                </span>
                <span>{item.shortLabel}</span>
              </a>
            );
          })}
        </div>

        <button
          type="button"
          data-testid="story-nav-cmdk"
          onClick={onOpenCommandPalette}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-sunken)] border border-[var(--border-subtle)] hover:border-[var(--accent-brand-border)] text-[11px] font-mono font-semibold text-[var(--text-primary)] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
        >
          <Command size={11} className="text-[var(--accent-brand-ink)]" />
          <span>⌘K</span>
        </button>
      </nav>
    </div>
  );
}
