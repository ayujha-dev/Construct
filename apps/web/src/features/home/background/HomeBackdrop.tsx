import { Component, type ErrorInfo, type ReactNode, Suspense, lazy } from "react";
import { useBackdropTheme } from "./backdropTheme";

const HomeBackdropInner = lazy(() => import("./HomeBackdropInner"));

interface BackdropErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface BackdropErrorBoundaryState {
  hasError: boolean;
}

class BackdropErrorBoundary extends Component<
  BackdropErrorBoundaryProps,
  BackdropErrorBoundaryState
> {
  state: BackdropErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): BackdropErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Fallback gracefully to static gradient placeholder if canvas/WebGL initialization fails.
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function BackdropPlaceholder() {
  const { isDark } = useBackdropTheme();

  return (
    <div
      data-testid="home-backdrop-placeholder"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        backgroundColor: "var(--bg-canvas)",
        backgroundImage: isDark
          ? "radial-gradient(ellipse 85% 55% at 50% 0%, rgba(27, 73, 101, 0.38) 0%, rgba(56, 189, 248, 0.12) 48%, transparent 80%)"
          : "radial-gradient(ellipse 85% 55% at 50% 0%, rgba(184, 207, 224, 0.45) 0%, rgba(235, 242, 247, 0.25) 52%, transparent 80%)",
      }}
    />
  );
}

export function HomeBackdrop() {
  return (
    <BackdropErrorBoundary fallback={<BackdropPlaceholder />}>
      <Suspense fallback={<BackdropPlaceholder />}>
        <HomeBackdropInner />
      </Suspense>
    </BackdropErrorBoundary>
  );
}

export default HomeBackdrop;
