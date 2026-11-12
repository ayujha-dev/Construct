import type {
  ASTNode,
  BboxTuple,
  BoundingBox,
  Document,
  EvidenceLocator,
} from "../types/bert";

export type SourceTypeChip = "PDF" | "SCAN" | "XLSX" | "JSON" | "TXT";

export interface ViewportLike {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
  convertToViewportRectangle?(rect: [number, number, number, number]): number[];
}

export interface ProjectedViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const warnedMissingLocators = new Set<string>();

export function warnMissingLocator(context: string, detail?: unknown): void {
  const key = `${context}:${typeof detail === "string" ? detail : JSON.stringify(detail ?? "")}`;
  if (warnedMissingLocators.has(key)) return;
  warnedMissingLocators.add(key);
  console.warn(`[BERT Evidence] No source locator stored (${context})`, detail ?? "");
}

export function normalizeBbox(
  bbox: BoundingBox | BboxTuple | null | undefined
): BoundingBox | null {
  if (!bbox) return null;
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if (Array.isArray(bbox)) {
    if (bbox.length < 4) return null;
    [x0, y0, x1, y1] = bbox.map(Number) as BboxTuple;
  } else {
    x0 = Number(bbox.x0);
    y0 = Number(bbox.y0);
    x1 = Number(bbox.x1);
    y1 = Number(bbox.y1);
  }
  if (![x0, y0, x1, y1].every((v) => Number.isFinite(v))) {
    return null;
  }
  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

export function bboxToTuple(
  bbox: BoundingBox | BboxTuple | null | undefined
): BboxTuple | null {
  const norm = normalizeBbox(bbox);
  if (!norm) return null;
  return [norm.x0, norm.y0, norm.x1, norm.y1];
}

/**
 * Matches PDF.js PageViewport affine transform math (`pdfjs-dist` `PageViewport`)
 * for headless/unit testing and fallback spatial previews across rotation,
 * CropBox, and non-Letter dimensions.
 */
export function createFallbackPdfViewport(
  pageWidth: number,
  pageHeight: number,
  rotation = 0,
  scale = 1,
  cropBox?: BboxTuple | BoundingBox | null
): ViewportLike {
  const normCrop = normalizeBbox(cropBox);
  const viewBox: [number, number, number, number] = normCrop
    ? [normCrop.x0, normCrop.y0, normCrop.x1, normCrop.y1]
    : [0, 0, pageWidth, pageHeight];

  let rot = rotation % 360;
  if (rot < 0) rot += 360;

  let rotateA = 1;
  let rotateB = 0;
  let rotateC = 0;
  let rotateD = -1;
  if (rot === 90) {
    rotateA = 0;
    rotateB = 1;
    rotateC = 1;
    rotateD = 0;
  } else if (rot === 180) {
    rotateA = -1;
    rotateB = 0;
    rotateC = 0;
    rotateD = 1;
  } else if (rot === 270) {
    rotateA = 0;
    rotateB = -1;
    rotateC = -1;
    rotateD = 0;
  }

  const centerX = (viewBox[2] + viewBox[0]) / 2;
  const centerY = (viewBox[3] + viewBox[1]) / 2;
  const width =
    rotateA === 0 ? (viewBox[3] - viewBox[1]) * scale : (viewBox[2] - viewBox[0]) * scale;
  const height =
    rotateA === 0 ? (viewBox[2] - viewBox[0]) * scale : (viewBox[3] - viewBox[1]) * scale;

  const offsetCanvasX =
    rotateA === 0
      ? Math.abs(centerY - viewBox[1]) * scale
      : Math.abs(centerX - viewBox[0]) * scale;
  const offsetCanvasY =
    rotateA === 0
      ? Math.abs(centerX - viewBox[0]) * scale
      : Math.abs(centerY - viewBox[1]) * scale;

  const t = [
    rotateA * scale,
    rotateB * scale,
    rotateC * scale,
    rotateD * scale,
    offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
    offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY,
  ];

  return {
    width,
    height,
    convertToViewportPoint(x: number, y: number): [number, number] {
      return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
    },
  };
}

/**
 * Converts a PDF bottom-up user-space bounding box `[x0, y0, x1, y1]` into top-down
 * DOM viewport CSS pixels using the PDF.js viewport transform (supports 0/90/180/270
 * rotation, CropBox offset, non-Letter sizes such as 960x540, and zoom scales).
 */
export function convertPdfBboxToViewportRect(
  viewport: ViewportLike,
  bbox: BoundingBox | BboxTuple,
  options: { minSize?: number } = {}
): ProjectedViewportRect {
  const minSize = options.minSize ?? 4;
  const norm = normalizeBbox(bbox);
  if (!norm) {
    return { left: 0, top: 0, width: minSize, height: minSize, right: minSize, bottom: minSize };
  }

  let coords: number[];
  if (typeof viewport.convertToViewportRectangle === "function") {
    coords = viewport.convertToViewportRectangle([norm.x0, norm.y0, norm.x1, norm.y1]);
  } else {
    const p1 = viewport.convertToViewportPoint(norm.x0, norm.y0);
    const p2 = viewport.convertToViewportPoint(norm.x1, norm.y1);
    coords = [p1[0], p1[1], p2[0], p2[1]];
  }

  const maxW = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : Number.POSITIVE_INFINITY;
  const maxH = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : Number.POSITIVE_INFINITY;

  const rawLeft = Math.max(0, Math.min(maxW, Math.min(coords[0], coords[2])));
  const rawRight = Math.max(0, Math.min(maxW, Math.max(coords[0], coords[2])));
  const rawTop = Math.max(0, Math.min(maxH, Math.min(coords[1], coords[3])));
  const rawBottom = Math.max(0, Math.min(maxH, Math.max(coords[1], coords[3])));

  const width = Math.max(minSize, rawRight - rawLeft);
  const height = Math.max(minSize, rawBottom - rawTop);

  return {
    left: rawLeft,
    top: rawTop,
    width,
    height,
    right: rawLeft + width,
    bottom: rawTop + height,
  };
}

/**
 * Parses JSONPath-like strings (`$.a.b[0]`, `root.rules["wildcard-admin"].action`,
 * `rules.wildcard-admin`) into canonical segment tokens: `["a", "b", "0"]`.
 * Returns `[]` for bare `"root"` or `"$"`.
 */
export function parseJsonPathTokens(path: string | null | undefined): string[] {
  if (!path) return [];
  let trimmed = path.trim();
  if (!trimmed || trimmed === "$" || trimmed === "root") return [];

  if (trimmed.startsWith("$.")) {
    trimmed = trimmed.slice(2);
  } else if (trimmed.startsWith("$[")) {
    trimmed = trimmed.slice(1);
  } else if (trimmed.startsWith("root.")) {
    trimmed = trimmed.slice(5);
  } else if (trimmed.startsWith("root[")) {
    trimmed = trimmed.slice(4);
  }

  const tokens: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === ".") {
      i += 1;
      continue;
    }
    if (ch === "[") {
      const close = trimmed.indexOf("]", i + 1);
      if (close === -1) {
        const rem = trimmed.slice(i + 1).trim();
        if (rem) tokens.push(rem);
        break;
      }
      let inner = trimmed.slice(i + 1, close).trim();
      if (
        (inner.startsWith('"') && inner.endsWith('"')) ||
        (inner.startsWith("'") && inner.endsWith("'"))
      ) {
        inner = inner.slice(1, -1);
      }
      tokens.push(inner);
      i = close + 1;
      continue;
    }
    let nextBreak = trimmed.length;
    const nextDot = trimmed.indexOf(".", i);
    const nextBracket = trimmed.indexOf("[", i);
    if (nextDot !== -1 && nextDot < nextBreak) nextBreak = nextDot;
    if (nextBracket !== -1 && nextBracket < nextBreak) nextBreak = nextBracket;
    const segment = trimmed.slice(i, nextBreak);
    if (segment) tokens.push(segment);
    i = nextBreak;
  }
  return tokens;
}

