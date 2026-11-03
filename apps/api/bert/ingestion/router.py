"""File allowlist and parser dispatch."""

from __future__ import annotations

from pathlib import Path
from collections.abc import Iterator
from uuid import UUID

from bert.ingestion.docling_parser import DoclingParser, IngestionResult, ParsedNode
from bert.ingestion.json_streamer import JSONStreamer
from bert.ingestion.xlsx_handler import XLSXHandler

ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".pdf", ".xlsx", ".json", ".txt", ".md"})
ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "application/json",
        "text/json",
        "text/plain",
        "text/markdown",
        "application/octet-stream",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
)


def safe_filename(filename: str) -> str:
    """Drop path components before a file enters local storage."""
    return Path(filename).name


def parse_file(file_path: Path, document_id: UUID) -> IngestionResult:
    extension = file_path.suffix.lower()
    if extension == ".pdf":
        return DoclingParser().parse(file_path, document_id)
    if extension == ".json":
        return JSONStreamer().parse(file_path, document_id)
    if extension == ".xlsx":
        return XLSXHandler().parse(file_path, document_id)
    if extension in {".txt", ".md"}:
        return DoclingParser().parse(file_path, document_id)
    raise ValueError(f"Unsupported file extension: {extension}")


def stream_file(file_path: Path, document_id: UUID) -> Iterator[ParsedNode]:
    """Return a parser generator used by the non-blocking batched ingest path."""
    extension = file_path.suffix.lower()
    if extension == ".pdf":
        return DoclingParser().stream_nodes(file_path, document_id)
    if extension == ".json":
        return JSONStreamer().stream_nodes(file_path)
    if extension == ".xlsx":
        return XLSXHandler().stream_nodes(file_path)
    if extension in {".txt", ".md"}:
        return DoclingParser().stream_nodes(file_path, document_id)
    raise ValueError(f"Unsupported file extension: {extension}")
