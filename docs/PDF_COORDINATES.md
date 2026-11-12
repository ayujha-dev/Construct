# PDF Coordinate System & Evidence Locator Specification

This document defines the canonical coordinate geometry, transformation math, and multi-format `EvidenceLocator` contracts used across BERT's ingestion parser (`apps/api/bert/ingestion/docling_parser.py`), verification gate, API payloads, and frontend visual viewers.

---

## 1. Canonical PDF Coordinate System (`pdf_user_space_bl_pt`)

All PDF bounding boxes persisted by BERT (`ASTNode.bounding_box`, `PDFLocator.bbox`) use **unrotated PDF user space** (`coord_system = "pdf_user_space_bl_pt"`):

| Property | Specification |
| :--- | :--- |
| **Identifier** | `"pdf_user_space_bl_pt"` |
| **Origin `(0, 0)`** | Bottom-left corner of the unrotated PDF user-space coordinate system (ISO 32000-1) |
| **Axis Direction** | `+x` points **right**; `+y` points **up** |
| **Units** | PDF user space points (`1 pt = 1/72 inch`) |
| **BBox Format** | `[x0, y0, x1, y1]` where `x0 < x1` (left to right) and `y0 < y1` (bottom to top), clamped to `MediaBox` |
| **Page Dimensions** | `page_width = abs(mx1 - mx0)`, `page_height = abs(my1 - my0)` from unrotated `/MediaBox` |
| **Crop Box** | `crop_box = [cx0, cy0, cx1, cy1]` from `/CropBox` (defaults to `/MediaBox` when omitted) |
| **Rotation** | `rotation = int(page.rotation or 0) % 360` (`0`, `90`, `180`, `270` clockwise degrees) |

### Why Unrotated User Space?

Both `pypdf` content-stream extraction (`cm @ tm`) and `pdfjs-dist` (`textContent.items[].transform`) emit coordinates in **unrotated PDF user space**. Keeping backend `bbox` values in `pdf_user_space_bl_pt` alongside explicit `page_width`, `page_height`, `crop_box`, and `rotation` makes backend locators invariant across viewer zoom levels and allows the browser viewer to project exact rectangles onto rotated and cropped canvases without lossy coordinate baking.

---

## 2. Backend Extraction (`pypdf` `visitor_text` & `M = cm @ tm`)

In `DoclingParser`, each `%PDF-` page is extracted via `page.extract_text(visitor_text=...)`, which yields `(text, cm, tm, font_dict, font_size)` per PDF text operator:

- `cm = [a, b, c, d, e, f]` — Current Transformation Matrix (CTM)
- `tm = [a, b, c, d, e, f]` — Text Matrix (`T_m`)

Representing both as column-vector 3×3 affine matrices:

```text
C = [[cm0, cm2, cm4],      T = [[tm0, tm2, tm4],
     [cm1, cm3, cm5],           [tm1, tm3, tm5],
     [  0,   0,   1]]           [  0,   0,   1]]

M = C @ T
```

From `M`:

- **Baseline origin `(x, y)`**:
  - `x = cm0 * tm4 + cm2 * tm5 + cm4`
  - `y = cm1 * tm4 + cm3 * tm5 + cm5`
- **Transformed basis vectors** (scaled by `font_size`, defaulting to `12.0` if `0`):
  - Horizontal advance axis: `(hx, hy) = ((cm0 * tm0 + cm2 * tm1) * fs, (cm1 * tm0 + cm3 * tm1) * fs)`
  - Vertical ascender axis: `(vx, vy) = ((cm0 * tm2 + cm2 * tm3) * fs, (cm1 * tm2 + cm3 * tm3) * fs)`
- **Span width**:
  - Computed from `font_dict["/Widths"]` + `"/FirstChar"` in `1/1000 em` units multiplied by `hypot(hx, hy)` when available; otherwise estimated as `0.52 * len(text) * hypot(hx, hy)`.
- **Span bounding box**:
  - 4 corners span `[0 .. span_width]` along the unit horizontal axis and `[-0.22 * v_len .. +0.85 * v_len]` along the unit ascender axis, taking the axis-aligned min/max `[sx0, sy0, sx1, sy1]`.
- **Line grouping**:
  - Consecutive spans sharing a baseline (`|y_i - y_prev| <= max(3.0, 0.4 * max_h)`) without an explicit newline or column jump (`gap <= max(36.0, 2.5 * max_h)`) are merged into a single `ASTNode` with the union `[min(x0), min(y0), max(x1), max(y1)]`, clamped to `/MediaBox`.

---

## 3. Frontend Projection to Viewport Pixels (`pdf.js`)

