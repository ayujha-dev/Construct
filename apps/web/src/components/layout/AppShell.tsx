import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { WeTransferIconRail } from "../navigation/WeTransferIconRail";
import { WeTransferTopPill } from "../navigation/WeTransferTopPill";
import { AttioSidebar } from "../navigation/AttioSidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isLanding = location.pathname === "/";

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 flex overflow-hidden font-ui">
      {isLanding ? (
        <>
          <WeTransferIconRail />
          <WeTransferTopPill />
          <div className="flex-1 ml-16 min-h-screen overflow-y-auto">
            {children}
          </div>
        </>
      ) : (
        <div className="flex w-full h-screen overflow-hidden">
          <AttioSidebar />
          <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
