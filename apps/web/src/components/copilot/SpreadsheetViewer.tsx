import { ChevronDown, FileSpreadsheet, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { bertApi } from "../../lib/api";
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

export function SpreadsheetViewer({ document: sourceDocument, nodes }: SpreadsheetViewerProps) {
  const { documentFiles, selectedNodeId, setSelectedNode } = useBertStore();
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSheets([]);
    setActiveSheet("");
    setError(null);
    const loadWorkbook = async () => {
      try {
        const localFile = documentFiles[sourceDocument.id];
        const bytes = localFile ? await localFile.arrayBuffer() : await bertApi.getFile(sourceDocument.id);
        const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
        const nextSheets = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
            .map((row) => row.map((value) => String(value ?? "")));
          return { name, rows };
        });
        if (!cancelled) {
          setSheets(nextSheets);
          setActiveSheet(nextSheets[0]?.name ?? "");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to read this workbook.");
      }
    };
    void loadWorkbook();
    return () => { cancelled = true; };
  }, [documentFiles, sourceDocument.id]);

  const currentSheet = sheets.find((sheet) => sheet.name === activeSheet) ?? sheets[0];
  const focusedNode = nodes.find((node) => node.id === selectedNodeId);
  const focusedPayload = focusedNode?.structured_payload;
  const focusedSheet = typeof focusedPayload?.sheet_name === "string" ? focusedPayload.sheet_name : undefined;
  const focusedRow = typeof focusedPayload?.row_index === "number" ? focusedPayload.row_index : undefined;
  const maxColumns = useMemo(() => Math.max(1, ...(currentSheet?.rows.map((row) => row.length) ?? [1])), [currentSheet]);

  if (error) return <div className="document-viewer-error"><FileSpreadsheet size={16} /><strong>Spreadsheet preview unavailable</strong><p>{error}</p></div>;
  if (!currentSheet) return <div className="document-viewer-loading"><RefreshCw size={16} className="spin" /> Loading workbook…</div>;

  return <section className="spreadsheet-viewer" aria-label={`${sourceDocument.filename} spreadsheet preview`}>
    <div className="sheet-toolbar">
      <div className="sheet-tabs" role="tablist" aria-label="Workbook sheets">
        {sheets.map((sheet) => <button key={sheet.name} role="tab" aria-selected={activeSheet === sheet.name} className={`sheet-tab ${activeSheet === sheet.name ? "active" : ""}`} onClick={() => setActiveSheet(sheet.name)}>{sheet.name}</button>)}
      </div>
      <span className="sheet-meta">{currentSheet.rows.length.toLocaleString()} rows · {maxColumns} columns</span>
    </div>
    <div className="spreadsheet-scroll">
      <table className="spreadsheet-grid">
        <thead><tr><th className="spreadsheet-corner" aria-hidden="true" />{Array.from({ length: maxColumns }, (_, index) => <th key={index}>{columnName(index)}</th>)}</tr></thead>
        <tbody>{currentSheet.rows.map((row, rowIndex) => {
          const rowNumber = rowIndex + 1;
          const isFocused = Boolean(focusedRow === rowNumber && (!focusedSheet || focusedSheet === currentSheet.name));
          const rowNode = nodes.find((node) => {
            const payload = node.structured_payload;
            return payload?.row_index === rowNumber && (!payload.sheet_name || payload.sheet_name === currentSheet.name);
          });
          return <tr key={rowNumber} className={isFocused ? "spreadsheet-row-focused" : ""} onClick={() => { if (rowNode) setSelectedNode(rowNode.id); }}><th scope="row">{rowNumber}</th>{Array.from({ length: maxColumns }, (_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ""}</td>)}</tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
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
