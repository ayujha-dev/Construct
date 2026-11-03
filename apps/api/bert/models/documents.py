"""Typed SQLAlchemy models and domain enums for the BERT data contract."""

from __future__ import annotations

import enum
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bert.models.base import Base


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp for audit and entity records."""
    return datetime.now(UTC)


class SourceFormat(str, enum.Enum):
    PHYSICAL_SCAN = "PHYSICAL_SCAN"
    DIGITAL_PDF = "DIGITAL_PDF"
    XLSX = "XLSX"
    JSON_CONFIG = "JSON_CONFIG"
    TEXT = "TEXT"


class PriorityTier(str, enum.Enum):
    P0_CRITICAL = "P0_CRITICAL"
    P1_HIGH = "P1_HIGH"
    P2_MEDIUM = "P2_MEDIUM"
    P3_LOW = "P3_LOW"


class NodeType(str, enum.Enum):
    SECTION = "SECTION"
    CLAUSE = "CLAUSE"
    TABLE_ROW = "TABLE_ROW"
    JSON_RULE = "JSON_RULE"
    STAMP_NOTE = "STAMP_NOTE"
    HEADING = "HEADING"
    PARAGRAPH = "PARAGRAPH"
    LIST_ITEM = "LIST_ITEM"
    XLSX_ROW = "XLSX_ROW"


class VerificationStatus(str, enum.Enum):
    VERIFIED = "VERIFIED"
    NEEDS_HUMAN_VERIFICATION = "NEEDS_HUMAN_VERIFICATION"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class ResolvedByTier(str, enum.Enum):
    TIER1_CACHE = "TIER1_CACHE"
    TIER2_SLM_REGIMENT = "TIER2_SLM_REGIMENT"
    TIER3_ARBITER = "TIER3_ARBITER"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(index=True)
    filename: Mapped[str] = mapped_column(Text)
    source_format: Mapped[SourceFormat] = mapped_column(String(20))
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    sub_category: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority_tier: Mapped[PriorityTier] = mapped_column(String(20), default=PriorityTier.P2_MEDIUM)
    priority_score: Mapped[int] = mapped_column(Integer, default=50)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_latest_version: Mapped[bool] = mapped_column(Boolean, default=True)
    superseded_by: Mapped[UUID | None] = mapped_column(nullable=True)
    ast_checksum: Mapped[str] = mapped_column(String(64))
    storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    total_pages: Mapped[int] = mapped_column(Integer, default=0)
    total_ast_nodes: Mapped[int] = mapped_column(Integer, default=0)
    processing_status: Mapped[str] = mapped_column(String(20), default="COMPLETED")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    ast_nodes: Mapped[list[ASTNode]] = relationship(back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_documents_workspace_category", "workspace_id", "category"),
        Index("ix_documents_workspace_priority", "workspace_id", "priority_tier"),
    )


class ASTNode(Base):
    __tablename__ = "ast_nodes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    parent_node_id: Mapped[UUID | None] = mapped_column(nullable=True)
    node_type: Mapped[NodeType] = mapped_column(String(20))
    section_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    verbatim_text: Mapped[str] = mapped_column(Text)
    structured_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bounding_box: Mapped[dict[str, float] | None] = mapped_column(JSON, nullable=True)
    ocr_confidence: Mapped[float] = mapped_column(Float, default=1.0)
    category_tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    priority_score: Mapped[int] = mapped_column(Integer, default=50)
    node_order: Mapped[int] = mapped_column(Integer, default=0)

    document: Mapped[Document] = relationship(back_populates="ast_nodes")

    __table_args__ = (
        Index("ix_ast_document_order", "document_id", "node_order"),
        Index("ix_ast_node_type", "node_type"),
    )


class WorkItem(Base):
    __tablename__ = "work_items"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(index=True)
    batch_id: Mapped[UUID] = mapped_column(index=True)
    document_id: Mapped[UUID | None] = mapped_column(nullable=True, index=True)
    item_type: Mapped[str] = mapped_column(String(30))
    category: Mapped[str] = mapped_column(Text)
    priority_tier: Mapped[PriorityTier] = mapped_column(String(20))
    priority_score: Mapped[int] = mapped_column(Integer)
    prompt_or_question: Mapped[str] = mapped_column(Text)
    fluent_output: Mapped[str] = mapped_column(Text)
    structured_facts: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    verified_citations: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    verification_status: Mapped[VerificationStatus] = mapped_column(String(32))
    resolved_by_tier: Mapped[ResolvedByTier] = mapped_column(String(32))
    gate_telemetry: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    __table_args__ = (
        Index("ix_work_items_workspace_priority", "workspace_id", "priority_tier"),
        Index("ix_work_items_batch", "batch_id"),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[UUID | None] = mapped_column(nullable=True, index=True)
    work_item_id: Mapped[UUID | None] = mapped_column(nullable=True, index=True)
    agent_name: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(64))
    input_hash: Mapped[str] = mapped_column(String(64))
    output_hash: Mapped[str] = mapped_column(String(64))
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    processing_time_ms: Mapped[int] = mapped_column(Integer)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class JobExecution(Base):
    """Durable checkpoint cursor for a resumable regiment execution."""

    __tablename__ = "job_executions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(index=True)
    batch_id: Mapped[UUID] = mapped_column(index=True)
    status: Mapped[str] = mapped_column(String(20), default="RUNNING")
    current_agent_index: Mapped[int] = mapped_column(Integer, default=0)
    current_document_id: Mapped[UUID | None] = mapped_column(nullable=True)
    current_node_index: Mapped[int] = mapped_column(Integer, default=0)
    checkpoint_id: Mapped[UUID] = mapped_column(default=uuid4)
    completed_step_outputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    user_override_instructions: Mapped[list[str]] = mapped_column(JSON, default=list)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    __table_args__ = (Index("ix_job_executions_workspace_status", "workspace_id", "status"),)
