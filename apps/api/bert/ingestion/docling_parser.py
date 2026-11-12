"""PDF-to-AST parsing with pypdf coordinate extraction and safe non-PDF text fallback.

PDF Coordinate System (`pdf_user_space_bl_pt`):
- Origin `(0, 0)` is the bottom-left corner of the unrotated PDF user space (`/MediaBox`),
  with `+x` pointing right and `+y` pointing up in points (`1 pt = 1/72 inch`).
- Text span coordinates are extracted via `pypdf`'s `extract_text(visitor_text=...)` by
  composing the Current Transformation Matrix (`cm`) and Text Matrix (`tm`) as `M = cm @ tm`.
- Each PDF node records `page_width`, `page_height` (from `/MediaBox`), `crop_box`
  (`[cx0, cy0, cx1, cy1]` from `/CropBox`), and `rotation` (`/Rotate % 360`) alongside
  `bbox: [x0, y0, x1, y1]` in `pdf_user_space_bl_pt`. See `docs/PDF_COORDINATES.md` for
  browser projection formulas via `pdfjs-dist` (`viewport.convertToViewportPoint`).
- Binary `%PDF-` files with empty extracted text on any page are classified as
  `SourceFormat.PHYSICAL_SCAN` (`ocr_confidence < 0.90`) and emit a `STAMP_NOTE` node with
  a visible-region bounding box and rescue placeholder text; raw binary PDF bytes are
  never decoded as UTF-8.
"""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from bert.models.documents import NodeType, SourceFormat


@dataclass(slots=True)
class ParsedNode:
    """Parser output before a node is persisted."""

    node_type: NodeType
    verbatim_text: str
    section_path: str | None = None
    page_number: int | None = None
    bounding_box: dict[str, float] | None = None
    ocr_confidence: float = 1.0
    structured_payload: dict[str, Any] | None = None
    locator: dict[str, Any] | None = None
    parent_index: int | None = None
    node_order: int = 0


@dataclass(slots=True)
class IngestionResult:
    """Uniform result shared by all ingestion handlers."""

    document_id: UUID
    nodes: list[ParsedNode]
    checksum: str
    total_pages: int
    low_confidence_crops: list[dict[str, Any]]
    source_format: SourceFormat = SourceFormat.DIGITAL_PDF


def checksum_for_nodes(nodes: list[ParsedNode]) -> str:
    """Hash ordered source text without normalizing or dropping characters."""
    digest = hashlib.sha256()
    for node in sorted(nodes, key=lambda item: item.node_order):
        digest.update(node.verbatim_text.encode("utf-8"))
    return digest.hexdigest()


def _normalize_box(raw_box: Any, fallback: tuple[float, float, float, float] = (0.0, 0.0, 612.0, 792.0)) -> tuple[float, float, float, float]:
    try:
        vals = [float(v) for v in raw_box]
        if len(vals) == 4:
            x0, y0, x1, y1 = min(vals[0], vals[2]), min(vals[1], vals[3]), max(vals[0], vals[2]), max(vals[1], vals[3])
            if x1 > x0 and y1 > y0:
                return (x0, y0, x1, y1)
    except Exception:
        pass
    return fallback


