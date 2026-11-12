import { ChevronDown, ChevronRight, FileJson, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bertApi } from "../../lib/api";
import {
  formatCanonicalJsonPath,
  isJsonPathAncestor,
  jsonPathsMatch,
  parseJsonPathTokens,
} from "../../lib/evidenceLocators";
import { useBertStore } from "../../store/useBertStore";
import type { ASTNode, Document } from "../../types/bert";

interface JsonTreeViewerProps {
  document: Document;
  nodes: ASTNode[];
}

export function JsonTreeViewer({ document: sourceDocument, nodes }: JsonTreeViewerProps) {
  const { documentFiles, selectedNodeId, activeLocator, setSelectedNode } = useBertStore();
  const [value, setValue] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);

  const focusedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  const focusedPath = useMemo(() => {
    if (activeLocator?.source_type === "json" && activeLocator.doc_id === sourceDocument.id) {
      return activeLocator.json_path;
    }
    if (focusedNode?.locator?.source_type === "json") {
      return focusedNode.locator.json_path;
    }
    return focusedNode?.section_path ?? "";
  }, [activeLocator, focusedNode, sourceDocument.id]);

  useEffect(() => {
    let cancelled = false;
    setValue(null);
    setError(null);

    const loadJson = async () => {
      try {
        const localFile = documentFiles[sourceDocument.id];
        const bytes = localFile ? await localFile.arrayBuffer() : await bertApi.getFile(sourceDocument.id);
        if (cancelled) return;
        const text = new TextDecoder().decode(bytes);
        const parsed: unknown = JSON.parse(text);
        if (!cancelled) setValue(parsed);
      } catch (loadError) {
        if (cancelled) return;
        if (nodes.length > 0) {
          setValue(buildFallbackJsonFromNodes(nodes));
          setError(null);
        } else {
          setError(loadError instanceof Error ? loadError.message : "Unable to parse this JSON file.");
        }
      }
    };

    void loadJson();
    return () => {
      cancelled = true;
    };
  }, [documentFiles, sourceDocument.id]);

  // Scroll focused JSON item into view whenever target path or value renders
  useEffect(() => {
    if (!focusedPath || value === null) return;
    requestAnimationFrame(() => {
      const target = treeRef.current?.querySelector<HTMLElement>(".json-leaf.focused, .json-branch.focused > .json-branch-toggle");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusedPath, value]);

  if (error) {
    return (
      <div className="document-viewer-error">
        <FileJson size={16} />
        <strong>JSON preview unavailable</strong>
        <p>{error}</p>
      </div>
    );
  }
  if (value === null) {
    return (
      <div className="document-viewer-loading">
        <RefreshCw size={16} className="spin" /> Loading JSON tree…
      </div>
    );
  }

  const displayBreadcrumb = focusedPath
    ? formatCanonicalJsonPath(parseJsonPathTokens(focusedPath))
    : "$";

  return (
    <section
      className="json-viewer"
      data-testid="json-viewer"
      aria-label={`${sourceDocument.filename} JSON preview`}
    >
      <div className="json-toolbar">
        <span className="json-toolbar-label">JSON PATH</span>
        <code>{displayBreadcrumb}</code>
        <span className="json-toolbar-hint">Arrow keys expand/collapse · click node to inspect</span>
      </div>
      <div className="json-tree" ref={treeRef} role="tree" aria-label={`${sourceDocument.filename} JSON tree`}>
        <JsonBranch
          value={value}
          path="$"
          depth={0}
          focusedPath={focusedPath}
          onSelectPath={(path) => {
            const exactMatch =
              nodes.find((candidate) => candidate.locator?.source_type === "json" && jsonPathsMatch(candidate.locator.json_path, path)) ??
              nodes.find((candidate) => jsonPathsMatch(candidate.section_path, path));
            if (exactMatch) setSelectedNode(exactMatch.id);
          }}
        />
      </div>
    </section>
  );
}

function JsonBranch({
  value,
  path,
  depth,
  focusedPath,
  onSelectPath,
}: {
  value: unknown;
  path: string;
  depth: number;
  focusedPath: string;
  onSelectPath: (path: string) => void;
}) {
  const isContainer = typeof value === "object" && value !== null;
  const shouldAutoExpand =
    depth < 1 || path === "$" || isJsonPathAncestor(path, focusedPath) || jsonPathsMatch(path, focusedPath);
  const [expanded, setExpanded] = useState(shouldAutoExpand);

  useEffect(() => {
    if (shouldAutoExpand) {
      setExpanded(true);
    }
  }, [shouldAutoExpand]);

  const focused = jsonPathsMatch(focusedPath, path);

  if (!isContainer) {
    return (
      <button
        type="button"
        role="treeitem"
        data-json-path={path}
        className={`json-leaf ${focused ? "focused highlight-box" : ""}`}
        style={{ paddingLeft: `${depth * 18 + 10}px` }}
        onClick={() => onSelectPath(path)}
      >
        <span className="json-key">{pathKey(path)}</span>
        <span className={`json-value json-value-${typeof value}`}>{formatValue(value)}</span>
      </button>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);

  return (
    <div
      className={`json-branch ${focused ? "focused highlight-box" : ""}`}
      role="treeitem"
      aria-expanded={expanded}
      data-json-path={path}
    >
      <button
        type="button"
        className="json-branch-toggle"
        style={{ paddingLeft: `${depth * 18 + 6}px` }}
        onClick={() => {
          setExpanded(!expanded);
          onSelectPath(path);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            setExpanded(true);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            setExpanded(false);
          }
        }}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="json-key">{pathKey(path)}</span>
        <span className="json-bracket">
          {Array.isArray(value) ? "[" : "{"}
          {!expanded && `${entries.length} ${entries.length === 1 ? "item" : "items"}`}
          {!expanded && (Array.isArray(value) ? "]" : "}")}
        </span>
      </button>

      {expanded && (
        <div className="json-children" role="group">
          {entries.map(([key, entry]) => (
            <JsonBranch
              key={`${path}-${key}`}
              value={entry}
              path={pathFor(path, key, Array.isArray(value))}
              depth={depth + 1}
              focusedPath={focusedPath}
              onSelectPath={onSelectPath}
            />
          ))}
          <span className="json-closing" style={{ paddingLeft: `${depth * 18 + 27}px` }}>
            {Array.isArray(value) ? "]" : "}"}
          </span>
        </div>
      )}
    </div>
  );
}

function buildFallbackJsonFromNodes(nodes: ASTNode[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const node of nodes) {
    const rawPath =
      node.locator?.source_type === "json" ? node.locator.json_path : node.section_path;
    const tokens = parseJsonPathTokens(rawPath);
    if (tokens.length === 0) continue;
    let cursor: Record<string, unknown> = root;
    for (let i = 0; i < tokens.length - 1; i++) {
      const seg = tokens[i];
      if (!cursor[seg] || typeof cursor[seg] !== "object") {
        cursor[seg] = {};
      }
      cursor = cursor[seg] as Record<string, unknown>;
    }
    const leafKey = tokens[tokens.length - 1];
    if (node.structured_payload && typeof node.structured_payload === "object") {
      cursor[leafKey] = node.structured_payload;
    } else {
      cursor[leafKey] = node.verbatim_text;
    }
  }
  return root;
}

function pathFor(parent: string, key: string, array: boolean): string {
  if (array) return `${parent}[${key}]`;
  return /^[A-Za-z_$-][\w$-]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function pathKey(path: string): string {
  if (path === "$" || path === "root") return "$";
  const match = path.match(/(?:\.([^.[\]]+)|\[([^\]]+)\])$/);
  return match?.[1] ?? match?.[2]?.replace(/^"|"$/g, "") ?? path;
}

function formatValue(value: unknown): ReactNode {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === "string") return <span className="json-string">&quot;{value}&quot;</span>;
  if (typeof value === "boolean") return <span className="json-boolean">{String(value)}</span>;
  return <span className="json-number">{String(value)}</span>;
}
