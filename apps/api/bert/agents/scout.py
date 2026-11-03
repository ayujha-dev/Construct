"""Scout's deterministic low-confidence rescue routing."""

from __future__ import annotations

from typing import Any

from bert.ingestion.docling_parser import ParsedNode


def rescue_regions(nodes: list[ParsedNode], threshold: float = 0.90) -> list[dict[str, Any]]:
    """Return geometry payloads that need vision rescue."""
    return [
        {
            "page_number": node.page_number,
            "bounding_box": node.bounding_box,
            "ocr_confidence": node.ocr_confidence,
            "verbatim_text": node.verbatim_text,
        }
        for node in nodes
        if node.ocr_confidence < threshold
    ]
