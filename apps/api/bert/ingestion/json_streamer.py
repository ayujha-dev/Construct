"""Incremental JSON rule ingestion using ijson."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import ijson

from bert.ingestion.docling_parser import IngestionResult, ParsedNode, checksum_for_nodes
from bert.models.documents import NodeType, SourceFormat

DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024


def canonical_json_path(prefix: str) -> str:
    """Format a relative path into canonical `$.path` JSONPath syntax."""
    if not prefix or prefix == "root":
        return "$"
    if prefix.startswith("$.") or prefix.startswith("$[") or prefix == "$":
        return prefix
    if prefix.startswith("["):
        return f"${prefix}"
    return f"$.{prefix}"


class JSONStreamer:
    """Stream root entries and recursively emit rule/object AST nodes."""

    def __init__(self, *, max_payload_bytes: int = DEFAULT_MAX_PAYLOAD_BYTES) -> None:
        self.max_payload_bytes = max_payload_bytes

    def stream_nodes(self, file_path: Path, document_id: UUID | None = None) -> Iterator[ParsedNode]:
        order = 0
        doc_id_str = str(document_id) if document_id else ""
        array_indexes: dict[str, int] = {}
        # ijson.parse yields one event at a time. No complete root object or source
        # document is materialized, so memory is bounded by the current scalar.
        with file_path.open("rb") as handle:
            for path, event, value in ijson.parse(handle):
                if event == "start_map" and path.endswith(".item"):
                    array_indexes[path] = array_indexes.get(path, -1) + 1
                    continue
                if event in {"string", "number", "boolean", "null"} and path.endswith(".item"):
                    # Primitive arrays do not emit a start_map event.
                    array_indexes[path] = array_indexes.get(path, -1) + 1
                if event not in {"string", "number", "boolean", "null"}:
                    continue
                serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                prefix = _json_path(path, array_indexes) or "root"
                json_path = canonical_json_path(prefix)
                serialized_bytes = serialized.encode("utf-8")
                chunks: list[str] = []
                start = 0
                while start < max(1, len(serialized_bytes)):
                    end = min(start + self.max_payload_bytes, len(serialized_bytes))
                    while end < len(serialized_bytes) and end > start and serialized_bytes[end] & 0xC0 == 0x80:
                        end -= 1
                    if end == start:
                        end = min(start + self.max_payload_bytes, len(serialized_bytes))
                    chunks.append(serialized_bytes[start:end].decode("utf-8"))
                    start = end
                chunk_count = len(chunks)
                for chunk_index, chunk in enumerate(chunks):
                    chunk_path = prefix if chunk_count == 1 else f"{prefix}#chunk-{chunk_index + 1}"
                    payload: dict[str, Any] = {prefix: value} if chunk_count == 1 else {
                        "path": prefix,
                        "chunk_index": chunk_index,
                        "chunk_count": chunk_count,
                        "value": chunk,
                    }
                    locator = {
                        "source_type": "json",
                        "doc_id": doc_id_str,
                        "json_path": json_path,
                        "node_id": str(uuid4()),
                        "checksum": "",
                    }
                    yield ParsedNode(
                        node_type=NodeType.JSON_RULE,
                        verbatim_text=f"{chunk_path}: {chunk}",
                        section_path=chunk_path,
                        structured_payload=payload,
                        locator=locator,
                        node_order=order,
                    )
                    order += 1

    def parse(self, file_path: Path, document_id: UUID) -> IngestionResult:
        nodes = list(self.stream_nodes(file_path, document_id))
        checksum = checksum_for_nodes(nodes)
        for node in nodes:
            if node.locator is not None:
                node.locator["checksum"] = checksum
        return IngestionResult(
            document_id=document_id,
            nodes=nodes,
            checksum=checksum,
            total_pages=0,
            low_confidence_crops=[],
            source_format=SourceFormat.JSON_CONFIG,
        )


def _json_path(ijson_path: str, array_indexes: dict[str, int]) -> str:
    """Convert ijson's ``item`` markers into exact JSONPath indexes."""

    if ".item" not in ijson_path and ijson_path != "item":
        return ijson_path
    parts = ijson_path.split(".")
    output: list[str] = []
    for index, part in enumerate(parts):
        if part == "item":
            array_key = ".".join(parts[: index + 1])
            output.append(f"[{array_indexes.get(array_key, 0)}]")
        else:
            output.append(part)
    result = ".".join(output)
    return result.replace(".[", "[")
