export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function getFirstEnabledOptionIndex<T extends string>(options: SelectOption<T>[]): number {
  return options.findIndex((opt) => !opt.disabled);
}

export function getLastEnabledOptionIndex<T extends string>(options: SelectOption<T>[]): number {
  for (let i = options.length - 1; i >= 0; i -= 1) {
    if (!options[i]?.disabled) return i;
  }
  return -1;
}

export function getNextEnabledOptionIndex<T extends string>(
  options: SelectOption<T>[],
  currentIndex: number,
  direction: 1 | -1
): number {
  if (options.length === 0) return -1;
  let idx = currentIndex;
  for (let steps = 0; steps < options.length; steps += 1) {
    idx = (idx + direction + options.length) % options.length;
    if (!options[idx]?.disabled) return idx;
  }
  return -1;
}

export interface SelectKeyInput<T extends string = string> {
  key: string;
  isOpen: boolean;
  activeIndex: number;
  selectedIndex: number;
  options: SelectOption<T>[];
}

export interface SelectKeyTransition<T extends string = string> {
  handled: boolean;
  nextOpen: boolean;
  nextActiveIndex: number;
  commitValue?: T;
  restoreFocus?: boolean;
}

export function computeSelectKeyTransition<T extends string>(
  input: SelectKeyInput<T>
): SelectKeyTransition<T> {
  const { key, isOpen, activeIndex, selectedIndex, options } = input;
  const fallbackIndex =
    selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : getFirstEnabledOptionIndex(options);

  if (options.length === 0) {
    return { handled: false, nextOpen: false, nextActiveIndex: -1 };
  }

  switch (key) {
    case "ArrowDown": {
      if (!isOpen) {
        return { handled: true, nextOpen: true, nextActiveIndex: fallbackIndex };
      }
      const base = activeIndex >= 0 ? activeIndex : fallbackIndex;
      return {
        handled: true,
        nextOpen: true,
        nextActiveIndex: getNextEnabledOptionIndex(options, base, 1),
      };
    }
    case "ArrowUp": {
      if (!isOpen) {
        return { handled: true, nextOpen: true, nextActiveIndex: fallbackIndex };
      }
      const base = activeIndex >= 0 ? activeIndex : fallbackIndex;
      return {
        handled: true,
        nextOpen: true,
        nextActiveIndex: getNextEnabledOptionIndex(options, base, -1),
      };
    }
    case "Home": {
      return {
        handled: true,
        nextOpen: true,
        nextActiveIndex: getFirstEnabledOptionIndex(options),
      };
    }
    case "End": {
      return {
        handled: true,
        nextOpen: true,
        nextActiveIndex: getLastEnabledOptionIndex(options),
      };
    }
    case "Enter":
    case " ": {
      if (!isOpen) {
        return { handled: true, nextOpen: true, nextActiveIndex: fallbackIndex };
      }
      const target = options[activeIndex];
      if (target && !target.disabled) {
        return {
          handled: true,
          nextOpen: false,
          nextActiveIndex: activeIndex,
          commitValue: target.value,
          restoreFocus: true,
        };
      }
      return {
        handled: true,
        nextOpen: false,
        nextActiveIndex: fallbackIndex,
        restoreFocus: true,
      };
    }
    case "Escape": {
      if (!isOpen) {
        return { handled: false, nextOpen: false, nextActiveIndex: fallbackIndex };
      }
      return {
        handled: true,
        nextOpen: false,
        nextActiveIndex: fallbackIndex,
        restoreFocus: true,
      };
    }
    case "Tab": {
      if (!isOpen) {
        return { handled: false, nextOpen: false, nextActiveIndex: fallbackIndex };
      }
      return { handled: false, nextOpen: false, nextActiveIndex: fallbackIndex };
    }
    default:
      return { handled: false, nextOpen: isOpen, nextActiveIndex: activeIndex };
  }
}
