"""Shared isolated SQLite database for the vertical-slice tests."""

from __future__ import annotations

import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_bert.db"
os.environ["INFERENCE_MODE"] = "demo_simulator"

import pytest_asyncio
from sqlalchemy import delete

from bert.models.base import Base, SessionFactory, engine
from bert.models.documents import ASTNode, AuditLog, Document, ExecutiveSummaryRecord, JobExecution, WorkItem


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield
    async with SessionFactory() as session:
        await session.execute(delete(ASTNode))
        await session.execute(delete(WorkItem))
        await session.execute(delete(AuditLog))
        await session.execute(delete(ExecutiveSummaryRecord))
        await session.execute(delete(JobExecution))
        await session.execute(delete(Document))
        await session.commit()
    await engine.dispose()
