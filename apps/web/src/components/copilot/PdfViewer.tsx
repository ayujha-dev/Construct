import { ChevronDown, ChevronUp, Maximize2, Minus, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  setLayerDimensions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
} from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { bertApi } from "../../lib/api";
import {
  computeRegionTextMatch,
  convertPdfBboxToViewportRect,
  createFallbackPdfViewport,
  deriveNodeLocator,
  formatLocatorDisplay,
  inferSourceChip,
  normalizeBbox,
} from "../../lib/evidenceLocators";
import { useBertStore, type ActiveHighlightBox } from "../../store/useBertStore";
import type { ASTNode, Document } from "../../types/bert";

GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfViewerProps {
  document: Document;
  nodes: ASTNode[];
}

export function PdfViewer({ document: sourceDocument, nodes }: PdfViewerProps) {
  const {
    documentFiles,
    selectedNodeId,
    activeHighlightBox,
    activeLocator,
    activeCitationQuote,
    requestedPage,
    zoomLevel,
    setZoomLevel,
    setSelectedNode,
    setCurrentPdfPage,
  } = useBertStore();

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [offlineFallback, setOfflineFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [basePageSize, setBasePageSize] = useState<{ width: number; height: number }>({
    width: 612,
    height: 792,
  });

  const viewerRef = useRef<HTMLDivElement>(null);
  const pageElements = useRef<Record<number, HTMLDivElement | null>>({});
  const loadingTaskRef = useRef<ReturnType<typeof getDocument> | null>(null);

  const totalPages = pdf?.numPages ?? Math.max(sourceDocument.total_pages || 1, 1);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setOfflineFallback(false);
    setError(null);
    const initialPage =
      requestedPage && Number.isFinite(requestedPage)
        ? Math.max(1, requestedPage)
        : activeHighlightBox?.pageNumber || 1;
    setCurrentPage(initialPage);
    setBasePageSize({ width: 612, height: 792 });

    const loadPdf = async () => {
      try {
        const localFile = documentFiles[sourceDocument.id];
        const bytes = localFile ? await localFile.arrayBuffer() : await bertApi.getFile(sourceDocument.id);
        if (cancelled) return;
        const loadingTask = getDocument({ data: new Uint8Array(bytes) });
        loadingTaskRef.current = loadingTask;
        const loadedPdf = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdf(loadedPdf);
        const clampedInitial = Math.min(
          Math.max(1, activeHighlightBox?.pageNumber ?? requestedPage ?? 1),
          loadedPdf.numPages
        );
        setCurrentPage(clampedInitial);
      } catch (loadError) {
        if (cancelled) return;
        if (nodes.length > 0) {
          setOfflineFallback(true);
          setError(null);
        } else {
          setError(loadError instanceof Error ? loadError.message : "Unable to render this PDF.");
        }
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

  // Apply inbound requestedPage safely with clamping
  useEffect(() => {
    if (!requestedPage || !Number.isFinite(requestedPage)) return;
    const clamped = Math.min(Math.max(1, Math.trunc(requestedPage)), totalPages);
    setCurrentPage(clamped);
    const targetEl = pageElements.current[clamped];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [requestedPage, pdf, totalPages]);

  const setPageElement = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    pageElements.current[pageNumber] = element;
  }, []);

  const handleBasePageSize = useCallback((size: { width: number; height: number }) => {
    setBasePageSize((prev) =>
      Math.abs(prev.width - size.width) < 0.5 && Math.abs(prev.height - size.height) < 0.5 ? prev : size
    );
  }, []);

  // Track visible page via IntersectionObserver
  useEffect(() => {
    const container = viewerRef.current;
    if (!container || (!pdf && !offlineFallback)) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const pageNumber =
          visible?.target instanceof HTMLElement ? Number(visible.target.dataset.page) : undefined;
        if (pageNumber && Number.isFinite(pageNumber)) {
          setCurrentPage(pageNumber);
          setCurrentPdfPage(pageNumber);
        }
      },
      { root: container, threshold: [0.15, 0.45, 0.75] }
    );

    Object.values(pageElements.current).forEach((element) => {
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [pdf, offlineFallback, zoomLevel, totalPages, setCurrentPdfPage]);

  // Center active highlight box when page changes or zooms
  useEffect(() => {
    if (!activeHighlightBox?.pageNumber) return;
    const clamped = Math.min(Math.max(1, activeHighlightBox.pageNumber), totalPages);
    setCurrentPage(clamped);
    setCurrentPdfPage(clamped);
    const pageEl = pageElements.current[clamped];
    if (!pageEl) return;
    const highlight = pageEl.querySelector(`#pdf-highlight-${CSS.escape(activeHighlightBox.nodeId)}`);
    (highlight ?? pageEl).scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [activeHighlightBox, pdf, offlineFallback, zoomLevel, totalPages, setCurrentPdfPage]);

  const moveToPage = (pageNumber: number) => {
    const nextPage = Math.min(Math.max(1, pageNumber), totalPages);
    setCurrentPage(nextPage);
    setCurrentPdfPage(nextPage);
    pageElements.current[nextPage]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fitToWidth = () => {
    const width = viewerRef.current?.clientWidth;
    if (width && basePageSize.width) {
      setZoomLevel(Math.max(0.5, Math.min(3, (width - 44) / basePageSize.width)));
    }
  };

  const focusedNode = nodes.find((node) => node.id === selectedNodeId);
  const effectiveHighlight: ActiveHighlightBox | null = useMemo(() => {
    if (activeHighlightBox) return activeHighlightBox;
    if (focusedNode?.bounding_box) {
      return {
        ...focusedNode.bounding_box,
        nodeId: focusedNode.id,
        pageNumber: focusedNode.page_number ?? 1,
        confidence: focusedNode.ocr_confidence ?? 1.0,
        locator: deriveNodeLocator(focusedNode, sourceDocument),
      };
    }
    return null;
  }, [activeHighlightBox, focusedNode, sourceDocument]);

  // Strict DOM windowing: mount <= 4 concurrent canvases (currentPage +/- 1 + active highlight page)
  const mountedPages = useMemo(() => {
    const set = new Set<number>();
    for (let p = Math.max(1, currentPage - 1); p <= Math.min(totalPages, currentPage + 1); p++) {
      set.add(p);
    }
    if (effectiveHighlight?.pageNumber) {
      const target = Math.min(Math.max(1, effectiveHighlight.pageNumber), totalPages);
      if (set.size < 4) set.add(target);
    }
    return set;
  }, [currentPage, effectiveHighlight?.pageNumber, totalPages]);

  const sourceChip = inferSourceChip(sourceDocument, activeLocator);

  if (error) {
    return (
      <div className="document-viewer-error">
        <RefreshCw size={16} />
        <strong>PDF preview unavailable</strong>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <section
      className="pdf-viewer"
      data-testid="pdf-viewer"
      aria-label={`${sourceDocument.filename} PDF preview`}
    >
      <div className="viewer-toolbar zoom-toolbar">
        <div className="viewer-toolbar-group">
          <button
            type="button"
            className="viewer-tool-button"
            aria-label="Zoom out"
            onClick={() => setZoomLevel(zoomLevel - 0.1)}
            disabled={zoomLevel <= 0.5}
          >
            <Minus size={14} />
          </button>
          <span className="zoom-readout">{Math.round(zoomLevel * 100)}%</span>
          <button
            type="button"
            className="viewer-tool-button"
            aria-label="Zoom in"
            onClick={() => setZoomLevel(zoomLevel + 0.1)}
            disabled={zoomLevel >= 3}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="viewer-tool-button viewer-fit-button"
            aria-label="Fit PDF to width"
            onClick={fitToWidth}
          >
            <Maximize2 size={13} /> Fit width
          </button>
          {sourceChip === "SCAN" && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border border-[var(--status-danger-border)] font-mono text-[10px] font-bold">
              SCAN OCR
            </span>
          )}
        </div>

        <div className="page-navigation">
          <button
            type="button"
            className="viewer-tool-button"
            aria-label="Previous page"
            onClick={() => moveToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronUp size={14} />
          </button>
          <span data-testid="page-indicator" className="tabular-nums">
            Page <strong>{currentPage}</strong> of <strong>{pdf?.numPages ?? totalPages}</strong>
          </span>
          <button
            type="button"
            className="viewer-tool-button"
            aria-label="Next page"
            onClick={() => moveToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {offlineFallback && (
        <div className="px-3 py-1.5 bg-[var(--status-warning-soft)] border-b border-[var(--status-warning-border)] text-[var(--status-warning-ink)] text-[11px] flex items-center justify-between">
          <span>Offline spatial layout preview (source PDF stream unavailable locally)</span>
          <span className="font-mono text-[10px]">
            {formatLocatorDisplay(activeLocator, sourceDocument, effectiveHighlight?.pageNumber, effectiveHighlight).label}
          </span>
        </div>
      )}

      <div
        className="pdf-stage pdf-container overflow-auto"
        ref={viewerRef}
        style={{ "--total-scale-factor": zoomLevel } as React.CSSProperties}
      >
        {!pdf && !offlineFallback && !error && (
          <div className="document-viewer-loading">
            <RefreshCw size={16} className="spin" /> Loading PDF pages…
          </div>
        )}

        {pdf &&
          Array.from({ length: pdf.numPages }, (_, index) => {
            const pageNum = index + 1;
            const isMounted = mountedPages.has(pageNum);
            const activeForPage = effectiveHighlight?.pageNumber === pageNum ? effectiveHighlight : null;
            if (!isMounted) {
              return (
                <div
                  key={`${sourceDocument.id}-ph-${pageNum}`}
                  className="pdf-page flex items-center justify-center text-xs font-mono text-[#524E47] tabular-nums"
                  data-page={pageNum}
                  ref={(element) => setPageElement(pageNum, element)}
                  style={{
                    width: Math.round(basePageSize.width * zoomLevel),
                    height: Math.round(basePageSize.height * zoomLevel),
                  }}
                >
                  Page {pageNum}
                </div>
              );
            }
            return (
              <PdfPage
                key={`${sourceDocument.id}-${pageNum}`}
                pageNumber={pageNum}
                pdf={pdf}
                zoomLevel={zoomLevel}
                activeHighlight={activeForPage}
                activeQuote={activeCitationQuote}
                onPageElement={setPageElement}
                onBaseSize={handleBasePageSize}
                focusedNode={focusedNode}
                onSelectNode={setSelectedNode}
              />
            );
          })}

        {!pdf && offlineFallback && (
          <OfflinePdfFallbackPage
            document={sourceDocument}
            nodes={nodes}
            zoomLevel={zoomLevel}
            pageNumber={currentPage}
            activeHighlight={effectiveHighlight}
            activeQuote={activeCitationQuote}
            onPageElement={setPageElement}
            onSelectNode={setSelectedNode}
          />
        )}
      </div>
    </section>
  );
}

function PdfPage({
  pageNumber,
  pdf,
  zoomLevel,
  activeHighlight,
  activeQuote,
  onPageElement,
  onBaseSize,
  focusedNode,
  onSelectNode,
}: {
  pageNumber: number;
  pdf: PDFDocumentProxy;
  zoomLevel: number;
  activeHighlight: ActiveHighlightBox | null;
  activeQuote: string | null;
  onPageElement: (pageNumber: number, element: HTMLDivElement | null) => void;
  onBaseSize: (size: { width: number; height: number }) => void;
  focusedNode: ASTNode | undefined;
  onSelectNode: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const highlightAnchorRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [regionScore, setRegionScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(pageNumber).then((loadedPage) => {
      if (!cancelled) setPage(loadedPage);
    });
    return () => {
      cancelled = true;
    };
  }, [pageNumber, pdf]);

  // Render canvas & selectable TextLayer in lockstep
  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayerEl = textLayerRef.current;
    if (!canvas || !page) return undefined;

    const vp = page.getViewport({ scale: zoomLevel });
    setViewport(vp);
    if (pageNumber === 1) {
      const baseVp = page.getViewport({ scale: 1 });
      onBaseSize({ width: baseVp.width, height: baseVp.height });
    }

    const outputScale = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.ceil(vp.width * outputScale);
    canvas.height = Math.ceil(vp.height * outputScale);
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;

    const ctx = canvas.getContext("2d", { alpha: false });
    const renderTask = ctx
      ? page.render({
          canvas,
          canvasContext: ctx,
          viewport: vp,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        })
      : null;
    if (renderTask) {
      void renderTask.promise.catch(() => undefined);
    }

    let textLayerInstance: TextLayer | null = null;
    if (textLayerEl) {
      textLayerEl.replaceChildren();
      setLayerDimensions(textLayerEl, vp);
      textLayerInstance = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerEl,
        viewport: vp,
      });
      void textLayerInstance.render().catch(() => undefined);
    }

    return () => {
      renderTask?.cancel();
      textLayerInstance?.cancel();
    };
  }, [onBaseSize, page, pageNumber, zoomLevel]);

  const projectedRect = useMemo(() => {
    if (!activeHighlight || !viewport) return null;
    return convertPdfBboxToViewportRect(viewport, activeHighlight);
  }, [activeHighlight, viewport]);

  // Verify quote-in-region text match against extracted PDF text items inside the projected bbox
  useEffect(() => {
    let cancelled = false;
    if (!page || !viewport || !projectedRect || !activeHighlight) {
      setRegionScore(null);
      return undefined;
    }

    const quote = activeQuote ?? focusedNode?.verbatim_text ?? "";
    if (!quote.trim()) {
      setRegionScore(null);
      return undefined;
    }

    const extractAndCompare = async () => {
      try {
        const textContent = await page.getTextContent();
        if (cancelled) return;
        const margin = 18 * zoomLevel;
        const parts: string[] = [];
        for (const item of textContent.items) {
          if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) continue;
          const tx = item.transform[4];
          const ty = item.transform[5];
          const pt = viewport.convertToViewportPoint(tx, ty);
          const itemH = Math.max(8, Math.hypot(item.transform[2], item.transform[3]) * zoomLevel);
          const itemTop = pt[1] - itemH;
          const itemBottom = pt[1] + 4;
          const itemLeft = pt[0];
          const itemRight = itemLeft + Math.max(4, item.width * zoomLevel);

          const overlapsX = itemRight >= projectedRect.left - margin && itemLeft <= projectedRect.right + margin;
          const overlapsY = itemBottom >= projectedRect.top - margin && itemTop <= projectedRect.bottom + margin;
          if (overlapsX && overlapsY) {
            parts.push(item.str);
          }
        }
        const regionText = parts.join(" ");
        if (regionText.trim()) {
          const score = computeRegionTextMatch(quote, regionText);
          if (!cancelled) setRegionScore(score);
        } else if (!cancelled) {
          setRegionScore(null);
        }
      } catch {
        if (!cancelled) setRegionScore(null);
      }
    };

    void extractAndCompare();
    return () => {
      cancelled = true;
    };
  }, [activeHighlight, activeQuote, focusedNode?.verbatim_text, page, projectedRect, viewport, zoomLevel]);

  useEffect(() => {
    if (projectedRect) {
      highlightAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [projectedRect]);

  const hasHighlight = Boolean(activeHighlight && projectedRect && viewport);
  const conf = activeHighlight?.confidence ?? 1.0;
  const confidenceTone = conf >= 0.9 ? "verified" : conf >= 0.75 ? "warning" : "low";
  const pageW = viewport?.width ?? 0;
  const pageH = viewport?.height ?? 0;

  const tooltipLeft = projectedRect ? Math.max(4, Math.min(projectedRect.left, Math.max(4, pageW - 264))) : 8;
  const tooltipTop = projectedRect
    ? projectedRect.top < 54
      ? Math.min(Math.max(4, pageH - 46), projectedRect.bottom + 8)
      : Math.max(4, projectedRect.top - 48)
    : 8;

  return (
    <div
      className="pdf-page"
      data-page={pageNumber}
      ref={(element) => onPageElement(pageNumber, element)}
      style={
        {
          width: pageW || undefined,
          height: pageH || undefined,
          "--total-scale-factor": zoomLevel,
        } as React.CSSProperties
      }
    >
      <canvas ref={canvasRef} className="relative z-0" aria-label={`Page ${pageNumber}`} />
      <div ref={textLayerRef} className="textLayer z-[1]" />

      {hasHighlight && projectedRect && (
        <svg
          className={`pdf-overlay z-[2] pdf-overlay-${confidenceTone}`}
          width={pageW}
          height={pageH}
          viewBox={`0 0 ${pageW} ${pageH}`}
          aria-label={`Focus evidence for page ${pageNumber}`}
        >
          <rect
            id={`pdf-highlight-${activeHighlight!.nodeId}`}
            data-node-id={activeHighlight!.nodeId}
            className="pdf-highlight-rect highlight-box"
            x={projectedRect.left}
            y={projectedRect.top}
            width={projectedRect.width}
            height={projectedRect.height}
            rx="3"
            onClick={() => onSelectNode(activeHighlight!.nodeId)}
          />
        </svg>
      )}

      {hasHighlight && projectedRect && (
        <div
          ref={highlightAnchorRef}
          className="pdf-highlight-anchor"
          style={{
            left: projectedRect.left,
            top: projectedRect.top,
            width: projectedRect.width,
            height: projectedRect.height,
          }}
          aria-hidden="true"
        />
      )}

      {hasHighlight && projectedRect && (
        <div
          data-testid="pdf-highlight-tooltip"
          className={`pdf-highlight-tooltip pdf-tooltip-${confidenceTone}`}
          style={{ left: tooltipLeft, top: tooltipTop }}
        >
          <div className="pdf-highlight-tooltip-header">
            <strong>{(conf * 100).toFixed(1)}% Match</strong>
            <span>· p.{pageNumber}</span>
            {regionScore !== null && (
              <span>
                · {regionScore >= 97 ? `✓ ${regionScore.toFixed(1)}% Region` : `${regionScore.toFixed(1)}% Region`}
              </span>
            )}
          </div>
          {(activeQuote ?? focusedNode?.verbatim_text) && (
            <small>{(activeQuote ?? focusedNode?.verbatim_text ?? "").slice(0, 78)}</small>
          )}
        </div>
      )}
    </div>
  );
}

function OfflinePdfFallbackPage({
  document: sourceDocument,
  nodes,
  zoomLevel,
  pageNumber,
  activeHighlight,
  activeQuote,
  onPageElement,
  onSelectNode,
}: {
  document: Document;
  nodes: ASTNode[];
  zoomLevel: number;
  pageNumber: number;
  activeHighlight: ActiveHighlightBox | null;
  activeQuote: string | null;
  onPageElement: (pageNumber: number, element: HTMLDivElement | null) => void;
  onSelectNode: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loc = activeHighlight?.locator?.source_type === "pdf" ? activeHighlight.locator : null;
  const fallbackViewport = createFallbackPdfViewport(
    loc?.page_width ?? 612,
    loc?.page_height ?? 792,
    loc?.rotation ?? 0,
    zoomLevel,
    loc?.crop_box ?? null
  );
  const pageNodes = nodes.filter((n) => (n.page_number ?? 1) === pageNumber);
  const targetBox = activeHighlight
    ? normalizeBbox(activeHighlight)
    : loc?.bbox
      ? normalizeBbox(loc.bbox)
      : null;
  const rect = targetBox ? convertPdfBboxToViewportRect(fallbackViewport, targetBox) : null;
  const conf = activeHighlight?.confidence ?? 1.0;
  const confidenceTone = conf >= 0.9 ? "verified" : conf >= 0.75 ? "warning" : "low";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#181715";
    ctx.font = `${Math.max(10, Math.round(11 * zoomLevel))}px sans-serif`;
    pageNodes.forEach((node, idx) => {
      const nodeRect = node.bounding_box
        ? convertPdfBboxToViewportRect(fallbackViewport, node.bounding_box)
        : { left: 48, top: 64 + idx * 54, width: fallbackViewport.width - 96, height: 32 };
      ctx.fillText(node.verbatim_text.slice(0, 76), nodeRect.left, Math.min(canvas.height - 12, nodeRect.top + 14));
    });
  }, [fallbackViewport, pageNodes, zoomLevel]);

  return (
    <div
      className="pdf-page"
      data-page={pageNumber}
      ref={(el) => onPageElement(pageNumber, el)}
      style={{
        width: fallbackViewport.width,
        height: fallbackViewport.height,
        "--total-scale-factor": zoomLevel,
      } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        className="relative z-0 bg-white"
        width={Math.round(fallbackViewport.width)}
        height={Math.round(fallbackViewport.height)}
        style={{ width: fallbackViewport.width, height: fallbackViewport.height }}
        aria-label={`Page ${pageNumber} fallback surface`}
      />
      <div className="textLayer z-[1]">
        {pageNodes.map((node, idx) => {
          const nodeRect = node.bounding_box
            ? convertPdfBboxToViewportRect(fallbackViewport, node.bounding_box)
            : { left: 48, top: 64 + idx * 54, width: fallbackViewport.width - 96, height: 32 };
          return (
            <span
              key={node.id}
              style={{
                left: nodeRect.left,
                top: nodeRect.top,
                fontSize: `${Math.max(10, 12 * zoomLevel)}px`,
                whiteSpace: "normal",
                maxWidth: Math.max(120, nodeRect.width),
              }}
            >
              {node.verbatim_text}
            </span>
          );
        })}
      </div>

      {rect && activeHighlight && (
        <svg
          className={`pdf-overlay z-[2] pdf-overlay-${confidenceTone}`}
          width={fallbackViewport.width}
          height={fallbackViewport.height}
          viewBox={`0 0 ${fallbackViewport.width} ${fallbackViewport.height}`}
        >
          <rect
            id={`pdf-highlight-${activeHighlight.nodeId}`}
            className="pdf-highlight-rect highlight-box"
            x={rect.left}
            y={rect.top}
            width={rect.width}
            height={rect.height}
            rx="3"
            onClick={() => onSelectNode(activeHighlight.nodeId)}
          />
        </svg>
      )}

      {rect && activeHighlight && (
        <div
          className={`pdf-highlight-tooltip pdf-tooltip-${confidenceTone}`}
          style={{
            left: Math.max(4, Math.min(rect.left, Math.max(4, fallbackViewport.width - 240))),
            top: rect.top < 48 ? rect.bottom + 6 : Math.max(4, rect.top - 44),
          }}
        >
          <strong>{(conf * 100).toFixed(1)}% Match</strong>
          <span>· {sourceDocument.filename} p.{pageNumber}</span>
          {activeQuote && <small>{activeQuote.slice(0, 72)}</small>}
        </div>
      )}
    </div>
  );
}