def extract_pdf_page_spans(page: Any) -> list[dict[str, Any]]:
    """Extract text spans and unrotated user-space bounding boxes via `M = cm @ tm`."""
    spans: list[dict[str, Any]] = []

    def visitor(text: str, cm: list[float], tm: list[float], font_dict: Any, font_size: float) -> None:
        if not text:
            return
        clean = text.replace("\r", "")
        has_nl = "\n" in clean
        stripped = clean.strip("\n")
        if not stripped.strip():
            if has_nl and spans:
                spans[-1]["break_after"] = True
            return

        cm0, cm1, cm2, cm3, cm4, cm5 = (float(cm[i]) for i in range(6))
        tm0, tm1, tm2, tm3, tm4, tm5 = (float(tm[i]) for i in range(6))

        # M = cm @ tm in column-vector affine matrix form:
        x = cm0 * tm4 + cm2 * tm5 + cm4
        y = cm1 * tm4 + cm3 * tm5 + cm5

        fs = abs(float(font_size or 12.0)) or 12.0
        hx = (cm0 * tm0 + cm2 * tm1) * fs
        hy = (cm1 * tm0 + cm3 * tm1) * fs
        vx = (cm0 * tm2 + cm2 * tm3) * fs
        vy = (cm1 * tm2 + cm3 * tm3) * fs

        h_len = math.hypot(hx, hy) or 12.0
        v_len = math.hypot(vx, vy) or 12.0
        ux, uy = (hx / h_len, hy / h_len) if math.hypot(hx, hy) > 1e-6 else (1.0, 0.0)
        ax, ay = (vx / v_len, vy / v_len) if math.hypot(vx, vy) > 1e-6 else (0.0, 1.0)

        span_w: float | None = None
        try:
            if font_dict and "/Widths" in font_dict and "/FirstChar" in font_dict:
                first_char = int(font_dict["/FirstChar"])
                widths = font_dict["/Widths"]
                total_w = 0.0
                matched = 0
                for ch in stripped:
                    idx = ord(ch) - first_char
                    if 0 <= idx < len(widths):
                        total_w += float(widths[idx])
                        matched += 1
                    else:
                        total_w += 520.0
                if matched > 0:
                    span_w = max(2.0, (total_w / 1000.0) * h_len)
        except Exception:
            span_w = None

        if span_w is None:
            span_w = max(4.0, len(stripped) * 0.52 * h_len)

        pts = [
            (x - 0.22 * v_len * ax, y - 0.22 * v_len * ay),
            (x + span_w * ux - 0.22 * v_len * ax, y + span_w * uy - 0.22 * v_len * ay),
            (x + 0.85 * v_len * ax, y + 0.85 * v_len * ay),
            (x + span_w * ux + 0.85 * v_len * ax, y + span_w * uy + 0.85 * v_len * ay),
        ]
        spans.append(
            {
                "text": stripped,
                "x": x,
                "y": y,
                "h": v_len,
                "x0": min(p[0] for p in pts),
                "y0": min(p[1] for p in pts),
                "x1": max(p[0] for p in pts),
                "y1": max(p[1] for p in pts),
                "break_after": has_nl,
            }
        )

    page.extract_text(visitor_text=visitor)
    return spans


def _group_spans_to_lines(spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for span in spans:
        if not lines:
            lines.append(dict(span))
            continue
        prev = lines[-1]
        max_h = max(prev["h"], span["h"], 10.0)
        same_baseline = abs(span["y"] - prev["y"]) <= max(3.0, 0.4 * max_h)
        gap = span["x0"] - prev["x1"]
        same_segment = -4.0 <= gap <= max(36.0, 2.5 * max_h)
        if not prev["break_after"] and same_baseline and same_segment:
            needs_space = (
                gap > 0.18 * max_h
                and not prev["text"].endswith((" ", "\t"))
                and not span["text"].startswith((" ", "\t"))
            )
            prev["text"] = f"{prev['text']}{' ' if needs_space else ''}{span['text']}"
            prev["x0"] = min(prev["x0"], span["x0"])
            prev["y0"] = min(prev["y0"], span["y0"])
            prev["x1"] = max(prev["x1"], span["x1"])
            prev["y1"] = max(prev["y1"], span["y1"])
            prev["h"] = max(prev["h"], span["h"])
            prev["break_after"] = span["break_after"]
        else:
            lines.append(dict(span))
    return lines


def extract_pdf_region_text(
    file_path: Path,
    page_number: int,
    bbox: list[float] | tuple[float, float, float, float] | dict[str, float],
    *,
    cached_pages: dict[int, list[dict[str, Any]]] | None = None,
) -> str:
    """Extract concatenated PDF text falling inside `[x0, y0, x1, y1]` on `page_number`."""
    if isinstance(bbox, dict):
        bx0 = float(bbox.get("x0", 0.0))
        by0 = float(bbox.get("y0", 0.0))
        bx1 = float(bbox.get("x1", 0.0))
        by1 = float(bbox.get("y1", 0.0))
    elif len(bbox) == 4:
        bx0, by0, bx1, by1 = (float(v) for v in bbox)
    else:
        return ""

    if bx1 < bx0:
        bx0, bx1 = bx1, bx0
    if by1 < by0:
        by0, by1 = by1, by0

    spans: list[dict[str, Any]]
    if cached_pages is not None and page_number in cached_pages:
        spans = cached_pages[page_number]
    else:
        raw = file_path.read_bytes() if file_path.is_file() else b""
        if not raw.startswith(b"%PDF-"):
            return ""
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(file_path))
            if page_number < 1 or page_number > len(reader.pages):
                return ""
            spans = extract_pdf_page_spans(reader.pages[page_number - 1])
            if cached_pages is not None:
                cached_pages[page_number] = spans
        except Exception:
            return ""

    matched: list[dict[str, Any]] = []
    for span in spans:
        cx = 0.5 * (span["x0"] + span["x1"])
        cy = 0.5 * (span["y0"] + span["y1"])
        if (bx0 - 2.0) <= cx <= (bx1 + 2.0) and (by0 - 2.0) <= cy <= (by1 + 2.0):
            matched.append(span)
    if not matched:
        return ""

    lines = _group_spans_to_lines(matched)
    return " ".join(line["text"].strip() for line in lines if line["text"].strip())


