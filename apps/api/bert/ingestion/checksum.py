"""SHA-256 completeness verification for persisted AST nodes."""

from __future__ import annotations

import hashlib
import asyncio
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bert.models.documents import ASTNode, Document


async def verify_ingestion_completeness(
    session: AsyncSession, document_id: UUID, expected_checksum: str
) -> bool:
    """Recompute the ordered text digest and mark the document failed on mismatch."""
    result = await session.stream(
        select(ASTNode.verbatim_text).where(ASTNode.document_id == document_id).order_by(ASTNode.node_order)
    )
    digest = hashlib.sha256()
    batch: list[str] = []
    async for text in result.scalars():
        batch.append(text)
        if len(batch) >= 250:
            await asyncio.to_thread(_update_digest, digest, batch)
            batch.clear()
    if batch:
        await asyncio.to_thread(_update_digest, digest, batch)
    valid = digest.hexdigest() == expected_checksum
    if not valid:
        document = await session.get(Document, document_id)
        if document is not None:
            document.processing_status = "FAILED"
    return valid


def _update_digest(digest: Any, texts: list[str]) -> None:
    for text in texts:
        digest.update(text.encode("utf-8"))
