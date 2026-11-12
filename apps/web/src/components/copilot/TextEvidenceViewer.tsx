import { FileText, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bertApi } from "../../lib/api";
import { useBertStore } from "../../store/useBertStore";
import type { ASTNode, Document } from "../../types/bert";

interface TextEvidenceViewerProps {
  document: Document;
  nodes: ASTNode[];
}

export function TextEvidenceViewer({ document: sourceDocument, nodes }: TextEvidenceViewerProps) {
  const { documentFiles, selectedNodeId, activeLocator, setSelectedNode } = useBertStore();
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focusedLineRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const loadText = async () => {
      try {
        const localFile = documentFiles[sourceDocument.id];
        if (localFile) {
          const text = await localFile.text();
          if (!cancelled) setLines(text.split(/\r?\n/));
          return;
        }
        const bytes = await bertApi.getFile(sourceDocument.id);
        const text = new TextDecoder().decode(bytes);
        if (!cancelled) setLines(text.split(/\r?\n/));
      } catch (err) {
        if (nodes.length > 0 && !cancelled) {
          setLines(nodes.map((n) => n.verbatim_text));
        } else if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load text file.");
        }
      }
    };
    void loadText();
    return () => {
      cancelled = true;
    };
  }, [documentFiles, nodes, sourceDocument.id]);

  const focusedRange = useMemo(() => {
    const loc =
      activeLocator?.source_type === "text" && activeLocator.doc_id === sourceDocument.id
        ? activeLocator
        : null;
    if (loc?.line_start) {
      return { start: loc.line_start, end: loc.line_end ?? loc.line_start };
    }
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (node?.locator?.source_type === "text" && node.locator.line_start) {
      return { start: node.locator.line_start, end: node.locator.line_end ?? node.locator.line_start };
    }
    if (node) {
      return { start: node.node_order + 1, end: node.node_order + 1 };
    }
    return null;
  }, [activeLocator, nodes, selectedNodeId, sourceDocument.id]);

  useEffect(() => {
    focusedLineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedRange, lines]);

  if (error) {
    return (
      <div className="document-viewer-error">
        <FileText size={16} />
        <strong>Text preview unavailable</strong>
        <p>{error}</p>
      </div>
    );
  }
  if (!lines) {
    return (
      <div className="document-viewer-loading">
        <RefreshCw size={16} className="spin" /> Loading document text…
      </div>
    );
  }

  return (
    <section className="text-viewer" aria-label={`${sourceDocument.filename} text preview`}>
      <div className="viewer-toolbar">
        <span className="font-mono text-[11px] font-semibold text-zinc-700">
          {sourceDocument.filename}
        </span>
        <span className="font-mono text-[11px] text-zinc-600">{lines.length} lines</span>
      </div>
      <div className="text-viewer-scroll">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const isFocused = Boolean(
            focusedRange && lineNumber >= focusedRange.start && lineNumber <= focusedRange.end
          );
          const matchingNode =
            nodes.find((n) => n.locator?.source_type === "text" && n.locator.line_start === lineNumber) ??
            nodes.find((n) => n.node_order + 1 === lineNumber);
          return (
            <button
              key={lineNumber}
              type="button"
              ref={isFocused && (!focusedRange || lineNumber === focusedRange.start) ? focusedLineRef : undefined}
              onClick={() => {
                if (matchingNode) setSelectedNode(matchingNode.id);
              }}
              className={`text-viewer-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isFocused ? "text-line-focused highlight-box" : ""
              }`}
            >
              <span className="text-line-num">{lineNumber}</span>
              <span className="text-line-content">{line || "\u00a0"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
