import { useEffect, useState } from "react";
import { getCurrentTheme, subscribeSystemOrToggle, type ThemeMode } from "../../../lib/theme";

export interface AuroraThemeConfig {
  colorStops: string[];
  opacity: number;
  glow: number;
  lightMode: boolean;
  amplitude: number;
  blend: number;
  height: number;
  speed: number;
}

export interface ShapeGridThemeConfig {
  lineColor: string;
  hoverColor: string;
  hoverFillColor: string;
  fillOpacity: number;
  glow: number;
  shape: "square" | "tile" | "hexagon" | "triangle" | "diamond" | "circle" | "cross" | "dot";
  cellSize: number;
  speed: number;
}

export interface BackdropThemeConfig {
  aurora: AuroraThemeConfig;
  shapeGrid: ShapeGridThemeConfig;
}

/**
 * Safely resolves a CSS variable from document.documentElement or falls back to a provided hex.
 */
export function resolveCssToken(propName: string, fallback: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallback;
  }
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue(propName).trim();
    return val || fallback;
  } catch {
    return fallback;
  }
}

export function getBackdropTheme(isDark: boolean): BackdropThemeConfig {
  if (isDark) {
    const brandAccent = resolveCssToken("--accent-brand", "#1B4965");
    const surfaceBg = resolveCssToken("--bg-surface", "#151B23");
    const borderSubtle = resolveCssToken("--border-subtle", "#2B3544");
    const textPrimary = resolveCssToken("--text-primary", "#F4F1EA");

    return {
      aurora: {
        colorStops: [brandAccent, "#38BDF8", surfaceBg],
        opacity: 0.85,
        glow: 0.6,
        lightMode: false,
        amplitude: 0.85,
        blend: 0.6,
        height: 0.45,
        speed: 0.6,
      },
      shapeGrid: {
        lineColor: borderSubtle,
        hoverColor: textPrimary,
        hoverFillColor: brandAccent,
        fillOpacity: 0.12,
        glow: 0.2,
        shape: "square",
        cellSize: 44,
        speed: 0.35,
      },
    };
  }

  // Light Mode
  const brandAccent = resolveCssToken("--accent-brand", "#1B4965");
  const secondaryBorder = resolveCssToken("--accent-brand-border", "#B8CFE0");
  const secondarySoft = resolveCssToken("--accent-brand-soft", "#EBF2F7");

  return {
    aurora: {
      // Pastel tints of brand accent and secondary token
      colorStops: [brandAccent, secondaryBorder, secondarySoft],
      opacity: 0.65,
      glow: 0.45,
      lightMode: true,
      amplitude: 0.75,
      blend: 0.5,
      height: 0.45,
      speed: 0.5,
    },
    shapeGrid: {
      lineColor: "#DED8CE", // Low-contrast warm gray from ink token
      hoverColor: brandAccent,
      hoverFillColor: brandAccent,
      fillOpacity: 0.08,
      glow: 0.2,
      shape: "square",
      cellSize: 44,
      speed: 0.3,
    },
  };
}

/**
 * Hook to reactively track theme changes and provide updated backdrop tokens
 * without remounting the backdrop components.
 */
export function useBackdropTheme(): { themeConfig: BackdropThemeConfig; isDark: boolean } {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getCurrentTheme());

  useEffect(() => {
    setThemeMode(getCurrentTheme());
    const unsubscribe = subscribeSystemOrToggle((next) => {
      setThemeMode(next);
    });
    return unsubscribe;
  }, []);

  const isDark = themeMode === "dark";
  const themeConfig = getBackdropTheme(isDark);

  return { themeConfig, isDark };
}
