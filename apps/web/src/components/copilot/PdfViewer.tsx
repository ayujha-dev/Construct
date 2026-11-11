import { ChevronDown, ChevronUp, Maximize2, Minus, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { bertApi } from "../../lib/api";
import { useBertStore, type ActiveHighlightBox } from "../../store/useBertStore";
import type { ASTNode, Document } from "../../types/bert";

GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfViewerProps {
  document: Document;
  nodes: ASTNode[];
}

export function PdfViewer({ document: sourceDocument, nodes }: PdfViewerProps) {
  const { documentFiles, selectedNodeId, activeHighlightBox, zoomLevel, setZoomLevel, setSelectedNode } = useBertStore();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [basePageWidth, setBasePageWidth] = useState<number | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageElements = useRef<Record<number, HTMLDivElement | null>>({});
  const loadingTaskRef = useRef<ReturnType<typeof getDocument> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setError(null);
    setCurrentPage(1);
    setBasePageWidth(null);

    const loadPdf = async () => {
      try {
        const localFile = documentFiles[sourceDocument.id];
        const bytes = localFile ? await localFile.arrayBuffer() : await bertApi.getFile(sourceDocument.id);
        if (cancelled) return;
        const loadingTask = getDocument({ data: new Uint8Array(bytes) });
        loadingTaskRef.current = loadingTask;
        const loadedPdf = await loadingTask.promise;
        if (cancelled) {
          return;
        }
        setPdf(loadedPdf);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to render this PDF.");
      }
    };

    void loadPdf();
    return () => {
      cancelled = true;
      const loadingTask = loadingTaskRef.current;
      if (loadingTask) void loadingTask.destroy();
      loadingTaskRef.current = null;
    };
  }, [documentFiles, sourceDocument.id]);

  useEffect(() => {
    setZoomLevel(1);
  }, [setZoomLevel, sourceDocument.id]);

  const setPageElement = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    pageElements.current[pageNumber] = element;
  }, []);

  useEffect(() => {
    const container = viewerRef.current;
    if (!container || !pdf) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const pageNumber = visible?.target instanceof HTMLElement ? Number(visible.target.dataset.page) : undefined;
      if (pageNumber) setCurrentPage(pageNumber);
    }, { root: container, threshold: [0.25, 0.55, 0.8] });
    Object.values(pageElements.current).forEach((element) => { if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [pdf, zoomLevel]);

  useEffect(() => {
    if (!activeHighlightBox?.pageNumber) return;
    const page = pageElements.current[activeHighlightBox.pageNumber];
    if (!page) return;
    const highlight = page.querySelector(`#pdf-highlight-${CSS.escape(activeHighlightBox.nodeId)}`);
    (highlight ?? page).scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    setCurrentPage(activeHighlightBox.pageNumber);
  }, [activeHighlightBox, pdf, zoomLevel]);

  const moveToPage = (pageNumber: number) => {
    const nextPage = Math.min(Math.max(pageNumber, 1), pdf?.numPages ?? 1);
    pageElements.current[nextPage]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(nextPage);
  };

  const fitToWidth = () => {
    const width = viewerRef.current?.clientWidth;
    if (width && basePageWidth) setZoomLevel((width - 36) / basePageWidth);
  };

  const focusedNode = nodes.find((node) => node.id === selectedNodeId);
  if (error) {
    return <div className="document-viewer-error"><RefreshCw size={16} /><strong>PDF preview unavailable</strong><p>{error}</p></div>;
  }

  return <section className="pdf-viewer" aria-label={`${sourceDocument.filename} PDF preview`}>
    <div className="viewer-toolbar zoom-toolbar">
      <div className="viewer-toolbar-group">
        <button className="viewer-tool-button" aria-label="Zoom out" onClick={() => setZoomLevel(zoomLevel - 0.1)} disabled={zoomLevel <= 0.5}><Minus size={14} /></button>
        <span className="zoom-readout">{Math.round(zoomLevel * 100)}%</span>
        <button className="viewer-tool-button" aria-label="Zoom in" onClick={() => setZoomLevel(zoomLevel + 0.1)} disabled={zoomLevel >= 3}><Plus size={14} /></button>
        <button className="viewer-tool-button viewer-fit-button" aria-label="Fit PDF to width" onClick={fitToWidth}><Maximize2 size={13} /> Fit width</button>
      </div>
      <div className="page-navigation">
        <button className="viewer-tool-button" aria-label="Previous page" onClick={() => moveToPage(currentPage - 1)} disabled={currentPage <= 1}><ChevronUp size={14} /></button>
        <span>Page <strong>{currentPage}</strong> of <strong>{pdf?.numPages ?? (sourceDocument.total_pages || "—")}</strong></span>
        <button className="viewer-tool-button" aria-label="Next page" onClick={() => moveToPage(currentPage + 1)} disabled={!pdf || currentPage >= pdf.numPages}><ChevronDown size={14} /></button>
      </div>
    </div>
    <div className="pdf-stage" ref={viewerRef}>
      {!pdf && !error && <div className="document-viewer-loading"><RefreshCw size={16} className="spin" /> Loading PDF pages…</div>}
      {pdf && Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={`${sourceDocument.id}-${index + 1}`} pageNumber={index + 1} pdf={pdf} zoomLevel={zoomLevel} activeHighlight={activeHighlightBox} onPageElement={setPageElement} onBaseWidth={setBasePageWidth} focusedNode={focusedNode} onSelectNode={setSelectedNode} />)}
    </div>
  </section>;
}

