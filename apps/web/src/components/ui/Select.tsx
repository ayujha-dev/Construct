import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  computeSelectKeyTransition,
  getFirstEnabledOptionIndex,
  type SelectOption,
} from "../../lib/selectModel";

export {
  computeSelectKeyTransition,
  getFirstEnabledOptionIndex,
  getLastEnabledOptionIndex,
  getNextEnabledOptionIndex,
  type SelectKeyInput,
  type SelectKeyTransition,
  type SelectOption,
} from "../../lib/selectModel";

export interface SelectProps<T extends string = string> {
  id?: string;
  label?: string;
  ariaLabel?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  labelClassName?: string;
  testId?: string;
}

export function Select<T extends string = string>({
  id,
  label,
  ariaLabel,
  value,
  options,
  onChange,
  placeholder = "Select an option...",
  disabled = false,
  size = "md",
  className = "",
  labelClassName = "text-[11px] font-semibold text-zinc-700 uppercase tracking-wider block",
  testId,
}: SelectProps<T>) {
  const autoId = useId();
  const triggerId = id || `bert-select-${autoId}`;
  const labelId = `${triggerId}-label`;
  const listboxId = `${triggerId}-listbox`;

  const selectedIndex = useMemo(
    () => options.findIndex((opt) => opt.value === value),
    [options, value]
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    selectedIndex >= 0 ? selectedIndex : getFirstEnabledOptionIndex(options)
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : getFirstEnabledOptionIndex(options));
    }
  }, [isOpen, selectedIndex, options]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const activeEl = listRef.current?.querySelector<HTMLElement>(
      `[id="${triggerId}-option-${activeIndex}"]`
    );
    activeEl?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen, activeIndex, triggerId]);

  const commitIndex = (idx: number) => {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const transition = computeSelectKeyTransition({
      key: e.key,
      isOpen,
      activeIndex,
      selectedIndex,
      options,
    });
    if (!transition.handled) {
      if (e.key === "Tab" && isOpen) setIsOpen(false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(transition.nextOpen);
    setActiveIndex(transition.nextActiveIndex);
    if (transition.commitValue !== undefined) {
      onChange(transition.commitValue);
    }
    if (transition.restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  const triggerSizeClasses =
    size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-xs";

  return (
    <div ref={containerRef} className={`relative space-y-1.5 ${className}`}>
      {label && (
        <label id={labelId} htmlFor={triggerId} className={labelClassName}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        disabled={disabled}
        data-testid={testId}
        data-value={value}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? ariaLabel : undefined}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${triggerId}-option-${activeIndex}` : undefined
        }
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2 rounded-lg bg-white border border-zinc-300 hover:border-zinc-400 font-medium text-zinc-900 shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${triggerSizeClasses} ${
          disabled ? "opacity-60 cursor-not-allowed bg-zinc-100" : "cursor-pointer"
        } ${isOpen ? "border-blue-600 ring-2 ring-blue-600/20" : ""}`}
      >
        <span className="truncate text-left">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={size === "sm" ? 12 : 14}
          className={`shrink-0 text-zinc-600 transition-transform duration-150 ${
            isOpen ? "rotate-180 text-blue-700" : ""
          }`}
        />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? ariaLabel : undefined}
          className="absolute left-0 right-0 mt-1 z-40 max-h-60 overflow-y-auto rounded-xl bg-white border border-zinc-200 shadow-lg py-1 text-xs"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-zinc-500 italic">No options available</li>
          ) : (
            options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = idx === activeIndex;
              return (
                <li
                  key={opt.value}
                  id={`${triggerId}-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled ? "true" : undefined}
                  data-value={opt.value}
                  data-active={isActive ? "true" : "false"}
                  onMouseEnter={() => {
                    if (!opt.disabled) setActiveIndex(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitIndex(idx)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 transition-colors ${
                    opt.disabled
                      ? "text-zinc-400 cursor-not-allowed"
                      : isActive
                        ? "bg-blue-50 text-blue-950 cursor-pointer"
                        : isSelected
                          ? "bg-zinc-50 text-zinc-950 cursor-pointer"
                          : "text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate ${
                        isSelected ? "font-semibold text-blue-800" : "font-medium"
                      }`}
                    >
                      {opt.label}
                    </div>
                    {opt.description && (
                      <div className="text-[10px] text-zinc-600 truncate">
                        {opt.description}
                      </div>
                    )}
                  </div>
                  {isSelected && <Check size={13} className="shrink-0 text-blue-700" />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
