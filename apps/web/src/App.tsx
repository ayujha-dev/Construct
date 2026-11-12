import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useWebSocket } from "./hooks/useWebSocket";
import { LandingPage } from "./pages/LandingPage";
import { ResultsPage } from "./pages/ResultsPage";
import { TriagePage } from "./pages/TriagePage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { registerWorkspaceNavigator, useBertStore } from "./store/useBertStore";

function UrlStateSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const workspaceId = useBertStore((state) => state.workspaceId);
  const corpusStatus = useBertStore((state) => state.corpusStatus);
  const documents = useBertStore((state) => state.documents);
  const selectedDocumentId = useBertStore((state) => state.selectedDocumentId);
  const selectedFileFilterId = useBertStore((state) => state.selectedFileFilterId);
  const selectedNodeId = useBertStore((state) => state.selectedNodeId);
  const requestedPage = useBertStore((state) => state.requestedPage);
  const currentPdfPage = useBertStore((state) => state.currentPdfPage);
  const activeHighlightBox = useBertStore((state) => state.activeHighlightBox);

  const setWorkspaceId = useBertStore((state) => state.setWorkspaceId);
  const setSelectedDocument = useBertStore((state) => state.setSelectedDocument);
  const setSelectedFileFilter = useBertStore((state) => state.setSelectedFileFilter);
  const setSelectedNode = useBertStore((state) => state.setSelectedNode);
  const setRequestedPage = useBertStore((state) => state.setRequestedPage);
  const setCurrentPdfPage = useBertStore((state) => state.setCurrentPdfPage);

  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const expectedOutboundSearchRef = useRef<string | null>(null);
  const lastProcessedSearchRef = useRef<string | null>(null);
  const lastDocsLenRef = useRef<number>(0);

  // Register cross-route citation navigator so inspectCitation() works from /results or /landing
  useEffect(() => {
    registerWorkspaceNavigator(({ docId, page, nodeId }) => {
      if (pathnameRef.current === "/workspace") return;
      const wsId = useBertStore.getState().workspaceId || "default";
      const params = new URLSearchParams();
      params.set("workspace", wsId);
      if (docId) params.set("doc", docId);
      if (page && Number.isFinite(page) && page >= 1) params.set("page", String(page));
      if (nodeId) params.set("node", nodeId);
      navigate(`/workspace?${params.toString()}`);
    });
    return () => registerWorkspaceNavigator(null);
  }, [navigate]);

  // 1. INBOUND URL -> Store sync (only when URL search changes externally or documents finish cold loading)
  useEffect(() => {
    if (location.pathname !== "/workspace") {
      lastProcessedSearchRef.current = null;
      return;
    }

    const searchChangedExternally =
      location.search !== lastProcessedSearchRef.current &&
      location.search !== expectedOutboundSearchRef.current;
    const docsJustLoaded = documents.length > 0 && lastDocsLenRef.current === 0;

    if (!searchChangedExternally && !docsJustLoaded) {
      if (location.search === expectedOutboundSearchRef.current) {
        lastProcessedSearchRef.current = location.search;
      }
      lastDocsLenRef.current = documents.length;
      return;
    }

    lastProcessedSearchRef.current = location.search;
    lastDocsLenRef.current = documents.length;

    const urlWorkspace = searchParams.get("workspace");
    if (urlWorkspace && urlWorkspace !== useBertStore.getState().workspaceId) {
      setWorkspaceId(urlWorkspace);
    }

    const urlFile = searchParams.get("file");
    const urlLegacyDoc = searchParams.get("doc");
    const urlTargetDoc = urlFile || urlLegacyDoc;

    if (urlTargetDoc && documents.length > 0) {
      const match = documents.find(
        (d) => d.id === urlTargetDoc || d.filename === urlTargetDoc
      );
      if (match) {
        if (urlFile) {
          if (useBertStore.getState().selectedFileFilterId !== match.id) {
            setSelectedFileFilter(match.id);
          }
        } else if (useBertStore.getState().selectedDocumentId !== match.id) {
          setSelectedDocument(match.id);
        }
      } else if (corpusStatus === "ready") {
        // Invalid UUID graceful fallback to first corpus document
        setSelectedDocument(documents[0].id);
        if (urlFile) setSelectedFileFilter(null);
      }
    } else if (!urlFile && searchChangedExternally && !urlLegacyDoc) {
      if (useBertStore.getState().selectedFileFilterId !== null) {
        setSelectedFileFilter(null);
      }
    }

    const urlPageRaw = searchParams.get("page");
    if (urlPageRaw !== null) {
      const parsed = Number.parseInt(urlPageRaw, 10);
      const safePage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
      setRequestedPage(safePage);
      setCurrentPdfPage(safePage);
    }

    const urlNode = searchParams.get("node");
    if (urlNode && urlNode !== useBertStore.getState().selectedNodeId) {
      setSelectedNode(urlNode);
    }
  }, [
    location.pathname,
    location.search,
    searchParams,
    corpusStatus,
    documents,
    setWorkspaceId,
    setSelectedDocument,
    setSelectedFileFilter,
    setSelectedNode,
    setRequestedPage,
    setCurrentPdfPage,
  ]);

  // 2. OUTBOUND Store -> URL sync (preserves cold-load params before corpus ready & unrelated params like ?mode=)
  useEffect(() => {
    if (location.pathname !== "/workspace") return;
    if (documents.length === 0 && corpusStatus !== "ready") return;

    const currentWorkspace = searchParams.get("workspace") || null;
    const currentFile = searchParams.get("file") || null;
    const currentDoc = searchParams.get("doc") || null;
    const currentNode = searchParams.get("node") || null;
    const currentPage = searchParams.get("page") || null;

    const targetWorkspace = workspaceId || "default";
    const targetFile = selectedFileFilterId || null;
    const targetNode = selectedNodeId || null;
    const effectivePageNum =
      activeHighlightBox?.pageNumber ?? currentPdfPage ?? requestedPage ?? null;
    const targetPage =
      effectivePageNum && Number.isFinite(effectivePageNum) && effectivePageNum >= 1
        ? String(effectivePageNum)
        : currentPage && !targetFile && !targetNode
          ? currentPage
          : null;

    // When no sidebar ?file= filter is active, still sync inspected ?doc= for deep-linking
    const targetDoc = targetFile ? null : selectedDocumentId || (currentDoc && documents.some((d) => d.id === currentDoc || d.filename === currentDoc) ? currentDoc : null);

    if (
      currentWorkspace === targetWorkspace &&
      currentFile === targetFile &&
      currentDoc === targetDoc &&
      currentNode === targetNode &&
      currentPage === targetPage
    ) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set("workspace", targetWorkspace);

    if (targetFile) {
      next.set("file", targetFile);
      next.delete("doc");
    } else {
      next.delete("file");
      if (targetDoc) {
        next.set("doc", targetDoc);
      } else {
        next.delete("doc");
      }
    }

    if (targetPage) {
      next.set("page", targetPage);
    } else {
      next.delete("page");
    }

    if (targetNode) {
      next.set("node", targetNode);
    } else {
      next.delete("node");
    }

    const nextString = next.toString();
    expectedOutboundSearchRef.current = nextString ? `?${nextString}` : "";
    setSearchParams(next, { replace: true });
  }, [
    location.pathname,
    corpusStatus,
    documents,
    workspaceId,
    selectedFileFilterId,
    selectedDocumentId,
    selectedNodeId,
    requestedPage,
    currentPdfPage,
    activeHighlightBox?.pageNumber,
    searchParams,
    setSearchParams,
  ]);

  return null;
}

export function App() {
  const refresh = useBertStore((state) => state.refresh);
  useWebSocket();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AppShell>
      <UrlStateSync />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/triage" element={<TriagePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/files" element={<Navigate to="/workspace" replace />} />
        <Route path="/copilot" element={<Navigate to="/workspace" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
