"""Chronos' effective-date and supersession analysis."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from bert.models.documents import ASTNode, Document, NodeType, SourceFormat
from bert.verification.citation_gate import assess_quote_strength


def _sort_timestamp(document: Document) -> datetime:
    """Normalize `date` (`effective_date`) and `datetime` (`created_at`) to UTC `datetime`."""
    value = document.effective_date or document.created_at
    if value is None:
        return datetime.min.replace(tzinfo=UTC)
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return datetime(value.year, value.month, value.day, tzinfo=UTC)


_NON_VERSIONED_FORMATS = {SourceFormat.XLSX, SourceFormat.JSON_CONFIG}


def _extract_format(doc: Document) -> SourceFormat | str:
    return doc.source_format


def analyze_versions(documents: list[Document]) -> dict[str, Any]:
    """Mark superseded policy/prose sources and report the supersession relationship."""
    version_candidates = [
        document for document in documents if _extract_format(document) not in _NON_VERSIONED_FORMATS
    ]
    dated_only = [doc for doc in version_candidates if doc.effective_date is not None]
    distinct_dates = {doc.effective_date for doc in dated_only if doc.effective_date is not None}

    latest: Document | None = None
    superseded_ids: list[str] = []

    if len(distinct_dates) >= 2:
        dated = sorted(dated_only, key=_sort_timestamp, reverse=True)
        latest = dated[0]
        latest_date = latest.effective_date
        for document in documents:
            if document not in version_candidates or document.effective_date is None or latest_date is None:
                document.is_latest_version = True
                document.superseded_by = None
                continue
            if document.effective_date < latest_date:
                document.is_latest_version = False
                document.superseded_by = latest.id
                superseded_ids.append(str(document.id))
            else:
                document.is_latest_version = True
                document.superseded_by = None
    else:
        # Exercise mixed date/datetime sort helper safely while only superseding explicit legacy artifacts.
        legacy_named = [
            doc
            for doc in version_candidates
            if any(marker in doc.filename.lower() for marker in ("legacy", "superseded", "old"))
        ]
        non_legacy = sorted(
            [doc for doc in version_candidates if doc not in legacy_named],
            key=_sort_timestamp,
            reverse=True,
        )
        all_sorted = sorted(version_candidates, key=_sort_timestamp, reverse=True)
        latest = non_legacy[0] if non_legacy else (all_sorted[0] if all_sorted else None)
        for document in documents:
            if (
                latest is not None
                and document in legacy_named
                and non_legacy
                and document.id != latest.id
            ):
                document.is_latest_version = False
                document.superseded_by = latest.id
                superseded_ids.append(str(document.id))
            else:
                document.is_latest_version = True
                document.superseded_by = None

    return {
        "latest_filename": latest.filename if latest is not None else None,
        "latest_document_id": str(latest.id) if latest is not None else None,
        "superseded_document_ids": superseded_ids,
        "superseded_count": sum(1 for doc in version_candidates if not doc.is_latest_version),
    }


def _pick_representative_node(nodes: list[ASTNode], *, prefer_terms: tuple[str, ...]) -> ASTNode | None:
    """Prefer a substantive strong node for temporal comparison, falling back to first node."""
    if not nodes:
        return None
    strong: list[tuple[int, int, ASTNode]] = []
    for idx, node in enumerate(nodes):
        if node.ocr_confidence < 0.90:
            continue
        is_weak, _ = assess_quote_strength(node.verbatim_text)
        if is_weak and node.node_type != NodeType.JSON_RULE:
            continue
        lowered = node.verbatim_text.lower()
        term_hits = sum(1 for term in prefer_terms if term in lowered)
        strong.append((term_hits, -idx, node))
    if strong:
        strong.sort(key=lambda item: (item[0], item[1]), reverse=True)
        return strong[0][2]
    return nodes[0]


def select_temporal_conflict_pairs(
    documents: list[Document],
    all_nodes: list[ASTNode],
) -> list[tuple[Document, Document, ASTNode, ASTNode]]:
    """Return ``(latest_doc, legacy_doc, newer_node, older_node)`` pairs for superseded policy/prose docs."""
    version_candidates = [doc for doc in documents if doc.source_format not in _NON_VERSIONED_FORMATS]
    legacy_docs = [doc for doc in version_candidates if not doc.is_latest_version]
    if not legacy_docs:
        return []
    doc_by_id = {doc.id: doc for doc in version_candidates}
    fallback_latest = next((doc for doc in version_candidates if doc.is_latest_version), None)
    if fallback_latest is None:
        return []

    nodes_by_doc: dict[UUID, list[ASTNode]] = {}
    for node in all_nodes:
        nodes_by_doc.setdefault(node.document_id, []).append(node)

    pairs: list[tuple[Document, Document, ASTNode, ASTNode]] = []
    for legacy_doc in legacy_docs:
        latest_doc = doc_by_id.get(legacy_doc.superseded_by) if legacy_doc.superseded_by else fallback_latest
        if latest_doc is None or latest_doc.id == legacy_doc.id:
            continue
        newer_node = _pick_representative_node(
            nodes_by_doc.get(latest_doc.id, []),
            prefer_terms=("mfa", "multifactor", "authentication", "password", "encrypt", "policy"),
        )
        older_node = _pick_representative_node(
            nodes_by_doc.get(legacy_doc.id, []),
            prefer_terms=("password", "rotation", "policy", "authentication", "mfa", "encrypt"),
        )
        if newer_node is not None and older_node is not None:
            pairs.append((latest_doc, legacy_doc, newer_node, older_node))
    return pairs