export function formatCanonicalJsonPath(tokens: string[]): string {
  if (!tokens.length) return "$";
  return (
    "$" +
    tokens
      .map((seg) =>
        /^\d+$/.test(seg)
          ? `[${seg}]`
          : /^[A-Za-z_$-][\w$-]*$/.test(seg)
            ? `.${seg}`
            : `[${JSON.stringify(seg)}]`
      )
      .join("")
  );
}

/**
 * Exact canonical JSONPath token equality. Fixes `pathsMatch("root", x)` always returning true.
 */
export function jsonPathsMatch(
  first: string | null | undefined,
  second: string | null | undefined
): boolean {
  const rawA = first?.trim() ?? "";
  const rawB = second?.trim() ?? "";
  if (!rawA || !rawB) return false;
  const tokensA = parseJsonPathTokens(rawA);
  const tokensB = parseJsonPathTokens(rawB);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return (
      tokensA.length === 0 &&
      tokensB.length === 0 &&
      (rawA === "root" || rawA === "$") &&
      (rawB === "root" || rawB === "$")
    );
  }
  if (tokensA.length !== tokensB.length) return false;
  return tokensA.every((tok, idx) => tok === tokensB[idx]);
}

export function isJsonPathAncestor(
  ancestorPath: string | null | undefined,
  targetPath: string | null | undefined
): boolean {
  const ancTokens = parseJsonPathTokens(ancestorPath);
  const tgtTokens = parseJsonPathTokens(targetPath);
  if (!tgtTokens.length) return false;
  if (ancTokens.length === 0) {
    const rawAnc = ancestorPath?.trim();
    return rawAnc === "root" || rawAnc === "$";
  }
  if (ancTokens.length >= tgtTokens.length) return false;
  return ancTokens.every((tok, idx) => tok === tgtTokens[idx]);
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function lcsLength(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);
  for (let i = 1; i <= m; i++) {
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      if (ca === b.charCodeAt(j - 1)) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = curr[j - 1] > prev[j] ? curr[j - 1] : prev[j];
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fill(0);
  }
  return prev[n];
}

