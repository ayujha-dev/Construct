import { ChevronDown, ChevronRight, FileJson, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { bertApi } from "../../lib/api";
import { useBertStore } from "../../store/useBertStore";
import type { ASTNode, Document } from "../../types/bert";

interface JsonTreeViewerProps {
  document: Document;
  nodes: ASTNode[];
}

export function JsonTreeViewer({ document: sourceDocument, nodes }: JsonTreeViewerProps) {
  const { documentFiles, selectedNodeId, setSelectedNode } = useBertStore();
  const [value, setValue] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const focusedNode = nodes.find((node) => node.id === selectedNodeId);
  const focusedPath = focusedNode?.section_path ?? "";
  const expandedDefaults = useMemo(() => new Set(["root"]), []);

  useEffect(() => {
    let cancelled = false;
    setValue(null);
    setError(null);
    const loadJson = async () => {
      try {
        const localFile = documentFiles[sourceDocument.id];
        const bytes = localFile ? await localFile.arrayBuffer() : await bertApi.getFile(sourceDocument.id);
        const text = new TextDecoder().decode(bytes);
        const parsed: unknown = JSON.parse(text);
        if (!cancelled) setValue(parsed);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to parse this JSON file.");
      }
    };
    void loadJson();
    return () => { cancelled = true; };
  }, [documentFiles, sourceDocument.id]);

  if (error) return <div className="document-viewer-error"><FileJson size={16} /><strong>JSON preview unavailable</strong><p>{error}</p></div>;
  if (value === null) return <div className="document-viewer-loading"><RefreshCw size={16} className="spin" /> Loading JSON tree…</div>;

  return <section className="json-viewer" aria-label={`${sourceDocument.filename} JSON preview`}>
    <div className="json-toolbar"><span className="json-toolbar-label">JSON PATH</span><code>{focusedPath ? formatBreadcrumb(focusedPath) : "root"}</code><span className="json-toolbar-hint">Click a rule to inspect its evidence node</span></div>
    <div className="json-tree"><JsonBranch value={value} path="root" depth={0} focusedPath={focusedPath} defaultExpanded={expandedDefaults} onSelectPath={(path) => {
      const node = nodes.find((candidate) => pathsMatch(candidate.section_path, path));
      if (node) setSelectedNode(node.id);
    }} /></div>
  </section>;
}

function JsonBranch({ value, path, depth, focusedPath, defaultExpanded, onSelectPath }: {
  value: unknown;
  path: string;
  depth: number;
  focusedPath: string;
  defaultExpanded: Set<string>;
  onSelectPath: (path: string) => void;
}) {
  const isContainer = typeof value === "object" && value !== null;
  const [expanded, setExpanded] = useState(depth < 1 || defaultExpanded.has(path));
  const focused = pathsMatch(focusedPath, path);
  if (!isContainer) return <button className={`json-leaf ${focused ? "focused" : ""}`} style={{ paddingLeft: `${depth * 18 + 10}px` }} onClick={() => onSelectPath(path)}><span className="json-key">{pathKey(path)}</span><span className={`json-value json-value-${typeof value}`}>{formatValue(value)}</span></button>;

  const entries = Array.isArray(value) ? value.map((entry, index) => [String(index), entry] as const) : Object.entries(value);
  return <div className={`json-branch ${focused ? "focused" : ""}`}>
    <button className="json-branch-toggle" style={{ paddingLeft: `${depth * 18 + 6}px` }} onClick={() => { setExpanded(!expanded); onSelectPath(path); }}>
      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span className="json-key">{pathKey(path)}</span><span className="json-bracket">{Array.isArray(value) ? "[" : "{"}{!expanded && `${entries.length} ${entries.length === 1 ? "item" : "items"}`}{!expanded && (Array.isArray(value) ? "]" : "}")}</span>
    </button>
    {expanded && <div className="json-children">{entries.map(([key, entry]) => <JsonBranch key={`${path}-${key}`} value={entry} path={pathFor(path, key, Array.isArray(value))} depth={depth + 1} focusedPath={focusedPath} defaultExpanded={defaultExpanded} onSelectPath={onSelectPath} />)}<span className="json-closing" style={{ paddingLeft: `${depth * 18 + 27}px` }}>{Array.isArray(value) ? "]" : "}"}</span></div>}
  </div>;
}

function pathFor(parent: string, key: string, array: boolean): string {
  if (array) return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function pathKey(path: string): string {
  if (path === "root") return "root";
  const match = path.match(/(?:\.([^.[\]]+)|\[([^\]]+)\])$/);
  return match?.[1] ?? match?.[2]?.replace(/^"|"$/g, "") ?? path;
}

function formatBreadcrumb(path: string): string {
  const rootedPath = path.startsWith("root") ? path : `root.${path}`;
  return rootedPath.split(".").map((segment, index) => {
    if (index === 0) return segment;
    if (/^[A-Za-z_$][\w$]*$/.test(segment) || /^\[\d+\]$/.test(segment)) return `.${segment}`;
    return `[${JSON.stringify(segment)}]`;
  }).join("");
}

function pathsMatch(first: string | null | undefined, second: string): boolean {
  if (!first) return false;
  const normalize = (path: string) => path.replace(/^root\.?/, "").replace(/\["([^"\]]+)"\]/g, ".$1").replace(/\.item/g, "");
  const left = normalize(first);
  const right = normalize(second);
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function formatValue(value: unknown): ReactNode {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === "string") return <span className="json-string">&quot;{value}&quot;</span>;
  if (typeof value === "boolean") return <span className="json-boolean">{String(value)}</span>;
  return <span className="json-number">{String(value)}</span>;
}
