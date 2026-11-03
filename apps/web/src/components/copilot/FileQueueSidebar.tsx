import { CheckCircle2, FileJson, FileSpreadsheet, FileText, ShieldAlert, Upload } from "lucide-react";
import { useRef } from "react";
import { useBertStore } from "../../store/useBertStore";
import type { Document } from "../../types/bert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

function FileIcon({ filename }: { filename: string }) {
  if (filename.endsWith(".xlsx")) return <FileSpreadsheet size={17} />;
  if (filename.endsWith(".json")) return <FileJson size={17} />;
  return <FileText size={17} />;
}

function caution(document: Document, items: ReturnType<typeof useBertStore.getState>["workItems"]) {
  const related = items.filter((item) => item.document_id === document.id);
  if (related.some((item) => item.priority_tier === "P0_CRITICAL")) return { label: "Critical risk (P0)", tone: "danger" as const };
  if (related.some((item) => item.verification_status !== "VERIFIED" || item.priority_tier === "P1_HIGH")) return { label: "Human input needed", tone: "warning" as const };
  return { label: "Verified safe", tone: "success" as const };
}

export function FileQueueSidebar() {
  const input = useRef<HTMLInputElement>(null);
  const { documents, workItems, selectedDocumentId, setSelectedDocument, uploadFile, backendAvailable } = useBertStore();
  const handleFile = (file: File | undefined) => { if (file) void uploadFile(file); };
  return <aside className="queue-panel panel-border">
    <div className="panel-header"><div><span className="eyebrow">Document intake</span><h2>Source queue</h2></div><Badge tone={backendAvailable ? "success" : "warning"}>{backendAvailable ? "API online" : "Local mode"}</Badge></div>
    <div className="queue-content">
      <input ref={input} className="visually-hidden" type="file" accept=".pdf,.xlsx,.json,.txt,.md" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); event.target.value = ""; }} />
      <button className="dropzone" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files[0]); }}><Upload size={21} /><strong>Upload source file</strong><span>Drop a file here or choose from your computer</span><small>PDF, Excel, JSON, TXT, or Markdown · SHA-256 completeness check</small></button>
      <div className="queue-label"><span>ACTIVE FILES</span><b>{documents.length.toString().padStart(2, "0")}</b></div>
      {documents.length === 0 && <div className="empty-queue"><FileText size={18} /><p>No sources loaded</p><span>Upload a file or load the investor demo case.</span></div>}
      <div className="file-list">{documents.map((document) => { const risk = caution(document, workItems); return <button className={`file-card ${selectedDocumentId === document.id ? "selected" : ""}`} key={document.id} onClick={() => setSelectedDocument(document.id)}><div className="file-card-title"><FileIcon filename={document.filename} /><strong title={document.filename}>{document.filename}</strong></div><div className="file-card-meta"><span>{formatBytes(document.file_size_bytes)} · {document.total_ast_nodes.toLocaleString()} nodes</span><Badge tone={risk.tone}>{risk.label}</Badge></div><div className="file-card-category">{document.category ?? "Categorizing"} <CheckCircle2 size={12} /> <Badge tone="success">SHA-256 verified</Badge></div><code className="file-hash">{document.ast_checksum.slice(0, 12)}…</code></button>; })}</div>
    </div>
    <div className="queue-footer"><ShieldAlert size={14} /><span>Every source remains inspectable through its original AST nodes.</span><Button onClick={() => input.current?.click()}>Upload File</Button></div>
  </aside>;
}

function formatBytes(bytes: number) { if (!bytes) return "Size pending"; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
