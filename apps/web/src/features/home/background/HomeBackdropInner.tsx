import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import Aurora from "./Aurora";
import ShapeGrid from "./ShapeGrid";
import { useBackdropTheme } from "./backdropTheme";

interface WebGLErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
}

class AuroraErrorBoundary extends Component<WebGLErrorBoundaryProps, WebGLErrorBoundaryState> {
  state: WebGLErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WebGLErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Gracefully degrade to static aurora fallback without crashing the landing page.
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function detectWebGL2(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function computeCappedDpr(): number {
  if (typeof window === "undefined") return 1;
  const rawDpr = window.devicePixelRatio || 1;
  const isSmallScreen = window.innerWidth < 768;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  const isLowCoreDevice = typeof cores === "number" && cores <= 4;
  const cap = isSmallScreen || isLowCoreDevice ? 1.25 : 2;
  return Math.min(rawDpr, cap);
}

function isPointOrViewportInHero(clientY?: number): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return true;
  const heroEl = document.getElementById("hero");
  if (!heroEl) {
    return clientY !== undefined
      ? clientY <= window.innerHeight * 0.55
      : window.scrollY < window.innerHeight * 0.5;
  }
  const rect = heroEl.getBoundingClientRect();
  if (rect.bottom <= 0) return false;
  if (clientY !== undefined) {
    return clientY >= rect.top && clientY <= rect.bottom;
  }
  return rect.bottom > 80;
}

export default function HomeBackdropInner() {
  const { themeConfig, isDark } = useBackdropTheme();
  const [webgl2Available] = useState<boolean>(() => detectWebGL2());

  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  const [isTabHidden, setIsTabHidden] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.hidden;
  });

  const [dpr, setDpr] = useState<number>(() => computeCappedDpr());
  const [clickCascadeEnabled, setClickCascadeEnabled] = useState<boolean>(() =>
    isPointOrViewportInHero()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const onMotionChange = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    if (mql) {
      setIsReducedMotion(mql.matches);
      mql.addEventListener("change", onMotionChange);
    }

    const onVisibilityChange = () => setIsTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onResize = () => {
      const nextDpr = computeCappedDpr();
      setDpr((prev) => (prev !== nextDpr ? nextDpr : prev));
      const nextHero = isPointOrViewportInHero();
      setClickCascadeEnabled((prev) => (prev !== nextHero ? nextHero : prev));
    };

    const onScroll = () => {
      const nextHero = isPointOrViewportInHero();
      setClickCascadeEnabled((prev) => (prev !== nextHero ? nextHero : prev));
    };

    const onPointerMove = (e: PointerEvent) => {
      const nextHero = isPointOrViewportInHero(e.clientY);
      setClickCascadeEnabled((prev) => (prev !== nextHero ? nextHero : prev));
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      mql?.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  const isPaused = isReducedMotion || isTabHidden;

  const staticAuroraFallback = (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "50vh",
        background: isDark
          ? "radial-gradient(ellipse 85% 65% at 50% 0%, rgba(27, 73, 101, 0.45) 0%, rgba(56, 189, 248, 0.16) 45%, transparent 80%)"
          : "radial-gradient(ellipse 85% 65% at 50% 0%, rgba(184, 207, 224, 0.55) 0%, rgba(235, 242, 247, 0.35) 50%, transparent 80%)",
      }}
    />
  );

  return (
    <div
      data-testid="home-backdrop"
      data-reduced-motion={isReducedMotion ? "true" : "false"}
      data-theme-mode={isDark ? "dark" : "light"}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        backgroundColor: "var(--bg-canvas)",
        overflow: "hidden",
      }}
    >
      {/* Layer 1: Page background token (backgroundColor on root container) */}

      {/* Layer 2: ShapeGrid across full viewport */}
      <div style={{ position: "absolute", inset: 0 }}>
        <ShapeGrid
          shape={themeConfig.shapeGrid.shape}
          cellSize={themeConfig.shapeGrid.cellSize}
          speed={themeConfig.shapeGrid.speed}
          lineColor={themeConfig.shapeGrid.lineColor}
          hoverColor={themeConfig.shapeGrid.hoverColor}
          hoverFillColor={themeConfig.shapeGrid.hoverFillColor}
          fillOpacity={themeConfig.shapeGrid.fillOpacity}
          glow={themeConfig.shapeGrid.glow}
          clickCascade={clickCascadeEnabled}
          paused={isPaused}
          dpr={dpr}
          intro={!isReducedMotion}
        />
      </div>

      {/* Layer 3: Aurora scoped to hero region (height ~0.45) with WebGL2 fallback */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
      >
        {webgl2Available ? (
          <AuroraErrorBoundary fallback={staticAuroraFallback}>
            <Aurora
              colorStops={themeConfig.aurora.colorStops}
              opacity={themeConfig.aurora.opacity}
              glow={themeConfig.aurora.glow}
              lightMode={themeConfig.aurora.lightMode}
              amplitude={themeConfig.aurora.amplitude}
              blend={themeConfig.aurora.blend}
              height={themeConfig.aurora.height}
              speed={themeConfig.aurora.speed}
              paused={isPaused}
              dpr={dpr}
              intro={!isReducedMotion}
            />
          </AuroraErrorBoundary>
        ) : (
          staticAuroraFallback
        )}
      </div>

      {/* Layer 4: Soft readability scrim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: isDark
            ? "linear-gradient(to bottom, rgba(14, 17, 23, 0.16) 0%, rgba(14, 17, 23, 0.42) 48%, rgba(14, 17, 23, 0.84) 88%, var(--bg-canvas) 100%)"
            : "linear-gradient(to bottom, rgba(250, 248, 245, 0.18) 0%, rgba(250, 248, 245, 0.48) 48%, rgba(250, 248, 245, 0.86) 88%, var(--bg-canvas) 100%)",
        }}
      />
    </div>
  );
}
