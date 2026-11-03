"""Arbiter's temporal contradiction resolution record."""

from __future__ import annotations

from typing import Any

from bert.models.documents import Document


def resolve_conflicts(documents: list[Document]) -> dict[str, Any]:
    """Resolve the prototype's dated policy conflict in favor of the latest source."""
    latest = [document.filename for document in documents if document.is_latest_version]
    legacy = [document.filename for document in documents if not document.is_latest_version]
    return {"latest_documents": latest, "superseded_documents": legacy, "resolved": bool(latest and legacy)}
