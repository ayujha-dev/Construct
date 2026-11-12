import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "bert-theme";
export const THEME_CHANGE_EVENT = "bert-theme-change";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ThemePaletteTokens {
  bgCanvas: string;
  bgSurface: string;
  bgSunken: string;
  bgElevated: string;
  bgHero: string;
  bgHeroCard: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentBrand: string;
  accentBrandHover: string;
  accentBrandSoft: string;
  accentBrandInk: string;
  accentBrandBorder: string;
  accentBrandContrast: string;
  statusVerifiedSolid: string;
  statusVerifiedSoft: string;
  statusVerifiedInk: string;
  statusVerifiedBorder: string;
  statusVerifiedRow: string;
  statusOverrideSolid: string;
  statusOverrideSoft: string;
  statusOverrideInk: string;
  statusOverrideBorder: string;
  statusOverrideRow: string;
  statusWarningSolid: string;
  statusWarningSoft: string;
  statusWarningInk: string;
  statusWarningBorder: string;
  statusWarningRow: string;
  statusNeutralSolid: string;
  statusNeutralSoft: string;
  statusNeutralInk: string;
  statusNeutralBorder: string;
  statusNeutralRow: string;
  statusDangerSolid: string;
  statusDangerSoft: string;
  statusDangerInk: string;
  statusDangerBorder: string;
  statusDangerRow: string;
}

export const THEME_TOKENS: Record<ThemeMode, ThemePaletteTokens> = {
  light: {
    bgCanvas: "#FAF8F5",
    bgSurface: "#FFFFFF",
    bgSunken: "#F3F0EA",
    bgElevated: "#FFFDF9",
    bgHero: "#101A29",
    bgHeroCard: "#162438",
    borderSubtle: "#E2DDD3",
    borderStrong: "#C6BEB0",
    textPrimary: "#181715",
    textSecondary: "#524E47",
    textMuted: "#625D54",
    accentBrand: "#1B4965",
    accentBrandHover: "#14384F",
    accentBrandSoft: "#EBF2F7",
    accentBrandInk: "#1B4965",
    accentBrandBorder: "#B8CFE0",
    accentBrandContrast: "#FFFFFF",
    statusVerifiedSolid: "#0D6B50",
    statusVerifiedSoft: "#E7F6F0",
    statusVerifiedInk: "#0A5740",
    statusVerifiedBorder: "#A7DEC9",
    statusVerifiedRow: "#F2FAF6",
    statusOverrideSolid: "#6B348A",
    statusOverrideSoft: "#F4ECF9",
    statusOverrideInk: "#582873",
    statusOverrideBorder: "#D6B8EA",
    statusOverrideRow: "#F9F4FC",
    statusWarningSolid: "#924D00",
    statusWarningSoft: "#FDF2DF",
    statusWarningInk: "#7D4000",
    statusWarningBorder: "#ECC589",
    statusWarningRow: "#FEF8EC",
    statusNeutralSolid: "#4A525D",
    statusNeutralSoft: "#EEF0F3",
    statusNeutralInk: "#3D444E",
    statusNeutralBorder: "#C9CFD7",
    statusNeutralRow: "#F5F6F8",
    statusDangerSolid: "#9E1C28",
    statusDangerSoft: "#FCEBED",
    statusDangerInk: "#8A1520",
    statusDangerBorder: "#EBB3B9",
    statusDangerRow: "#FDF4F5",
  },
  dark: {
    bgCanvas: "#0E1117",
    bgSurface: "#151B23",
    bgSunken: "#1C2430",
    bgElevated: "#1F2836",
    bgHero: "#0A0E14",
    bgHeroCard: "#121A26",
    borderSubtle: "#2B3544",
    borderStrong: "#3B485C",
    textPrimary: "#F4F1EA",
    textSecondary: "#C8C2B6",
    textMuted: "#ACA599",
    accentBrand: "#265D80",
    accentBrandHover: "#317099",
    accentBrandSoft: "#162C3D",
    accentBrandInk: "#82C4EC",
    accentBrandBorder: "#2E5673",
    accentBrandContrast: "#FFFFFF",
    statusVerifiedSolid: "#11785B",
    statusVerifiedSoft: "#112E26",
    statusVerifiedInk: "#6CE0B7",
    statusVerifiedBorder: "#1F5E4B",
    statusVerifiedRow: "#122620",
    statusOverrideSolid: "#733B96",
    statusOverrideSoft: "#281A36",
    statusOverrideInk: "#D9AEF7",
    statusOverrideBorder: "#533273",
    statusOverrideRow: "#22182D",
    statusWarningSolid: "#9A5200",
    statusWarningSoft: "#30220E",
    statusWarningInk: "#F7BE68",
    statusWarningBorder: "#6E4B19",
    statusWarningRow: "#271D10",
    statusNeutralSolid: "#4E5866",
    statusNeutralSoft: "#202733",
    statusNeutralInk: "#C4CCD7",
    statusNeutralBorder: "#3D495C",
    statusNeutralRow: "#1A202B",
    statusDangerSolid: "#A8212E",
    statusDangerSoft: "#36171C",
    statusDangerInk: "#FF9BA3",
    statusDangerBorder: "#722B33",
    statusDangerRow: "#2B1519",
  },
};

