import { Activity, BarChart3, BookOpen, FileUp, Pause, Play, ShieldCheck } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { AGENTS, useBertStore } from "../../store/useBertStore";
import { Button } from "../ui/Button";

const links = [
  { to: "/", label: "1. Overview & Pitch", icon: BookOpen, end: true },
  { to: "/workspace", label: "2. Live Review Copilot", icon: Activity, end: false },
  { to: "/results", label: "3. Results & Executive Summary", icon: BarChart3, end: false },
];

export function TopNavbar() {
  const navigate = useNavigate();
  const { workItems, documents, activeJob, loadDemo, pauseJob, resumeJob } = useBertStore();
  const running = activeJob?.status === "RUNNING" || activeJob?.status === "PAUSING" || activeJob?.status === "RESUMING";
  const paused = activeJob?.status === "PAUSED";
  const critical = workItems.filter((item) => item.priority_tier === "P0_CRITICAL").length;
  const review = workItems.filter((item) => item.priority_tier === "P1_HIGH" || item.verification_status !== "VERIFIED").length;
  const verified = workItems.filter((item) => item.verification_status === "VERIFIED" && item.priority_tier !== "P0_CRITICAL" && item.priority_tier !== "P1_HIGH").length;
  const agent = activeJob ? AGENTS[Math.min(activeJob.current_agent_index, AGENTS.length - 1)] : null;
  const source = activeJob?.current_document_id ? documents.find((doc) => doc.id === activeJob.current_document_id)?.filename : null;
  const telemetry = running ? `Active: ${agent} (Agent ${(activeJob?.current_agent_index ?? 0) + 1}/7)${source ? ` extracting facts from ${source}` : " processing source material"} (Node ${(activeJob?.current_node_index ?? 0) + 1})` : paused ? `Paused at ${agent} — applying reviewer direction` : "System Ready · Evidence gate online";
  return <header className="top-navbar">
    <button className="brand" onClick={() => navigate("/")} aria-label="BERT overview"><span className="brand-mark">B</span><span><strong>BERT</strong><small>BERTHIER INTELLIGENCE</small></span></button>
    <nav className="primary-nav" aria-label="Primary navigation">{links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}><Icon size={15} />{label}</NavLink>)}</nav>
    <div className="telemetry-pill"><span className={`live-dot ${running ? "live" : ""}`} /><span>{telemetry}</span>{running && <Button className="compact-btn" onClick={() => void pauseJob()}><Pause size={13} />Pause</Button>}{paused && <Button className="compact-btn" onClick={() => void resumeJob()}><Play size={13} />Resume</Button>}</div>
    <div className="nav-actions"><div className="counter-group"><span className="counter critical"><b>{critical}</b> Critical</span><span className="counter review"><b>{review}</b> Needs Human Input</span><span className="counter safe"><b>{verified}</b> Verified</span></div><Button tone="primary" onClick={() => { void loadDemo(); navigate("/workspace"); }}><ShieldCheck size={14} />Load Investor Demo Case</Button><NavLink className="export-link" to="/results"><FileUp size={14} />Export</NavLink></div>
  </header>;
}
