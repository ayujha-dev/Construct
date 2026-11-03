import type { ReactNode } from "react";
import { Particles } from "../ui/Particles";
import { TopNavbar } from "./TopNavbar";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <Particles className="ambient-particles" opacity={0.65} connections moveParticlesOnHover hoverEffect="parallax" speed={0.08} particleCount={220} particleSpread={13} particleColors={["#8b5cf6", "#38bdf8", "#34d399"]} />
    <TopNavbar />
    <main className="app-main">{children}</main>
  </div>;
}
