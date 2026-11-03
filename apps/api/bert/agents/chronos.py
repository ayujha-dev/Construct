"""Chronos' effective-date and supersession analysis."""

from __future__ import annotations

from typing import Any

from bert.models.documents import Document
from bert.models.documents import SourceFormat


def analyze_versions(documents: list[Document]) -> dict[str, Any]:
    """Mark the newest dated source and report the supersession relationship."""
    version_candidates = [document for document in documents if document.source_format != SourceFormat.XLSX]
    dated = sorted(version_candidates, key=lambda document: document.effective_date or document.created_at, reverse=True)
    latest = dated[0] if dated else None
    for document in documents:
        if document.source_format == SourceFormat.XLSX:
            document.is_latest_version = True
            continue
        document.is_latest_version = document.id == latest.id if latest is not None else True
        if latest is not None and document.id != latest.id:
            document.superseded_by = latest.id
    return {
        "latest_filename": latest.filename if latest is not None else None,
        "superseded_count": max(0, len(documents) - 1),
    }