function indelSimilarity(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 100;
  const lcs = lcsLength(a, b);
  return Math.round(((2 * lcs) / total) * 1000) / 10;
}

/**
 * Computes whitespace-normalized partial text match (0..100, matching rapidfuzz
 * `partial_ratio` semantics) between a claimed quote and extracted PDF region text.
 */
export function computeRegionTextMatch(quote: string, regionText: string): number {
  const q = normalizeWhitespace(quote).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const r = normalizeWhitespace(regionText).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (!q || !r) return 0;
  if (q.length < 3 && q !== r) return 0;

  let best = 0;
  if (r.includes(q)) {
    best = 100;
  } else if (q.includes(r)) {
    best = indelSimilarity(q, r);
  } else {
    const shorter = q.length <= r.length ? q : r;
    const longer = q.length <= r.length ? r : q;

    // Guard runtime on huge blocks
    if (shorter.length > 400 || longer.length > 4000) {
      const sampleShort = shorter.slice(0, 220);
      const words = sampleShort.split(" ").filter((w) => w.length >= 4);
      if (words.length > 0) {
        const hitRatio =
          words.filter((w) => longer.toLowerCase().includes(w.toLowerCase())).length /
          words.length;
        best = Math.round(hitRatio * 1000) / 10;
      }
    } else {
      const winLen = shorter.length;
      best = indelSimilarity(shorter, longer.slice(0, winLen));
      const step = longer.length - winLen > 120 ? 3 : 1;
      for (let start = 1; start <= longer.length - winLen; start += step) {
        const sub = longer.slice(start, start + winLen);
        const score = indelSimilarity(shorter, sub);
        if (score > best) best = score;
        if (best >= 99.5) break;
      }

      if (best < 97 && longer.toLowerCase().includes(shorter.toLowerCase())) {
        best = 98.5;
      }
    }
  }

  // Bloated-quote length guard matching backend verify_region_text
  if (q.length > r.length * 1.35 + 12) {
    best = Math.min(best, indelSimilarity(q, r));
  }
  return best;
}

export function resolveCitationDocument(
  documents: Document[],
  options: {
    locator?: EvidenceLocator | null;
    documentFilename?: string | null;
    citationDocumentId?: string | null;
    fallbackDocumentId?: string | null;
    fallbackDoc?: Document | null;
  }
): Document | undefined {
  const { locator, documentFilename, citationDocumentId, fallbackDocumentId, fallbackDoc } = options;
  if (locator?.doc_id) {
    const byLocatorId = documents.find((d) => d.id === locator.doc_id);
    if (byLocatorId) return byLocatorId;
  }
  if (citationDocumentId) {
    const byCitationId = documents.find((d) => d.id === citationDocumentId);
    if (byCitationId) return byCitationId;
  }
  if (documentFilename) {
    const byName = documents.find((d) => d.filename === documentFilename);
    if (byName) return byName;
  }
  if (fallbackDocumentId) {
    const byFallbackId = documents.find((d) => d.id === fallbackDocumentId);
    if (byFallbackId) return byFallbackId;
  }
  return fallbackDoc ?? undefined;
}