function PdfPage({ pageNumber, pdf, zoomLevel, activeHighlight, onPageElement, onBaseWidth, focusedNode, onSelectNode }: {
  pageNumber: number;
  pdf: PDFDocumentProxy;
  zoomLevel: number;
  activeHighlight: ActiveHighlightBox | null;
  onPageElement: (pageNumber: number, element: HTMLDivElement | null) => void;
  onBaseWidth: (width: number) => void;
  focusedNode: ASTNode | undefined;
  onSelectNode: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightAnchorRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const activeForPage = activeHighlight?.pageNumber === pageNumber ? activeHighlight : null;

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(pageNumber).then((loadedPage) => { if (!cancelled) setPage(loadedPage); });
    return () => { cancelled = true; };
  }, [pageNumber, pdf]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return undefined;
    const viewport = page.getViewport({ scale: zoomLevel });
    const outputScale = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.ceil(viewport.width * outputScale);
    canvas.height = Math.ceil(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    setPageSize({ width: viewport.width, height: viewport.height });
    if (pageNumber === 1) onBaseWidth(page.getViewport({ scale: 1 }).width);
    const renderTask = page.render({ canvas, canvasContext: canvas.getContext("2d", { alpha: false })!, viewport, transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined });
    void renderTask.promise.catch(() => undefined);
    return () => renderTask.cancel();
  }, [onBaseWidth, page, pageNumber, zoomLevel]);

  const hasHighlight = Boolean(activeForPage && pageSize.width && pageSize.height);
  const left = activeForPage ? activeForPage.x0 * zoomLevel : 0;
  const top = activeForPage ? pageSize.height - activeForPage.y1 * zoomLevel : 0;
  const width = activeForPage ? Math.max(4, (activeForPage.x1 - activeForPage.x0) * zoomLevel) : 0;
  const height = activeForPage ? Math.max(4, (activeForPage.y1 - activeForPage.y0) * zoomLevel) : 0;
  const confidenceTone = activeForPage && activeForPage.confidence >= 0.9 ? "verified" : activeForPage && activeForPage.confidence >= 0.75 ? "warning" : "low";

  useEffect(() => {
    if (hasHighlight) highlightAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [hasHighlight, height, left, top, width]);

  return <div className="pdf-page" data-page={pageNumber} ref={(element) => onPageElement(pageNumber, element)} style={{ width: pageSize.width || undefined, height: pageSize.height || undefined }}>
    <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
    {hasHighlight && <svg className={`pdf-overlay pdf-overlay-${confidenceTone}`} width={pageSize.width} height={pageSize.height} viewBox={`0 0 ${pageSize.width} ${pageSize.height}`} onClick={() => onSelectNode(activeForPage!.nodeId)} aria-label={`Focus evidence for page ${pageNumber}`}><rect id={`pdf-highlight-${activeForPage?.nodeId}`} className="pdf-highlight-rect" x={left} y={top} width={width} height={height} rx="3" /></svg>}
    {hasHighlight && <div ref={highlightAnchorRef} className="pdf-highlight-anchor" style={{ left, top, width, height }} aria-hidden="true" />}
    {hasHighlight && <div className={`pdf-highlight-tooltip pdf-tooltip-${confidenceTone}`} style={{ left: Math.min(left, Math.max(pageSize.width - 190, 8)), top: Math.max(8, top - 38) }}><strong>{(activeForPage!.confidence * 100).toFixed(1)}% Match</strong><span>· Page {pageNumber}</span>{focusedNode?.verbatim_text && <small>{focusedNode.verbatim_text.slice(0, 78)}</small>}</div>}
  </div>;
}