export interface ContrastAuditPair {
  id: string;
  theme: ThemeMode;
  fg: string;
  bg: string;
  minRatio?: number;
}

export const THEME_CONTRAST_AUDIT_PAIRS: ContrastAuditPair[] = [
  // Light semantic pairs
  { id: "light:text-primary/bg-canvas", theme: "light", fg: THEME_TOKENS.light.textPrimary, bg: THEME_TOKENS.light.bgCanvas },
  { id: "light:text-primary/bg-surface", theme: "light", fg: THEME_TOKENS.light.textPrimary, bg: THEME_TOKENS.light.bgSurface },
  { id: "light:text-primary/bg-sunken", theme: "light", fg: THEME_TOKENS.light.textPrimary, bg: THEME_TOKENS.light.bgSunken },
  { id: "light:text-secondary/bg-canvas", theme: "light", fg: THEME_TOKENS.light.textSecondary, bg: THEME_TOKENS.light.bgCanvas },
  { id: "light:text-secondary/bg-sunken", theme: "light", fg: THEME_TOKENS.light.textSecondary, bg: THEME_TOKENS.light.bgSunken },
  { id: "light:text-muted/bg-canvas", theme: "light", fg: THEME_TOKENS.light.textMuted, bg: THEME_TOKENS.light.bgCanvas },
  { id: "light:text-muted/bg-sunken", theme: "light", fg: THEME_TOKENS.light.textMuted, bg: THEME_TOKENS.light.bgSunken },
  { id: "light:accent-contrast/accent-brand", theme: "light", fg: THEME_TOKENS.light.accentBrandContrast, bg: THEME_TOKENS.light.accentBrand },
  { id: "light:accent-contrast/accent-hover", theme: "light", fg: THEME_TOKENS.light.accentBrandContrast, bg: THEME_TOKENS.light.accentBrandHover },
  { id: "light:accent-ink/accent-soft", theme: "light", fg: THEME_TOKENS.light.accentBrandInk, bg: THEME_TOKENS.light.accentBrandSoft },
  { id: "light:accent-ink/bg-surface", theme: "light", fg: THEME_TOKENS.light.accentBrandInk, bg: THEME_TOKENS.light.bgSurface },
  { id: "light:verified-ink/verified-soft", theme: "light", fg: THEME_TOKENS.light.statusVerifiedInk, bg: THEME_TOKENS.light.statusVerifiedSoft },
  { id: "light:verified-contrast/verified-solid", theme: "light", fg: "#FFFFFF", bg: THEME_TOKENS.light.statusVerifiedSolid },
  { id: "light:override-ink/override-soft", theme: "light", fg: THEME_TOKENS.light.statusOverrideInk, bg: THEME_TOKENS.light.statusOverrideSoft },
  { id: "light:override-contrast/override-solid", theme: "light", fg: "#FFFFFF", bg: THEME_TOKENS.light.statusOverrideSolid },
  { id: "light:warning-ink/warning-soft", theme: "light", fg: THEME_TOKENS.light.statusWarningInk, bg: THEME_TOKENS.light.statusWarningSoft },
  { id: "light:warning-contrast/warning-solid", theme: "light", fg: "#FFFFFF", bg: THEME_TOKENS.light.statusWarningSolid },
  { id: "light:neutral-ink/neutral-soft", theme: "light", fg: THEME_TOKENS.light.statusNeutralInk, bg: THEME_TOKENS.light.statusNeutralSoft },
  { id: "light:neutral-contrast/neutral-solid", theme: "light", fg: "#FFFFFF", bg: THEME_TOKENS.light.statusNeutralSolid },
  { id: "light:danger-ink/danger-soft", theme: "light", fg: THEME_TOKENS.light.statusDangerInk, bg: THEME_TOKENS.light.statusDangerSoft },
  { id: "light:danger-contrast/danger-solid", theme: "light", fg: "#FFFFFF", bg: THEME_TOKENS.light.statusDangerSolid },
  // Dark semantic pairs
  { id: "dark:text-primary/bg-canvas", theme: "dark", fg: THEME_TOKENS.dark.textPrimary, bg: THEME_TOKENS.dark.bgCanvas },
  { id: "dark:text-primary/bg-surface", theme: "dark", fg: THEME_TOKENS.dark.textPrimary, bg: THEME_TOKENS.dark.bgSurface },
  { id: "dark:text-primary/bg-sunken", theme: "dark", fg: THEME_TOKENS.dark.textPrimary, bg: THEME_TOKENS.dark.bgSunken },
  { id: "dark:text-secondary/bg-canvas", theme: "dark", fg: THEME_TOKENS.dark.textSecondary, bg: THEME_TOKENS.dark.bgCanvas },
  { id: "dark:text-secondary/bg-sunken", theme: "dark", fg: THEME_TOKENS.dark.textSecondary, bg: THEME_TOKENS.dark.bgSunken },
  { id: "dark:text-muted/bg-canvas", theme: "dark", fg: THEME_TOKENS.dark.textMuted, bg: THEME_TOKENS.dark.bgCanvas },
  { id: "dark:text-muted/bg-surface", theme: "dark", fg: THEME_TOKENS.dark.textMuted, bg: THEME_TOKENS.dark.bgSurface },
  { id: "dark:text-muted/bg-sunken", theme: "dark", fg: THEME_TOKENS.dark.textMuted, bg: THEME_TOKENS.dark.bgSunken },
  { id: "dark:accent-contrast/accent-brand", theme: "dark", fg: THEME_TOKENS.dark.accentBrandContrast, bg: THEME_TOKENS.dark.accentBrand },
  { id: "dark:accent-contrast/accent-hover", theme: "dark", fg: THEME_TOKENS.dark.accentBrandContrast, bg: THEME_TOKENS.dark.accentBrandHover },
  { id: "dark:accent-ink/accent-soft", theme: "dark", fg: THEME_TOKENS.dark.accentBrandInk, bg: THEME_TOKENS.dark.accentBrandSoft },
  { id: "dark:accent-ink/bg-surface", theme: "dark", fg: THEME_TOKENS.dark.accentBrandInk, bg: THEME_TOKENS.dark.bgSurface },
  { id: "dark:verified-ink/verified-soft", theme: "dark", fg: THEME_TOKENS.dark.statusVerifiedInk, bg: THEME_TOKENS.dark.statusVerifiedSoft },
  { id: "dark:verified-contrast/verified-solid", theme: "dark", fg: "#FFFFFF", bg: THEME_TOKENS.dark.statusVerifiedSolid },
  { id: "dark:override-ink/override-soft", theme: "dark", fg: THEME_TOKENS.dark.statusOverrideInk, bg: THEME_TOKENS.dark.statusOverrideSoft },
  { id: "dark:override-contrast/override-solid", theme: "dark", fg: "#FFFFFF", bg: THEME_TOKENS.dark.statusOverrideSolid },
  { id: "dark:warning-ink/warning-soft", theme: "dark", fg: THEME_TOKENS.dark.statusWarningInk, bg: THEME_TOKENS.dark.statusWarningSoft },
  { id: "dark:warning-contrast/warning-solid", theme: "dark", fg: "#FFFFFF", bg: THEME_TOKENS.dark.statusWarningSolid },
  { id: "dark:neutral-ink/neutral-soft", theme: "dark", fg: THEME_TOKENS.dark.statusNeutralInk, bg: THEME_TOKENS.dark.statusNeutralSoft },
  { id: "dark:neutral-contrast/neutral-solid", theme: "dark", fg: "#FFFFFF", bg: THEME_TOKENS.dark.statusNeutralSolid },
  { id: "dark:danger-ink/danger-soft", theme: "dark", fg: THEME_TOKENS.dark.statusDangerInk, bg: THEME_TOKENS.dark.statusDangerSoft },
  { id: "dark:danger-contrast/danger-solid", theme: "dark", fg: "#FFFFFF", bg: THEME_TOKENS.dark.statusDangerSolid },
];

