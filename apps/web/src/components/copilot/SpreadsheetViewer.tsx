import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { bertApi } from "../../lib/api";
import { parseXlsxColRangeColumns } from "../../lib/evidenceLocators";
import { useBertStore } from "../../store/useBertStore";
import type { ASTNode, Document } from "../../types/bert";

interface SpreadsheetViewerProps {
  document: Document;
  nodes: ASTNode[];
}

interface SheetData {
  name: string;
  rows: string[][];
}

const ROW_HEIGHT = 34;
const OVERSCAN_ROWS = 10;
const MAX_RENDERED_ROWS = 48;

export function SpreadsheetViewer({ document: sourceDocument, nodes }: SpreadsheetViewerProps) {
  const { documentFiles, selectedNodeId, activeLocator, setSelectedNode } = useBertStore();
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const [rovingCell, setRovingCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const focusedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSheets([]);
    setActiveSheet("");
    setError(null);
    setScrollTop(0);

    const loadWorkbook = async () => {
      try {
        const localFile = documentFiles[sourceDocument.id];
        const bytes = localFile ? await localFile.arrayBuffer() : await bertApi.getFile(sourceDocument.id);
        if (cancelled) return;
        const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
        const nextSheets = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          const rows = XLSX.utils
            .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
            .map((row) => row.map((value) => String(value ?? "")));
          return { name, rows };
        });
        if (!cancelled) {
          setSheets(nextSheets);
          setActiveSheet(nextSheets[0]?.name ?? "");
        }
      } catch (loadError) {
        if (cancelled) return;
        if (nodes.length > 0) {
          const built = buildFallbackSheetsFromNodes(nodes);
          setSheets(built);
          setActiveSheet(built[0]?.name ?? "");
          setError(null);
        } else {
          setError(loadError instanceof Error ? loadError.message : "Unable to read this workbook.");
        }
      }
    };

    void loadWorkbook();
    return () => {
      cancelled = true;
    };
  }, [documentFiles, sourceDocument.id]);

  // Measure scroll viewport height on mount/resize
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return undefined;
    const updateSize = () => setViewportHeight(el.clientHeight || 520);
    updateSize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateSize) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [sheets.length]);

  const focusedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  // Determine target sheet, row (1-based), and column range from activeLocator / focusedNode
  const focusedTarget = useMemo(() => {
    if (activeLocator?.source_type === "xlsx" && activeLocator.doc_id === sourceDocument.id) {
      return {
        sheet: activeLocator.sheet,
        row: activeLocator.row,
        colRange: activeLocator.col_range,
      };
    }
    if (focusedNode?.locator?.source_type === "xlsx") {
      return {
        sheet: focusedNode.locator.sheet,
        row: focusedNode.locator.row,
        colRange: focusedNode.locator.col_range,
      };
    }
    const payload = focusedNode?.structured_payload;
    if (payload) {
      const sheetName = typeof payload.sheet_name === "string" ? payload.sheet_name : undefined;
      const rowNum =
        typeof payload.row_index === "number"
          ? payload.row_index
          : typeof payload.row === "number"
            ? payload.row
            : undefined;
      return {
        sheet: sheetName,
        row: rowNum,
        colRange: undefined as string | undefined,
      };
    }
    return null;
  }, [activeLocator, focusedNode, sourceDocument.id]);

  // Auto-switch sheet tab whenever target sheet changes
  useEffect(() => {
    if (!focusedTarget?.sheet || sheets.length === 0) return;
    const match = sheets.find(
      (s) => s.name.toLowerCase() === focusedTarget.sheet!.toLowerCase()
    );
    if (match && match.name !== activeSheet) {
      setActiveSheet(match.name);
    }
  }, [activeSheet, focusedTarget?.sheet, sheets]);

  const currentSheet = sheets.find((sheet) => sheet.name === activeSheet) ?? sheets[0];
  const totalRows = currentSheet?.rows.length ?? 0;

  // Auto-scroll virtualized list to target row when focusedTarget changes
  useEffect(() => {
    if (!focusedTarget?.row || !currentSheet || totalRows === 0) return;
    if (focusedTarget.sheet && focusedTarget.sheet.toLowerCase() !== currentSheet.name.toLowerCase()) {
      return;
    }
    const targetIdx = Math.max(0, Math.min(totalRows - 1, focusedTarget.row - 1));
    setRovingCell({ row: targetIdx, col: 0 });
    const container = scrollContainerRef.current;
    if (container) {
      const desiredTop = Math.max(0, targetIdx * ROW_HEIGHT - viewportHeight / 2 + ROW_HEIGHT);
      container.scrollTop = desiredTop;
      setScrollTop(desiredTop);
    }
    requestAnimationFrame(() => {
      focusedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [currentSheet, focusedTarget?.row, focusedTarget?.sheet, totalRows, viewportHeight]);

  // O(1) lookup map from `${sheetName}::${rowNumber}` -> ASTNode
  const nodeLookup = useMemo(() => {
    const map = new Map<string, ASTNode>();
    for (const node of nodes) {
      const sheet =
        node.locator?.source_type === "xlsx"
          ? node.locator.sheet
          : typeof node.structured_payload?.sheet_name === "string"
            ? node.structured_payload.sheet_name
            : sheets[0]?.name ?? "Sheet1";
      const row =
        node.locator?.source_type === "xlsx"
          ? node.locator.row
          : typeof node.structured_payload?.row_index === "number"
            ? node.structured_payload.row_index
            : typeof node.structured_payload?.row === "number"
              ? node.structured_payload.row
              : null;
      if (row !== null) {
        map.set(`${sheet}::${row}`, node);
        map.set(`*::${row}`, node);
      }
    }
    return map;
  }, [nodes, sheets]);

  const focusedColumns = useMemo(() => {
    const cols = parseXlsxColRangeColumns(focusedTarget?.colRange);
    return new Set(cols);
  }, [focusedTarget?.colRange]);

  const maxColumns = useMemo(
    () => Math.max(1, ...(currentSheet?.rows.slice(0, 200).map((row) => row.length) ?? [1])),
    [currentSheet]
  );

  // Virtual window computation (guarantees <= MAX_RENDERED_ROWS + 3 <tr> elements total in DOM)
  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    if (totalRows <= MAX_RENDERED_ROWS) {
      return { startIndex: 0, endIndex: totalRows, topSpacerHeight: 0, bottomSpacerHeight: 0 };
    }
    const visibleCount = Math.min(MAX_RENDERED_ROWS, Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2);
    const rawStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
    const clampedStart = Math.min(rawStart, Math.max(0, totalRows - visibleCount));
    const end = Math.min(totalRows, clampedStart + visibleCount);
    return {
      startIndex: clampedStart,
      endIndex: end,
      topSpacerHeight: clampedStart * ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (totalRows - end) * ROW_HEIGHT),
    };
  }, [scrollTop, totalRows, viewportHeight]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
      let nextRow = rowIndex;
      let nextCol = colIndex;
      if (e.key === "ArrowDown") {
        nextRow = Math.min(totalRows - 1, rowIndex + 1);
      } else if (e.key === "ArrowUp") {
        nextRow = Math.max(0, rowIndex - 1);
      } else if (e.key === "ArrowRight") {
        nextCol = Math.min(maxColumns - 1, colIndex + 1);
      } else if (e.key === "ArrowLeft") {
        nextCol = Math.max(0, colIndex - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const rowNode =
          nodeLookup.get(`${currentSheet?.name ?? ""}::${rowIndex + 1}`) ??
          nodeLookup.get(`*::${rowIndex + 1}`);
        if (rowNode) setSelectedNode(rowNode.id);
        return;
      } else {
        return;
      }

      e.preventDefault();
      setRovingCell({ row: nextRow, col: nextCol });
      const container = scrollContainerRef.current;
      if (container) {
        const targetOffset = nextRow * ROW_HEIGHT;
        if (targetOffset < container.scrollTop) {
          container.scrollTop = targetOffset;
          setScrollTop(targetOffset);
        } else if (targetOffset + ROW_HEIGHT > container.scrollTop + viewportHeight - 40) {
          const nextScroll = Math.max(0, targetOffset - viewportHeight + ROW_HEIGHT * 3);
          container.scrollTop = nextScroll;
          setScrollTop(nextScroll);
        }
      }
      requestAnimationFrame(() => {
        const targetCell = scrollContainerRef.current?.querySelector<HTMLElement>(
          `td[data-row="${nextRow}"][data-col="${nextCol}"]`
        );
        targetCell?.focus();
      });
    },
    [currentSheet?.name, maxColumns, nodeLookup, setSelectedNode, totalRows, viewportHeight]
  );

  if (error) {
    return (
      <div className="document-viewer-error">
        <FileSpreadsheet size={16} />
        <strong>Spreadsheet preview unavailable</strong>
        <p>{error}</p>
      </div>
    );
  }

  if (!currentSheet) {
    return (
      <div className="document-viewer-loading">
        <RefreshCw size={16} className="spin" /> Loading workbook…
      </div>
    );
  }

  const visibleRows = currentSheet.rows.slice(startIndex, endIndex);

  return (
    <section
      className="spreadsheet-viewer"
      data-testid="spreadsheet-viewer"
      aria-label={`${sourceDocument.filename} spreadsheet preview`}
    >
      <div className="sheet-toolbar">
        <div className="sheet-tabs" role="tablist" aria-label="Workbook sheets">
          {sheets.map((sheet) => (
            <button
              key={sheet.name}
              type="button"
              role="tab"
              aria-selected={activeSheet === sheet.name}
              className={`sheet-tab ${activeSheet === sheet.name ? "active" : ""}`}
              onClick={() => {
                setActiveSheet(sheet.name);
                setScrollTop(0);
              }}
            >
              {sheet.name}
            </button>
          ))}
        </div>
        <span className="sheet-meta">
          {currentSheet.rows.length.toLocaleString()} rows · {maxColumns} cols
        </span>
      </div>

      <div
        className="spreadsheet-scroll overflow-auto"
        ref={scrollContainerRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <table className="spreadsheet-grid" role="grid" aria-rowcount={totalRows} aria-colcount={maxColumns}>
          <thead>
            <tr>
              <th className="spreadsheet-corner" aria-hidden="true" />
              {Array.from({ length: maxColumns }, (_, index) => (
                <th key={index} scope="col">
                  {columnName(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr aria-hidden="true" style={{ height: topSpacerHeight }}>
                <td colSpan={maxColumns + 1} style={{ padding: 0, border: 0 }} />
              </tr>
            )}

            {visibleRows.map((row, localIdx) => {
              const rowIndex = startIndex + localIdx;
              const rowNumber = rowIndex + 1;
              const isFocusedRow = Boolean(
                focusedTarget?.row === rowNumber &&
                  (!focusedTarget.sheet ||
                    focusedTarget.sheet.toLowerCase() === currentSheet.name.toLowerCase())
              );
              const rowNode =
                nodeLookup.get(`${currentSheet.name}::${rowNumber}`) ??
                nodeLookup.get(`*::${rowNumber}`);

              return (
                <tr
                  key={rowNumber}
                  ref={isFocusedRow ? focusedRowRef : undefined}
                  aria-rowindex={rowNumber}
                  className={isFocusedRow ? "spreadsheet-row-focused" : ""}
                  onClick={() => {
                    if (rowNode) setSelectedNode(rowNode.id);
                  }}
                >
                  <th scope="row">{rowNumber}</th>
                  {Array.from({ length: maxColumns }, (_, columnIndex) => {
                    const colLetter = columnName(columnIndex);
                    const isCellFocused =
                      isFocusedRow &&
                      (focusedColumns.size === 0 || focusedColumns.has(colLetter));
                    const isRovingActive = rovingCell.row === rowIndex && rovingCell.col === columnIndex;

                    return (
                      <td
                        key={columnIndex}
                        role="gridcell"
                        data-row={rowIndex}
                        data-col={columnIndex}
                        tabIndex={isRovingActive ? 0 : -1}
                        onFocus={() => setRovingCell({ row: rowIndex, col: columnIndex })}
                        onKeyDown={(e) => handleGridKeyDown(e, rowIndex, columnIndex)}
                        className={isCellFocused ? "spreadsheet-cell-focused highlight-box" : ""}
                      >
                        {row[columnIndex] ?? ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {bottomSpacerHeight > 0 && (
              <tr aria-hidden="true" style={{ height: bottomSpacerHeight }}>
                <td colSpan={maxColumns + 1} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildFallbackSheetsFromNodes(nodes: ASTNode[]): SheetData[] {
  const bySheet = new Map<string, string[][]>();
  for (const node of nodes) {
    const sheetName =
      node.locator?.source_type === "xlsx"
        ? node.locator.sheet
        : typeof node.structured_payload?.sheet_name === "string"
          ? node.structured_payload.sheet_name
          : "Sheet1";
    const rowIdx =
      node.locator?.source_type === "xlsx"
        ? node.locator.row
        : typeof node.structured_payload?.row_index === "number"
          ? node.structured_payload.row_index
          : typeof node.structured_payload?.row === "number"
            ? node.structured_payload.row
            : node.node_order + 1;
    const rows = bySheet.get(sheetName) ?? [];
    while (rows.length < rowIdx) rows.push([]);
    const p = node.structured_payload;
    if (p && typeof p.question === "string") {
      rows[rowIdx - 1] = [String(p.question), String(p.answer ?? node.verbatim_text), String(p.evidence ?? "")];
    } else {
      rows[rowIdx - 1] = [node.section_path || `Row ${rowIdx}`, node.verbatim_text];
    }
    bySheet.set(sheetName, rows);
  }
  return Array.from(bySheet.entries()).map(([name, rows]) => ({ name, rows }));
}

function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}