class DoclingParser:
    """Parse digital PDFs, scanned PDFs, and text fixtures into layout-aware AST nodes.

    Coordinates for `%PDF-` files are extracted in `pdf_user_space_bl_pt` (unrotated
    bottom-left point space) via `pypdf` `visitor_text` (`M = cm @ tm`) along with
    `page_width`, `page_height`, `crop_box`, and `rotation`. See `docs/PDF_COORDINATES.md`.
    """

    def __init__(self, *, ocr_confidence_threshold: float = 0.90) -> None:
        self._confidence_threshold = ocr_confidence_threshold

    def detect_source_format(self, file_path: Path) -> SourceFormat:
        """Inspect file bytes/pages to distinguish digital PDF, scanned PDF, and plain text."""
        raw = file_path.read_bytes()
        if raw.startswith(b"%PDF-"):
            try:
                from pypdf import PdfReader

                reader = PdfReader(str(file_path))
                if not reader.pages:
                    return SourceFormat.PHYSICAL_SCAN
                for page in reader.pages:
                    spans = extract_pdf_page_spans(page)
                    if not spans and not (page.extract_text() or "").strip():
                        return SourceFormat.PHYSICAL_SCAN
                return SourceFormat.DIGITAL_PDF
            except Exception:
                return SourceFormat.PHYSICAL_SCAN
        ext = file_path.suffix.lower()
        if ext in {".txt", ".md"}:
            return SourceFormat.TEXT
        return SourceFormat.DIGITAL_PDF

    def parse(self, file_path: Path, document_id: UUID) -> IngestionResult:
        low_confidence: list[dict[str, Any]] = []
        nodes, total_pages, detected_format = self._parse_all(file_path, document_id, low_confidence)
        checksum = checksum_for_nodes(nodes)
        for node in nodes:
            if node.locator is not None:
                node.locator["checksum"] = checksum
        return IngestionResult(
            document_id=document_id,
            nodes=nodes,
            checksum=checksum,
            total_pages=total_pages,
            low_confidence_crops=low_confidence,
            source_format=detected_format,
        )

    def stream_nodes(self, file_path: Path, document_id: UUID) -> Iterator[ParsedNode]:
        """Yield parsed nodes incrementally for the batched persistence path."""
        nodes, _, _ = self._parse_all(file_path, document_id, [])
        yield from nodes

    def _parse_all(
        self,
        file_path: Path,
        document_id: UUID,
        low_confidence: list[dict[str, Any]],
    ) -> tuple[list[ParsedNode], int, SourceFormat]:
        raw = file_path.read_bytes()
        if raw.startswith(b"%PDF-"):
            return self._parse_pdf_bytes(file_path, document_id, low_confidence)

        # Safe UTF-8 fallback ONLY for non-%PDF- files (.txt, .md, synthetic text fixtures)
        decoded = raw.decode("utf-8", errors="ignore")
        pages = re.split(r"\f|\n---\s*PAGE\s*---\n", decoded) or [decoded]
        nodes = list(self._iter_text_nodes(pages, document_id, low_confidence))
        ext = file_path.suffix.lower()
        source_format = SourceFormat.TEXT if ext in {".txt", ".md"} else SourceFormat.DIGITAL_PDF
        return nodes, len(pages), source_format

    def _parse_pdf_bytes(
        self,
        file_path: Path,
        document_id: UUID,
        low_confidence: list[dict[str, Any]],
    ) -> tuple[list[ParsedNode], int, SourceFormat]:
        """Parse binary `%PDF-` files using pypdf `visitor_text`; never decode raw bytes as UTF-8."""
        nodes: list[ParsedNode] = []
        order = 0
        has_scanned_page = False

        try:
            from pypdf import PdfReader

            reader = PdfReader(str(file_path))
            pages = list(reader.pages)
        except Exception:
            pages = []

        if not pages:
            # Unreadable/image-only binary PDF fallback without ever calling raw.decode("utf-8")
            bbox = {"x0": 48.0, "y0": 64.0, "x1": 564.0, "y1": 728.0}
            locator = {
                "source_type": "pdf",
                "doc_id": str(document_id),
                "page": 1,
                "bbox": [48.0, 64.0, 564.0, 728.0],
                "coord_system": "pdf_user_space_bl_pt",
                "page_width": 612.0,
                "page_height": 792.0,
                "crop_box": [0.0, 0.0, 612.0, 792.0],
                "rotation": 0,
                "node_id": str(uuid4()),
                "checksum": "",
            }
            placeholder = "[SCANNED_PAGE_1] Binary PDF contains no extractable text layer; vision/OCR rescue required."
            low_confidence.append(
                {
                    "document_id": str(document_id),
                    "page_number": 1,
                    "bounding_box": bbox,
                    "ocr_confidence": 0.55,
                    "fallback_text": placeholder,
                }
            )
            nodes.append(
                ParsedNode(
                    node_type=NodeType.STAMP_NOTE,
                    verbatim_text=placeholder,
                    section_path="Page 1 (Scanned Region)",
                    page_number=1,
                    bounding_box=bbox,
                    ocr_confidence=0.55,
                    locator=locator,
                    node_order=0,
                )
            )
            return nodes, 1, SourceFormat.PHYSICAL_SCAN

        for page_number, page in enumerate(pages, start=1):
            mx0, my0, mx1, my1 = _normalize_box(getattr(page, "mediabox", None))
            page_width = round(max(1.0, mx1 - mx0), 2)
            page_height = round(max(1.0, my1 - my0), 2)
            cx0, cy0, cx1, cy1 = _normalize_box(getattr(page, "cropbox", None), (mx0, my0, mx1, my1))
            crop_box = [round(cx0, 2), round(cy0, 2), round(cx1, 2), round(cy1, 2)]
            rotation = int(getattr(page, "rotation", 0) or 0) % 360

            spans = extract_pdf_page_spans(page)
            lines = _group_spans_to_lines(spans)
            emitted_on_page = 0

            for line in lines:
                raw_text = line["text"].strip()
                if not raw_text:
                    continue
                confidence, clean_text = self._classify_confidence(raw_text)
                if not clean_text:
                    continue

                x0 = round(max(mx0, min(mx1 - 1.0, float(line["x0"]))), 2)
                y0 = round(max(my0, min(my1 - 1.0, float(line["y0"]))), 2)
                x1 = round(min(mx1, max(x0 + 1.0, float(line["x1"]))), 2)
                y1 = round(min(my1, max(y0 + 1.0, float(line["y1"]))), 2)
                bbox = {"x0": x0, "y0": y0, "x1": x1, "y1": y1}

                if confidence < self._confidence_threshold:
                    low_confidence.append(
                        {
                            "document_id": str(document_id),
                            "page_number": page_number,
                            "bounding_box": bbox,
                            "ocr_confidence": confidence,
                            "fallback_text": clean_text,
                        }
                    )

                locator = {
                    "source_type": "pdf",
                    "doc_id": str(document_id),
                    "page": page_number,
                    "bbox": [x0, y0, x1, y1],
                    "coord_system": "pdf_user_space_bl_pt",
                    "page_width": page_width,
                    "page_height": page_height,
                    "crop_box": crop_box,
                    "rotation": rotation,
                    "node_id": str(uuid4()),
                    "checksum": "",
                }
                nodes.append(
                    ParsedNode(
                        node_type=self._node_type(clean_text),
                        verbatim_text=clean_text,
                        section_path=f"Page {page_number}",
                        page_number=page_number,
                        bounding_box=bbox,
                        ocr_confidence=confidence,
                        locator=locator,
                        node_order=order,
                    )
                )
                order += 1
                emitted_on_page += 1

            if emitted_on_page == 0:
                # Image-only scanned page (%PDF- with empty extracted text on this page)
                has_scanned_page = True
                cw = max(1.0, cx1 - cx0)
                ch = max(1.0, cy1 - cy0)
                sx0 = round(max(mx0, cx0 + 0.08 * cw), 2)
                sy0 = round(max(my0, cy0 + 0.08 * ch), 2)
                sx1 = round(min(mx1, max(sx0 + 1.0, cx1 - 0.08 * cw)), 2)
                sy1 = round(min(my1, max(sy0 + 1.0, cy1 - 0.08 * ch)), 2)
                bbox = {"x0": sx0, "y0": sy0, "x1": sx1, "y1": sy1}
                confidence = 0.55
                placeholder = (
                    f"[SCANNED_PAGE_{page_number}] Image-only scanned PDF region requires OCR / vision rescue verification."
                )
                low_confidence.append(
                    {
                        "document_id": str(document_id),
                        "page_number": page_number,
                        "bounding_box": bbox,
                        "ocr_confidence": confidence,
                        "fallback_text": placeholder,
                    }
                )
                locator = {
                    "source_type": "pdf",
                    "doc_id": str(document_id),
                    "page": page_number,
                    "bbox": [sx0, sy0, sx1, sy1],
                    "coord_system": "pdf_user_space_bl_pt",
                    "page_width": page_width,
                    "page_height": page_height,
                    "crop_box": crop_box,
                    "rotation": rotation,
                    "node_id": str(uuid4()),
                    "checksum": "",
                }
                nodes.append(
                    ParsedNode(
                        node_type=NodeType.STAMP_NOTE,
                        verbatim_text=placeholder,
                        section_path=f"Page {page_number} (Scanned Region)",
                        page_number=page_number,
                        bounding_box=bbox,
                        ocr_confidence=confidence,
                        locator=locator,
                        node_order=order,
                    )
                )
                order += 1

        detected_format = SourceFormat.PHYSICAL_SCAN if has_scanned_page else SourceFormat.DIGITAL_PDF
        return nodes, len(pages), detected_format

    def _iter_text_nodes(
        self,
        pages: list[str],
        document_id: UUID,
        low_confidence: list[dict[str, Any]],
    ) -> Iterator[ParsedNode]:
        order = 0
        for page_number, page_text in enumerate(pages, start=1):
            for line_index, raw_line in enumerate(page_text.splitlines()):
                text = raw_line.strip()
                if not text:
                    continue
                confidence, clean_text = self._classify_confidence(text)
                if not clean_text:
                    continue
                line_num = line_index + 1
                locator = {
                    "source_type": "text",
                    "doc_id": str(document_id),
                    "page": page_number,
                    "line_start": line_num,
                    "line_end": line_num,
                    "node_id": str(uuid4()),
                    "checksum": "",
                }
                if confidence < self._confidence_threshold:
                    low_confidence.append(
                        {
                            "document_id": str(document_id),
                            "page_number": page_number,
                            "bounding_box": None,
                            "ocr_confidence": confidence,
                            "fallback_text": clean_text,
                        }
                    )
                yield ParsedNode(
                    node_type=self._node_type(clean_text),
                    verbatim_text=clean_text,
                    section_path=f"Page {page_number}",
                    page_number=page_number,
                    bounding_box=None,
                    ocr_confidence=confidence,
                    locator=locator,
                    node_order=order,
                )
                order += 1

    @staticmethod
    def _classify_confidence(text: str) -> tuple[float, str]:
        marked_low_confidence = "[LOW_CONFIDENCE]" in text
        stamped_region = any(marker in text.lower() for marker in ("stamp note", "stamp obscures", "handwritten"))
        cleaned = text.replace("[LOW_CONFIDENCE]", "").strip()
        short_noisy_region = len(cleaned) < 8 and not cleaned.startswith("#")
        confidence = 0.81 if marked_low_confidence or stamped_region else (0.86 if short_noisy_region else 1.0)
        return confidence, cleaned

    @staticmethod
    def _node_type(text: str) -> NodeType:
        if text.startswith("#") or re.match(r"^(?:\d+(?:\.\d+)*|[A-Z][A-Z ]{3,})[.: ]", text):
            return NodeType.HEADING
        if " | " in text:
            return NodeType.TABLE_ROW
        if text.lower().startswith(("clause", "policy", "the company", "access ", "encryption ")):
            return NodeType.CLAUSE
        if "stamp" in text.lower() or "addendum" in text.lower() or "margin" in text.lower():
            return NodeType.STAMP_NOTE
        return NodeType.PARAGRAPH
