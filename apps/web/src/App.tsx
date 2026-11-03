import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { ResultsPage } from "./pages/ResultsPage";
import { useWebSocket } from "./hooks/useWebSocket";
import { useBertStore } from "./store/useBertStore";
import { bertApi } from "./lib/api";

export function App() {
  const activeJob = useBertStore((state) => state.activeJob);
  const refresh = useBertStore((state) => state.refresh);
  useWebSocket();
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!activeJob || ["COMPLETED", "FAILED"].includes(activeJob.status)) return undefined;
    const timer = window.setInterval(() => { void useBertStore.getState().refresh(); const jobId = useBertStore.getState().activeJob?.job_id; if (jobId) void fetchJob(jobId); }, 700);
    return () => window.clearInterval(timer);
  }, [activeJob?.job_id, activeJob?.status]);
  return <AppShell><Routes><Route path="/" element={<LandingPage />} /><Route path="/workspace" element={<WorkspacePage />} /><Route path="/results" element={<ResultsPage />} /><Route path="/files" element={<Navigate to="/workspace" replace />} /><Route path="/copilot" element={<Navigate to="/workspace" replace />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AppShell>;
}

async function fetchJob(jobId: string) {
  try { useBertStore.setState({ activeJob: await bertApi.getJob(jobId) }); } catch { /* local fallback owns its job */ }
}
