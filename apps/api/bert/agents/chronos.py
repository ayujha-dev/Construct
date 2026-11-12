"""Chronos' effective-date and supersession analysis."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from bert.models.documents import Document, SourceFormat


def _sort_timestamp(document: Document) -> datetime:
    """Normalize `date` (`effective_date`) and `datetime` (`created_at`) to UTC `datetime`."""
    value = document.effective_date or document.created_at
    if value is None:
        return datetime.min.replace(tzinfo=UTC)
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return datetime(value.year, value.month, value.day, tzinfo=UTC)


def analyze_versions(documents: list[Document]) -> dict[str, Any]:
    """Mark the newest dated source and report the supersession relationship."""
    version_candidates = [document for document in documents if document.source_format != SourceFormat.XLSX]
    dated = sorted(version_candidates, key=_sort_timestamp, reverse=True)
    latest = dated[0] if dated else None
    for document in documents:
        if document.source_format == SourceFormat.XLSX:
            document.is_latest_version = True
            continue
        document.is_latest_version = document.id == latest.id if latest is not None else True
        if latest is not None and document.id != latest.id:
            document.superseded_by = latest.id
        else:
            document.superseded_by = None
    return {
        "latest_filename": latest.filename if latest is not None else None,
        "superseded_count": sum(1 for doc in version_candidates if not doc.is_latest_version),
    }