export function inferSourceChip(
  doc?: Pick<Document, "source_format" | "category" | "sub_category" | "filename"> | null,
  locator?: EvidenceLocator | null
): SourceTypeChip {
  const fname = doc?.filename?.toLowerCase() ?? "";
  const cat = doc?.category?.toLowerCase() ?? "";
  const sub = doc?.sub_category?.toLowerCase() ?? "";
  const fmt = doc?.source_format?.toUpperCase() ?? "";

  if (locator?.source_type === "pdf") {
    if (
      locator.is_scan ||
      fmt === "PHYSICAL_SCAN" ||
      cat.includes("scan") ||
      sub.includes("scan") ||
      fname.includes("scan") ||
      fname.endsWith(".scn")
    ) {
      return "SCAN";
    }
    return "PDF";
  }
  if (locator?.source_type === "xlsx") return "XLSX";
  if (locator?.source_type === "json") return "JSON";
  if (locator?.source_type === "text") return "TXT";

  if (
    fmt === "PHYSICAL_SCAN" ||
    cat.includes("scan") ||
    sub.includes("scan") ||
    fname.includes("scan") ||
    fname.endsWith(".scn")
  ) {
    return "SCAN";
  }
  if (
    fmt === "XLSX" ||
    fname.endsWith(".xlsx") ||
    fname.endsWith(".xls") ||
    fname.endsWith(".csv")
  ) {
    return "XLSX";
  }
  if (
    fmt === "JSON" ||
    fmt === "JSON_CONFIG" ||
    fname.endsWith(".json")
  ) {
    return "JSON";
  }
  if (
    fmt === "TEXT" ||
    fname.endsWith(".txt") ||
    fname.endsWith(".md")
  ) {
    return "TXT";
  }
  return "PDF";
}

export interface FormattedLocatorDisplay {
  chip: SourceTypeChip;
  label: string;
  detail: string;
  valid: boolean;
}