In the browser (`PdfViewer.tsx`), `page.getViewport({ scale: zoomLevel })` constructs the exact affine matrix `viewport.transform` from `pdf_user_space_bl_pt` -> CSS pixels, automatically accounting for:

1. `/CropBox` origin offset (`[cx0, cy0]`)
2. `/Rotate` (`0°`, `90°`, `180°`, `270°`)
3. Y-axis flip (bottom-up PDF -> top-down DOM)
4. `zoomLevel` scale factor

To project `bbox = [x0, y0, x1, y1]` into CSS viewport coordinates `[left, top, width, height]`:

```ts
const [vx0, vy0] = viewport.convertToViewportPoint(x0, y0);
const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
const left = Math.min(vx0, vx1);
const top = Math.min(vy0, vy1);
const width = Math.max(4, Math.abs(vx1 - vx0));
const height = Math.max(4, Math.abs(vy1 - vy0));
```

*(Note: `pdfjs-dist@6.5` exposes `viewport.convertToViewportPoint(x, y)` on `PageViewport`; transforming `(x0, y0)` and `(x1, y1)` and taking min/max works identically for all rotations `0/90/180/270` and arbitrary crop boxes.)*

### Worked Examples

1. **Standard US Letter (`612 × 792`, `rotation=0`, `crop_box=[0, 0, 612, 792]`)**:
   - `bbox = [72, 740, 480, 757.6]` at `zoom=1.0`:
   - `convertToViewportPoint(72, 740) -> [72, 52]`, `convertToViewportPoint(480, 757.6) -> [480, 34.4]`
   - DOM box: `left=72, top=34.4, width=408, height=17.6`.
2. **Non-Letter Slide Deck (`960 × 540`, `rotation=0`, `crop_box=[0, 0, 960, 540]`)**:
   - `bbox = [51, 288, 455.1, 303]` at `zoom=1.0`:
   - DOM box: `left=51, top=540-303=237, width=404.1, height=15`.
3. **Rotated + Cropped (`MediaBox=[0, 0, 612, 792]`, `CropBox=[50, 100, 550, 780]`, `rotation=90`)**:
   - `viewport.width = 680`, `viewport.height = 500`.
   - `bbox = [72, 740, 220, 758]` -> `convertToViewportPoint` yields `[640, 22]` and `[658, 170]` -> DOM `left=640, top=22, width=18, height=148`.
4. **Rotated `180°` (`MediaBox=[0, 0, 612, 792]`, `rotation=180`)**:
   - `bbox = [72, 740, 300, 758]` -> `convertToViewportPoint` yields `[540, 740]` and `[312, 758]` -> DOM `left=312, top=740, width=228, height=18`.

---

## 4. Scanned PDFs (`SourceFormat.PHYSICAL_SCAN`)

- If a `%PDF-` file contains one or more pages with **zero extracted text spans** (image-only scan), or fails PDF text parsing, it is classified as `SourceFormat.PHYSICAL_SCAN`.
- **Binary `%PDF-` files are never decoded as UTF-8 text** (`raw.decode("utf-8")` is strictly forbidden for `%PDF-`).
- For each scanned page, `DoclingParser` emits a `NodeType.STAMP_NOTE` node with:
  - `ocr_confidence = 0.55` (`< 0.90`, routed through `Scout` and blocked by the strict verification gate for human review)
  - `bbox` covering the central visible crop region (`[cx0 + 0.08*cw, cy0 + 0.08*ch, cx1 - 0.08*cw, cy1 - 0.08*ch]`)
  - Rescue placeholder text `[SCANNED_PAGE_<N>] Image-only scanned PDF region requires OCR / vision rescue verification.`

---

## 5. Unified `EvidenceLocator` Discriminated Union

| `source_type` | Required Fields |
| :--- | :--- |
| `"pdf"` | `doc_id`, `page`, `bbox: [x0,y0,x1,y1]`, `coord_system: "pdf_user_space_bl_pt"`, `page_width`, `page_height`, `crop_box`, `rotation`, `node_id`, `checksum` |
| `"xlsx"` | `doc_id`, `sheet`, `row`, `col_range`, `node_id`, `checksum` |
| `"json"` | `doc_id`, `json_path` (canonical `$.path`, e.g. `$.rules.wildcard-admin.action`), `node_id`, `checksum` |
| `"text"` | `doc_id`, `page`, `line_start`, `line_end`, `node_id`, `checksum` |

On ingestion completion (`persist_ingestion_stream`), `locator.checksum` is backfilled with the document's SHA-256 `ast_checksum`.