export function hexToRgb(hex: string): RgbColor {
  const cleaned = hex.trim().replace(/^#/, "");
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function relativeLuminance(rgb: RgbColor | [number, number, number]): number {
  const channels = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];
  const [r, g, b] = channels.map((c) => {
    const v = Math.max(0, Math.min(255, c)) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function normalizeTheme(value: string | null | undefined): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

export function getInitialTheme(storage?: Pick<Storage, "getItem"> | null): ThemeMode {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== "undefined"
          ? window.localStorage
          : null;
    const raw = store?.getItem(THEME_STORAGE_KEY);
    return normalizeTheme(raw);
  } catch {
    return "light";
  }
}

export function getCurrentTheme(): ThemeMode {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") {
      return attr;
    }
    if (document.documentElement.classList.contains("dark")) {
      return "dark";
    }
  }
  return getInitialTheme();
}

export function applyTheme(
  theme: ThemeMode,
  options: { persist?: boolean; storage?: Pick<Storage, "setItem"> | null } = {}
): ThemeMode {
  const next: ThemeMode = normalizeTheme(theme);
  const persist = options.persist !== false;

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-theme", next);
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.content = THEME_TOKENS[next].bgCanvas;
    }
  }

  if (persist) {
    try {
      const store =
        options.storage !== undefined
          ? options.storage
          : typeof window !== "undefined"
            ? window.localStorage
            : null;
      store?.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage errors in restricted environments
    }
  }

  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(
      new CustomEvent<{ theme: ThemeMode }>(THEME_CHANGE_EVENT, {
        detail: { theme: next },
      })
    );
  }

  return next;
}

export function toggleThemeMode(current?: ThemeMode): ThemeMode {
  const active = current ?? getCurrentTheme();
  return applyTheme(active === "dark" ? "light" : "dark");
}

export function subscribeSystemOrToggle(listener: (theme: ThemeMode) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ theme?: ThemeMode }>).detail;
    listener(normalizeTheme(detail?.theme ?? getCurrentTheme()));
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      const next = normalizeTheme(event.newValue);
      applyTheme(next, { persist: false });
      listener(next);
    }
  };

  window.addEventListener(THEME_CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => getCurrentTheme());

  useEffect(() => {
    const current = getCurrentTheme();
    if (
      typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") !== current
    ) {
      applyTheme(current, { persist: false });
    }
    setThemeState(current);
    return subscribeSystemOrToggle(setThemeState);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    const applied = applyTheme(next);
    setThemeState(applied);
  }, []);

  const toggleTheme = useCallback(() => {
    const applied = toggleThemeMode(theme);
    setThemeState(applied);
  }, [theme]);

  return {
    theme,
    isDark: theme === "dark",
    setTheme,
    toggleTheme,
  };
}