export function parseXlsxColRangeColumns(colRange: string | null | undefined): string[] {
  if (!colRange) return [];
  const parts = colRange.split(":").map((p) => p.trim().toUpperCase());
  const colLetter = (cell: string) => cell.replace(/[^A-Z]/g, "");
  const start = colLetter(parts[0] ?? "");
  const end = colLetter(parts[1] ?? start);
  if (!start) return [];
  if (!end || start === end) return [start];
  const cols: string[] = [];
  const toNum = (s: string) =>
    s.split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
  const toName = (n: number) => {
    let val = n;
    let out = "";
    while (val > 0) {
      const rem = (val - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      val = Math.floor((val - 1) / 26);
    }
    return out;
  };
  const sIdx = toNum(start);
  const eIdx = Math.min(toNum(end), sIdx + 30);
  for (let idx = sIdx; idx <= eIdx; idx++) {
    cols.push(toName(idx));
  }
  return cols;
}

export function isLocatorValid(
  locator: EvidenceLocator | null | undefined,
  fallbackBbox?: BoundingBox | BboxTuple | null
): boolean {
  if (!locator) return false;
  switch (locator.source_type) {
    case "pdf": {
      const box = normalizeBbox(locator.bbox ?? fallbackBbox);
      return Boolean(locator.page >= 1 && box);
    }
    case "xlsx":
      return Boolean(locator.sheet && Number.isFinite(locator.row) && locator.row >= 1);
    case "json":
      return Boolean(locator.json_path && locator.json_path.trim().length > 0);
    case "text":
      return Boolean(
        (locator.line_start && locator.line_start >= 1) ||
          (locator.page && locator.page >= 1)
      );
    default:
      return false;
  }
}

export function formatLocatorDisplay(
  locator: EvidenceLocator | null | undefined,
  doc?: Pick<Document, "source_format" | "category" | "sub_category" | "filename"> | null,
  fallbackPage?: number | null,
  fallbackBbox?: BoundingBox | BboxTuple | null
): FormattedLocatorDisplay {
  const chip = inferSourceChip(doc, locator);
  if (!locator || !isLocatorValid(locator, fallbackBbox)) {
    return {
      chip,
      label: "No source locator stored",
      detail: fallbackPage ? `p.${fallbackPage} · missing structural locator` : "Missing source locator",
      valid: false,
    };
  }

  switch (locator.source_type) {
    case "pdf": {
      const box = normalizeBbox(locator.bbox ?? fallbackBbox)!;
      return {
        chip,
        label: `p.${locator.page} · bbox`,
        detail: `Page ${locator.page} [${Math.round(box.x0)}, ${Math.round(box.y0)}, ${Math.round(box.x1)}, ${Math.round(box.y1)}]`,
        valid: true,
      };
    }
    case "xlsx": {
      const firstCell = locator.col_range
        ? locator.col_range.split(":")[0]
        : `A${locator.row}`;
      const cellRef = /\d/.test(firstCell) ? firstCell : `${firstCell}${locator.row}`;
      return {
        chip: "XLSX",
        label: `${locator.sheet}!${cellRef}`,
        detail: `Sheet "${locator.sheet}", Row ${locator.row}${locator.col_range ? ` (${locator.col_range})` : ""}`,
        valid: true,
      };
    }
    case "json": {
      const tokens = parseJsonPathTokens(locator.json_path);
      const formatted = formatCanonicalJsonPath(tokens);
      return {
        chip: "JSON",
        label: formatted,
        detail: formatted,
        valid: true,
      };
    }
    case "text": {
      const start = locator.line_start ?? 1;
      const end = locator.line_end ?? start;
      const range = end > start ? `L${start}-L${end}` : `L${start}`;
      return {
        chip: "TXT",
        label: `p.${locator.page ?? 1} · ${range}`,
        detail: `Page ${locator.page ?? 1}, Lines ${start}-${end}`,
        valid: true,
      };
    }
  }
}

export function deriveNodeLocator(
  node: ASTNode | undefined,
  doc?: Document | null
): EvidenceLocator | null {
  if (!node) return null;
  if (node.locator && isLocatorValid(node.locator, node.bounding_box)) {
    return node.locator;
  }
  const chip = inferSourceChip(doc, null);
  if ((chip === "PDF" || chip === "SCAN") && node.bounding_box && node.page_number) {
    return {
      source_type: "pdf",
      doc_id: node.document_id,
      page: node.page_number,
      bbox: bboxToTuple(node.bounding_box),
      coord_system: "pdf_user_space_bl_pt",
      page_width: 612,
      page_height: 792,
      crop_box: [0, 0, 612, 792],
      rotation: 0,
      node_id: node.id,
      checksum: doc?.ast_checksum ?? null,
      is_scan: chip === "SCAN",
    };
  }
  if (chip === "XLSX" && node.structured_payload) {
    const p = node.structured_payload;
    const row =
      typeof p.row_index === "number"
        ? p.row_index
        : typeof p.row === "number"
          ? p.row
          : node.node_order + 1;
    const sheet =
      typeof p.sheet_name === "string" && p.sheet_name
        ? p.sheet_name
        : "Sheet1";
    return {
      source_type: "xlsx",
      doc_id: node.document_id,
      sheet,
      row,
      col_range: `A${row}`,
      node_id: node.id,
      checksum: doc?.ast_checksum ?? null,
    };
  }
  if (chip === "JSON" && node.section_path) {
    const tokens = parseJsonPathTokens(node.section_path);
    if (tokens.length > 0) {
      return {
        source_type: "json",
        doc_id: node.document_id,
        json_path: formatCanonicalJsonPath(tokens),
        node_id: node.id,
        checksum: doc?.ast_checksum ?? null,
      };
    }
  }
  if (chip === "TXT") {
    return {
      source_type: "text",
      doc_id: node.document_id,
      page: node.page_number ?? 1,
      line_start: node.node_order + 1,
      line_end: node.node_order + 1,
      node_id: node.id,
      checksum: doc?.ast_checksum ?? null,
    };
  }
  return null;
}
