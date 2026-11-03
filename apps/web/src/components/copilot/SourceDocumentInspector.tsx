import { CheckCircle2, FileSearch, ShieldAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { useBertStore } from "../../store/useBertStore";
import { Badge } from "../ui/Badge";

export function SourceDocumentInspector() {
  const { documents, nodesByDocument, selectedDocumentId, selectedNodeId, setSelectedNode } = useBertStore();
  const nodes = selectedDocumentId ? nodesByDocument[selectedDocumentId] ?? [] : [];
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId);
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selectedNodeId) document.getElementById(`node-${selectedNodeId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [selectedNodeId, nodes.length]);
  return <aside className="inspector-panel panel-border" ref={target}><div className="panel-header"><div><span className="eyebrow">Synchronized source</span><h2>Evidence inspector</h2></div><FileSearch size={17} /></div>{selectedDocument ? <><div className="source-summary"><strong>{selectedDocument.filename}</strong><span>{selectedDocument.total_ast_nodes.toLocaleString()} extracted items · <code>{selectedDocument.ast_checksum.slice(0, 16)}…</code></span></div><div className="source-list">{nodes.length === 0 && <p className="source-empty">Loading parsed AST nodes…</p>}{nodes.map((node) => { const flagged = node.ocr_confidence < 0.9; return <button id={`node-${node.id}`} className={`source-node ${selectedNodeId === node.id ? "focused" : ""} ${flagged ? "flagged" : ""}`} key={node.id} onClick={() => setSelectedNode(node.id)}><div className="source-node-top"><Badge tone={flagged ? "danger" : "neutral"}>{node.section_path ?? `Item ${node.node_order + 1}`}</Badge><span>{node.node_type}</span>{flagged ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}</div><p>{node.verbatim_text}</p><div className="source-node-bottom"><span>Category: {node.node_type === "JSON_RULE" ? "Cloud Config" : "Evidence"}</span><code>{Math.round(node.ocr_confidence * 100)}% confidence</code></div></button>; })}</div></> : <div className="inspector-empty"><FileSearch size={22} /><strong>Select a source file</strong><p>Every paragraph, row, and JSON rule will appear here with its citation location.</p></div>}</aside>;
}
