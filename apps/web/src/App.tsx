import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { ResultsPage } from "./pages/ResultsPage";
import { useWebSocket } from "./hooks/useWebSocket";
import { useBertStore } from "./store/useBertStore";

function UrlStateSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const selectedDocumentId = useBertStore((state) => state.selectedDocumentId);
  const selectedNodeId = useBertStore((state) => state.selectedNodeId);
  const activeHighlightBox = useBertStore((state) => state.activeHighlightBox);
  const documents = useBertStore((state) => state.documents);
  const setSelectedDocument = useBertStore((state) => state.setSelectedDocument);
  const setSelectedNode = useBertStore((state) => state.setSelectedNode);

  useEffect(() => {
    if (location.pathname !== "/workspace") return;
    const urlDoc = searchParams.get("doc");
    const urlNode = searchParams.get("node");

    if (urlDoc && urlDoc !== selectedDocumentId) {
      const match = documents.find((d) => d.id === urlDoc || d.filename === urlDoc);
      if (match) {
        setSelectedDocument(match.id);
      }
    }

    if (urlNode && urlNode !== selectedNodeId) {
      setSelectedNode(urlNode);
    }
  }, [location.pathname, searchParams, documents, selectedDocumentId, selectedNodeId, setSelectedDocument, setSelectedNode]);

  useEffect(() => {
    if (location.pathname !== "/workspace") return;
    const currentDoc = searchParams.get("doc") || null;
    const currentNode = searchParams.get("node") || null;
    const currentPage = searchParams.get("page") || null;

    const targetDoc = selectedDocumentId || null;
    const targetNode = selectedNodeId || null;
    const targetPage = activeHighlightBox?.pageNumber ? String(activeHighlightBox.pageNumber) : null;

    if (currentDoc === targetDoc && currentNode === targetNode && currentPage === targetPage) {
      return;
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (targetDoc) {
          next.set("doc", targetDoc);
        } else {
          next.delete("doc");
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
        return next;
      },
      { replace: true }
    );
  }, [location.pathname, selectedDocumentId, selectedNodeId, activeHighlightBox?.pageNumber, searchParams, setSearchParams]);

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
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/files" element={<Navigate to="/workspace" replace />} />
        <Route path="/copilot" element={<Navigate to="/workspace" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
