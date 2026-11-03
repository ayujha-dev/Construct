"""Async SQLAlchemy base and session factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from bert.config import settings


class Base(DeclarativeBase):
    """Declarative base shared by the persistence models."""


engine: AsyncEngine = create_async_engine(settings.database_url, echo=False)
SessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, expire_on_commit=False
)


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Yield a transaction-scoped async session."""
    async with SessionFactory() as session:
        yield session
