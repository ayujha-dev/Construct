import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, MessageSquare, Pause, Play, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { AGENTS, AGENT_ROLES, useBertStore } from "../../store/useBertStore";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

export function AgentChatStream({ onFocusNode }: { onFocusNode: (nodeId: string) => void }) {
  const { events, activeJob, documents, workItems, pauseJob, resumeJob } = useBertStore();
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState(false);
  const running = activeJob?.status === "RUNNING" || activeJob?.status === "PAUSING" || activeJob?.status === "RESUMING";
  const paused = activeJob?.status === "PAUSED";
  const sourceName = (id?: string | null) => documents.find((document) => document.id === id)?.filename ?? "uploaded source";
  const cards = useMemo(() => events.filter((event) => event.type === "agent_transition" && event.status === "completed").slice(-80), [events]);
  const escalations = workItems.filter((item) => item.verification_status !== "VERIFIED");

  const steer = async () => {
    const text = instruction.trim(); if (!text) return;
    setSending(true);
    try { if (running) await pauseJob(); await resumeJob(text); setInstruction(""); } finally { setSending(false); }
  };
  const chooseEscalation = (text: string) => {
    setInstruction(text);
    if (paused) void resumeJob(text);
  };
  return <section className="chat-panel panel-border">
    <div className="agent-strip">{AGENTS.map((agent, index) => { const current = activeJob?.current_agent_index ?? -1; const complete = activeJob?.status === "COMPLETED" || index < current; return <div className={`agent-step ${index === current && activeJob?.status !== "COMPLETED" ? "active" : ""} ${complete ? "complete" : ""}`} key={agent}><span>{complete ? <CheckCircle2 size={14} /> : index + 1}</span><small>{agent}</small></div>; })}</div>
    <div className="chat-heading"><div><span className="eyebrow">Marshal Berthier pipeline</span><h2>Live review copilot</h2><p>Seven specialist agents publish evidence-backed progress in sequence.</p></div><Badge tone={running ? "warning" : activeJob?.status === "COMPLETED" ? "success" : "neutral"}>{activeJob?.status ?? "READY"}</Badge></div>
    <div className="activity-feed">
      {cards.length === 0 && <div className="ready-card"><Sparkles size={18} /><div><strong>System ready for evidence review</strong><p>Upload a source or load the Investor Demo Case to start the live walkthrough.</p></div></div>}
      {cards.map((event, index) => <article className="activity-card" key={`${event.agent_name}-${event.latency_ms}-${index}`}><div className="activity-icon"><CheckCircle2 size={15} /></div><div className="activity-body"><div className="activity-title"><strong>{event.agent_name}</strong><span>{AGENT_ROLES[AGENTS.indexOf(event.agent_name ?? "")]} · completed</span></div><p>{event.message ?? `Reviewed ${sourceName(event.document_id)} and published the next checkpoint.`}</p><div className="activity-foot"><code>{sourceName(event.document_id)}</code>{event.node_index !== undefined && <span>Node {event.node_index + 1}</span>}<button onClick={() => { const item = workItems.find((candidate) => candidate.document_id === event.document_id); const node = item?.structured_facts[0]?.ast_node_id; if (node) onFocusNode(node); }}>View source <ArrowRight size={12} /></button></div></div><ChevronRight className="activity-chevron" size={15} /></article>)}
      {escalations.slice(0, 2).map((item) => <article className="human-alert" key={item.id}><AlertTriangle size={17} /><div><strong>Human input requested</strong><p>{item.prompt_or_question}: {item.fluent_output}</p><div className="alert-actions"><Badge tone="danger">P0 · {item.verification_status}</Badge><button onClick={() => onFocusNode(item.structured_facts[0]?.ast_node_id ?? "")}>Inspect evidence</button><button onClick={() => chooseEscalation("Enter the obscured date manually and continue.")}>Enter Date Manually</button><button onClick={() => chooseEscalation("Use fallback OCR text and continue with a human flag.")}>Use Fallback OCR Text</button><button onClick={() => chooseEscalation("Skip this source region and flag it for Legal.")}>Skip & Flag for Legal</button></div></div></article>)}
    </div>
    <div className="composer"><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void steer(); } }} placeholder="Ask BERT about your files, or type an instruction to redirect the active agent…" aria-label="Agent instruction" /><div className="composer-actions">{running && <Button tone="danger" onClick={() => void pauseJob()}><Pause size={14} />Pause Agent & Edit Task</Button>}{paused && <Button onClick={() => void resumeJob()}><Play size={14} />Resume from Checkpoint</Button>}<Button tone="primary" disabled={sending || !instruction.trim()} onClick={() => void steer()}><Send size={14} />Send Instruction</Button></div><small><MessageSquare size={12} /> Enter to steer · Shift + Enter for a new line</small></div>
  </section>;
}
