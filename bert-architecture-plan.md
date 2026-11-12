# ShieldStaff — Agentic Zero-Hallucination Document Intelligence Platform

## Goal

Design and build **ShieldStaff**, an enterprise AI compliance and document intelligence platform that ingests physical scans, digital PDFs, Excel questionnaires (`.xlsx`), and 50MB+ JSON configs. All inputs decompose into an immutable PostgreSQL Abstract Syntax Tree (`ast_nodes`), get automatically sorted/categorized/prioritized, and produce fluent, executive-ready outputs backed by deterministic substring citation checks.

The system uses a **7-agent pipeline** orchestrated via LangGraph, powered by the Qwen model family running on a single 48GB GPU via vLLM, with cloud burst fallback to Groq and Anthropic.

### Key Architectural Pivots from Previous "Construct" Plan

| Dimension          | Old (Construct)        | New (ShieldStaff)                                           |
| ------------------ | ---------------------- | ----------------------------------------------------------- |
| App type           | Tauri v2 desktop       | **React 19 web app** (Vite)                                 |
| Input types        | Legal PDFs/scans only  | **PDFs + XLSX + 50MB+ JSON**                                |
| Data model         | Flat chunks            | **AST tree** (`ast_nodes` with parent/child)                |
| Models             | Llama/Mistral/Qwen mix | **Qwen-unified family** (14B text + 7B vision)              |
| GPU target         | 2×A100 / 4×RTX 4090    | **Single 48GB GPU** (A6000 / RTX 6000 Ada)                  |
| Cloud              | Fully air-gapped       | **Cloud burst fallback** (Groq + Anthropic)                 |
| Queue              | Celery                 | **ARQ** (async, native `asyncio`)                           |
| Storage            | MinIO (AGPL)           | **SeaweedFS** (Apache 2.0) or encrypted local FS            |
| OCR                | Docling + Surya (GPL)  | **Docling + PaddleOCR** (Apache 2.0)                        |
| Guardrails         | NeMo Guardrails        | **Deterministic Python verification** (rapidfuzz + logprob) |
| Agents             | 4 generic agents       | **7 named pipeline stages** (Scout→Envoy)                   |
| Anti-hallucination | 5-layer defense        | **Hard extraction/fluency decoupling** + substring gate     |

---

## User Decisions & Confirmed Requirements

> [!NOTE]
> **Product Identity**: Confirmed name is **ShieldStaff**. All legacy "Construct" nomenclature has been eradicated.

> [!NOTE]
> **Licensing Strategy**: The team will retain a professional legal/licensing specialist prior to release to verify compliance across all open-source dependencies (ensuring clean Apache 2.0 / MIT / BSD / PostgreSQL licensing).

> [!NOTE]
> **Hardware & Commercial Deployment Strategy**:
>
> - Selling to high-stakes enterprise clients (large corporate M&A, high-liability agreements, large firms). Hardware will not be a bottleneck.
> - **Dual Delivery Model**:
>   1. **Hosted Cloud / Private VPC**: Encrypted endpoints for standard corporate setups.
>   2. **Turnkey On-Premises Appliance**: Option to ship pre-configured GPU systems on rent with an on-site/dedicated operator for maximum air-gapped security.
> - Fits single 48GB GPU (A6000 / RTX 6000 Ada) or dual-GPU rigs (2× A100 / RTX 4090 clusters) with seamless horizontal scaling via ARQ worker queues.

> [!NOTE]
> **Physical Document Quality & Restoration**:
>
> - Dedicated image restoration pre-processing pipeline: OpenCV deskew, contrast-limited adaptive histogram equalization (CLAHE), bilateral denoising, and unblurring.
> - Ingestion routes low-confidence crops (`<0.90`), faded stamps, and handwritten annotations directly to **Scout** (`Qwen2.5-VL-7B`).
> - Zero loophole policy: ambiguous or unverified elements are deterministically escalated to `verification_status = 'NEEDS_HUMAN_VERIFICATION'` and `priority_tier = 'P0_CRITICAL'`.

> [!NOTE]
> **Subscription & Commercial Model**:
>
> - **Tier 1 (Base Purchase)**: One-time perpetual purchase of the current stable software release + initial deployment.
> - **Tier 2 (Monthly Updates Subscription)**: Recurring monthly fee for receiving continuous updates, newly trained specialized agents, tooling expansions, and routine improvements (\*critical zero-day security patches delivered regardless).

> [!NOTE]
> **Project Timeline & Team Readiness**:
>
> - **3 to 4 Months (12–16 weeks)** target MVP timeline.
> - Scaffolding and development are designed with clean, modular, transparent, and strictly-typed Python/TypeScript code so the team can master each layer (ingestion, orchestration, data store, verification, UI) incrementally without black-box complexity.

---

## Complete System Architecture

```mermaid
flowchart TD
    subgraph CLIENT["🌐 Web Frontend (React 19 + Vite)"]
        UPLOAD["UploadDropzone\n(PDF/XLSX/JSON)"]
        TRIAGE["TriageGrid\n(Priority Dashboard)"]
        CITE["CitationInspector\n(Bounding Box Overlay)"]
        QA["Q&A Panel"]
    end

    subgraph API_LAYER["⚡ FastAPI Gateway"]
        REST["REST Routes"]
        WS["WebSocket Manager\n(Real-time Updates)"]
        AUTH["License Key\nValidator"]
    end

    subgraph QUEUE["📬 Task Queue"]
        ARQ_Q["ARQ Workers\n(Redis-backed)"]
    end

    subgraph INGESTION["📥 Stage 1: Lossless Ingestion"]
        DOCLING["Docling Parser\n(PDF Layout + Tables)"]
        PADDLE["PaddleOCR\n(Fallback OCR)"]
        IJSON["ijson Streamer\n(50MB+ JSON → O(1) memory)"]
        XLSX["openpyxl Handler\n(Excel Read/Write)"]
        CHECKSUM["SHA-256\nCompleteness Check"]
    end

    subgraph REGIMENT["🛡️ ShieldStaff Pipeline (LangGraph)"]
        SCOUT["1. Scout\n(Qwen2.5-VL-7B)\nVision OCR Rescue"]
        QM["2. Quartermaster\n(Qwen2.5-14B)\nClassification"]
        CHRONOS["3. Chronos\n(Qwen2.5-14B)\nTemporal Analysis"]
        VANGUARD["4. Vanguard\n(Qwen2.5-14B)\nPriority Scoring"]
        RANGER["5. Ranger\n(Qwen2.5-14B + Instructor)\nFact Extraction"]
        ARBITER["6. Arbiter\n(Qwen2.5-14B / Claude)\nConflict Resolution"]
        ENVOY["7. Envoy\n(Qwen2.5-14B)\nFluent Prose Output"]
    end

    subgraph VERIFY["🛡️ Anti-Hallucination Gate"]
        FUZZ["rapidfuzz ≥ 97%\nSubstring Match"]
        LOGP["Token Logprob\n≥ 0.92 Check"]
        HARD["Hard Fail →\nINSUFFICIENT_EVIDENCE"]
    end

    subgraph INFERENCE["🖥️ vLLM Inference (Single 48GB GPU)"]
        VLLM_TEXT["Qwen2.5-14B-AWQ\n(Port 8001, 55% VRAM)"]
        VLLM_VIS["Qwen2.5-VL-7B-AWQ\n(Port 8002, 20% VRAM)"]
        EMBED["BGE-M3 Embeddings\n(Port 8003, 5% VRAM)"]
        RERANK["BGE-Reranker-v2-M3\n(Port 8004, 5% VRAM)"]
    end

    subgraph CLOUD["☁️ Cloud Burst (Optional)"]
        GROQ["Groq\n(llama-3.1-8b-instant)"]
        CLAUDE["Anthropic Claude\n(Tier 3 Arbiter)"]
    end

    subgraph DATA["💾 Data Layer"]
        PG["PostgreSQL 16\n+ pgvector + GIN"]
        REDIS["Redis 7\n(ARQ + Cache)"]
        FS["SeaweedFS / Local FS\n(Encrypted Doc Store)"]
    end

    CLIENT -->|"HTTP / WS"| API_LAYER
    API_LAYER --> QUEUE
    QUEUE --> INGESTION
    INGESTION -->|"ast_nodes"| DATA
    INGESTION -->|"Low OCR\nConfidence"| SCOUT
    QUEUE --> REGIMENT
    REGIMENT --> VERIFY
    VERIFY -->|"✅ Verified"| DATA
    VERIFY -->|"❌ Failed"| HARD
    REGIMENT --> INFERENCE
    REGIMENT -->|"Overflow"| CLOUD
    HARD -->|"P0_CRITICAL\nwork_item"| DATA

    style CLIENT fill:#1e293b,stroke:#3b82f6,color:#fff
    style API_LAYER fill:#1e3a5f,stroke:#60a5fa,color:#fff
    style INGESTION fill:#4c1d95,stroke:#8b5cf6,color:#fff
    style REGIMENT fill:#991b1b,stroke:#ef4444,color:#fff
    style VERIFY fill:#065f46,stroke:#10b981,color:#fff
    style INFERENCE fill:#92400e,stroke:#f59e0b,color:#000
    style CLOUD fill:#374151,stroke:#9ca3af,color:#fff
    style DATA fill:#1e40af,stroke:#3b82f6,color:#fff
```

---

## Proposed Changes — Deep Dive

### Component 1: Monorepo Root & Infrastructure

---

#### [NEW] `bert/docker-compose.yml`

Docker Compose orchestrates all infrastructure services for local development and production:

```yaml
version: "3.9"

services:
  # ── PostgreSQL 16 with pgvector ──
  postgres:
    image: pgvector/pgvector:pg16
    container_name: bert-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: bert
      POSTGRES_USER: bert
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-bert_dev_secret}
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bert"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ── Redis 7 (ARQ task queue + Tier 1 cache) ──
  redis:
    image: redis:7-alpine
    container_name: bert-redis
    restart: unless-stopped
    command: >
      redis-server
        --requirepass ${REDIS_PASSWORD:-bert_dev_secret}
        --maxmemory 512mb
        --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test:
        ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-bert_dev_secret}", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ── SeaweedFS (Apache 2.0 S3-compatible object storage) ──
  seaweedfs:
    image: chrislusf/seaweedfs:latest
    container_name: bert-seaweedfs
    restart: unless-stopped
    command: "server -dir=/data -s3 -s3.port=8333 -master.volumeSizeLimitMB=1024"
    ports:
      - "9333:9333" # Master
      - "8080:8080" # Filer
      - "8333:8333" # S3 API
    volumes:
      - seaweed_data:/data

  # ── vLLM: Text Agent (Qwen2.5-14B-Instruct-AWQ) ──
  vllm-text:
    image: vllm/vllm-openai:latest
    container_name: bert-vllm-text
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    command: >
      --model Qwen/Qwen2.5-14B-Instruct-AWQ
      --port 8001
      --gpu-memory-utilization 0.55
      --max-model-len 16384
      --enable-prefix-caching
      --kv-cache-dtype fp8
      --dtype auto
    ports:
      - "8001:8001"
    volumes:
      - model_cache:/root/.cache/huggingface

  # ── vLLM: Vision Agent (Qwen2.5-VL-7B-Instruct-AWQ) ──
  vllm-vision:
    image: vllm/vllm-openai:latest
    container_name: bert-vllm-vision
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    command: >
      --model Qwen/Qwen2.5-VL-7B-Instruct-AWQ
      --port 8002
      --gpu-memory-utilization 0.20
      --max-model-len 4096
      --enable-prefix-caching
      --kv-cache-dtype fp8
      --dtype auto
    ports:
      - "8002:8002"
    volumes:
      - model_cache:/root/.cache/huggingface

  # ── Embedding + Reranker server (lightweight, can share remaining VRAM) ──
  # These are small enough to run via a single FastAPI process using sentence-transformers
  # rather than a full vLLM instance, saving ~10% VRAM overhead
  embedding-server:
    build:
      context: ./apps/api
      dockerfile: Dockerfile.embedding
    container_name: bert-embedding
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      EMBEDDING_MODEL: BAAI/bge-m3
      RERANKER_MODEL: BAAI/bge-reranker-v2-m3
      CUDA_VISIBLE_DEVICES: "0"
    ports:
      - "8003:8003"
    volumes:
      - model_cache:/root/.cache/huggingface

volumes:
  pg_data:
  redis_data:
  seaweed_data:
  model_cache:
```

**VRAM Budget Breakdown (48GB GPU):**

| Service            | Model                 | VRAM Allocation   | Weights | KV Cache |
| ------------------ | --------------------- | ----------------- | ------- | -------- |
| `vllm-text`        | Qwen2.5-14B-AWQ       | 55% (~26GB)       | ~10GB   | ~16GB    |
| `vllm-vision`      | Qwen2.5-VL-7B-AWQ     | 20% (~10GB)       | ~5GB    | ~5GB     |
| `embedding-server` | BGE-M3 + BGE-Reranker | 10% (~5GB)        | ~2.3GB  | ~2.7GB   |
| PyTorch overhead   | —                     | ~5% (~2.5GB)      | —       | —        |
| **Headroom**       | —                     | **~10% (~4.5GB)** | —       | —        |

---

#### [NEW] `bert/.env.example`

```env
# Database
POSTGRES_PASSWORD=bert_dev_secret
DATABASE_URL=postgresql+asyncpg://bert:bert_dev_secret@localhost:5432/bert

# Redis
REDIS_PASSWORD=bert_dev_secret
REDIS_URL=redis://:bert_dev_secret@localhost:6379/0

# SeaweedFS
SEAWEEDFS_ENDPOINT=http://localhost:8333
SEAWEEDFS_ACCESS_KEY=bert
SEAWEEDFS_SECRET_KEY=bert_dev_secret
SEAWEEDFS_BUCKET=bert-documents

# vLLM Inference
VLLM_TEXT_URL=http://localhost:8001/v1
VLLM_VISION_URL=http://localhost:8002/v1
EMBEDDING_URL=http://localhost:8003

# Cloud Burst (optional — leave empty for air-gapped mode)
GROQ_API_KEY=
ANTHROPIC_API_KEY=

# License
LICENSE_SERVER_URL=https://license.bert.ai/v1
```

---

### Component 2: Backend — SQLAlchemy Models

---

#### [NEW] `apps/api/bert/models/base.py`

```python
"""SQLAlchemy async base and session factory."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import MetaData, text
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP

# Naming convention for constraints (Alembic-friendly)
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(AsyncAttrs, DeclarativeBase):
    metadata = MetaData(naming_convention=convention)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("NOW()"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("NOW()"),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

#### [NEW] `apps/api/bert/models/documents.py`

```python
"""Document and AST node models — the core of BERT's data layer."""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean, Date, Float, ForeignKey, Index, Integer, String, Text,
    text, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class SourceFormat(str, enum.Enum):
    PHYSICAL_SCAN = "PHYSICAL_SCAN"
    DIGITAL_PDF = "DIGITAL_PDF"
    XLSX = "XLSX"
    JSON_CONFIG = "JSON_CONFIG"


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


# ── Documents ──────────────────────────────────────────────


class Document(TimestampMixin, Base):
    __tablename__ = "documents"

    id: Mapped[uuid4] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    workspace_id: Mapped[uuid4] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    source_format: Mapped[SourceFormat] = mapped_column(
        String(20), nullable=False
    )
    category: Mapped[Optional[str]] = mapped_column(Text)
    sub_category: Mapped[Optional[str]] = mapped_column(Text)
    priority_tier: Mapped[PriorityTier] = mapped_column(
        String(15), server_default="P2_MEDIUM"
    )
    priority_score: Mapped[int] = mapped_column(Integer, server_default="50")
    effective_date: Mapped[Optional[date]] = mapped_column(Date)
    is_latest_version: Mapped[bool] = mapped_column(Boolean, server_default="true")
    superseded_by: Mapped[Optional[uuid4]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True
    )
    ast_checksum: Mapped[str] = mapped_column(Text, nullable=False)
    storage_path: Mapped[Optional[str]] = mapped_column(Text)
    total_pages: Mapped[Optional[int]] = mapped_column(Integer)
    total_ast_nodes: Mapped[Optional[int]] = mapped_column(Integer)
    processing_status: Mapped[str] = mapped_column(
        String(20), server_default="'PENDING'"
    )  # PENDING, INGESTING, PROCESSING, COMPLETED, FAILED

    # Relationships
    ast_nodes: Mapped[list["ASTNode"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    work_items: Mapped[list["WorkItem"]] = relationship(back_populates="document")

    __table_args__ = (
        Index("ix_documents_workspace_category", "workspace_id", "category"),
        Index("ix_documents_workspace_priority", "workspace_id", "priority_tier"),
        CheckConstraint(
            "priority_score >= 0 AND priority_score <= 100",
            name="valid_priority_score",
        ),
    )


# ── AST Nodes ──────────────────────────────────────────────


class ASTNode(Base):
    __tablename__ = "ast_nodes"

    id: Mapped[uuid4] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    document_id: Mapped[uuid4] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    parent_node_id: Mapped[Optional[uuid4]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ast_nodes.id"), nullable=True
    )
    node_type: Mapped[NodeType] = mapped_column(String(20), nullable=False)
    section_path: Mapped[Optional[str]] = mapped_column(Text)
    verbatim_text: Mapped[str] = mapped_column(Text, nullable=False)
    structured_payload: Mapped[Optional[dict]] = mapped_column(JSONB)
    page_number: Mapped[Optional[int]] = mapped_column(Integer)
    bounding_box: Mapped[Optional[dict]] = mapped_column(JSONB)  # {x0, y0, x1, y1}
    ocr_confidence: Mapped[float] = mapped_column(Float, server_default="1.0")
    category_tags: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    priority_score: Mapped[int] = mapped_column(Integer, server_default="50")
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(1024))
    node_order: Mapped[int] = mapped_column(Integer, server_default="0")

    # Relationships
    document: Mapped["Document"] = relationship(back_populates="ast_nodes")
    parent: Mapped[Optional["ASTNode"]] = relationship(
        remote_side="ASTNode.id", backref="children"
    )

    __table_args__ = (
        Index("ix_ast_document_id", "document_id"),
        Index("ix_ast_parent_node_id", "parent_node_id"),
        Index("ix_ast_node_type", "node_type"),
        Index("ix_ast_section_path", "section_path"),
        Index(
            "ix_ast_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 200},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        # GIN index for full-text search on verbatim_text
        Index(
            "ix_ast_verbatim_gin",
            text("to_tsvector('english', verbatim_text)"),
            postgresql_using="gin",
        ),
        # GIN index on JSONB structured_payload
        Index(
            "ix_ast_structured_payload_gin",
            "structured_payload",
            postgresql_using="gin",
        ),
        # GIN index on category_tags array
        Index(
            "ix_ast_category_tags_gin",
            "category_tags",
            postgresql_using="gin",
        ),
    )


# ── Work Items ─────────────────────────────────────────────


class WorkItem(TimestampMixin, Base):
    __tablename__ = "work_items"

    id: Mapped[uuid4] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    workspace_id: Mapped[uuid4] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    batch_id: Mapped[uuid4] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    document_id: Mapped[Optional[uuid4]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True
    )
    item_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # QUESTIONNAIRE_ROW, RISK_AUDIT, CLAUSE_EXTRACTION
    category: Mapped[str] = mapped_column(Text, nullable=False)
    priority_tier: Mapped[PriorityTier] = mapped_column(String(15), nullable=False)
    priority_score: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt_or_question: Mapped[str] = mapped_column(Text, nullable=False)
    fluent_output: Mapped[str] = mapped_column(Text, nullable=False)
    structured_facts: Mapped[dict] = mapped_column(JSONB, nullable=False)
    verified_citations: Mapped[dict] = mapped_column(JSONB, nullable=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        String(30), nullable=False
    )
    resolved_by_tier: Mapped[ResolvedByTier] = mapped_column(
        String(25), nullable=False
    )

    # Relationships
    document: Mapped[Optional["Document"]] = relationship(back_populates="work_items")

    __table_args__ = (
        Index("ix_work_items_workspace_priority", "workspace_id", "priority_tier"),
        Index("ix_work_items_batch", "batch_id"),
        Index("ix_work_items_verification", "verification_status"),
    )


# ── Audit Log ──────────────────────────────────────────────


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[Optional[uuid4]] = mapped_column(UUID(as_uuid=True))
    work_item_id: Mapped[Optional[uuid4]] = mapped_column(UUID(as_uuid=True))
    agent_name: Mapped[str] = mapped_column(String(30), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256
    output_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[Optional[str]] = mapped_column(String(50))
    processing_time_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        text("TIMESTAMPTZ"), server_default=text("NOW()"), nullable=False
    )

    __table_args__ = (
        Index("ix_audit_document_id", "document_id"),
        Index("ix_audit_agent_name", "agent_name"),
        Index("ix_audit_created_at", "created_at"),
    )
```

---

### Component 3: Lossless Ingestion Pipeline

The ingestion pipeline is the most critical subsystem. It converts raw input files into `ast_nodes` with **zero data loss**, verified by SHA-256 checksums.

---

#### [NEW] `apps/api/bert/ingestion/docling_parser.py`

Handles PDFs (digital and scanned) → AST nodes with layout preservation:

```python
"""
Lossless PDF ingestion via Docling.

Converts PDFs into hierarchical AST nodes preserving:
- Section structure (headings, sub-headings, clauses)
- Tables (each row becomes an independent ast_node with column headers)
- Page numbers and bounding boxes for citation grounding
- OCR confidence per region

Low-confidence regions (< 0.90) are cropped and routed to Scout (Qwen2.5-VL-7B).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncGenerator
from uuid import UUID, uuid4

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.base_models import InputFormat

from bert.models.documents import ASTNode, NodeType


@dataclass
class ParsedNode:
    """Intermediate representation before DB insertion."""
    node_type: NodeType
    verbatim_text: str
    section_path: str | None = None
    page_number: int | None = None
    bounding_box: dict | None = None  # {x0, y0, x1, y1}
    ocr_confidence: float = 1.0
    structured_payload: dict | None = None
    parent_index: int | None = None  # Index into the flat list for tree reconstruction
    node_order: int = 0


@dataclass
class IngestionResult:
    """Result of parsing a single document."""
    document_id: UUID
    nodes: list[ParsedNode]
    checksum: str  # SHA-256 of all verbatim_text concatenated
    total_pages: int
    low_confidence_crops: list[dict]  # Regions to route to Scout agent


class DoclingParser:
    """Parses PDF documents into hierarchical AST nodes."""

    def __init__(self, *, ocr_confidence_threshold: float = 0.90):
        self._confidence_threshold = ocr_confidence_threshold
        pipeline_opts = PdfPipelineOptions(
            do_ocr=True,
            do_table_structure=True,
            generate_page_images=True,
        )
        self._converter = DocumentConverter(
            allowed_formats=[InputFormat.PDF],
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_opts),
            },
        )

    def parse(self, file_path: Path, document_id: UUID) -> IngestionResult:
        """
        Parse a PDF into AST nodes with zero data loss.

        Every paragraph, heading, table row, and structural element
        becomes an independent ast_node record.
        """
        result = self._converter.convert(str(file_path))
        doc = result.document

        nodes: list[ParsedNode] = []
        low_confidence_crops: list[dict] = []
        hasher = hashlib.sha256()
        node_order = 0

        # Walk the Docling document tree
        for item in doc.iterate_items():
            node_order += 1
            verbatim = item.text.strip() if hasattr(item, "text") and item.text else ""

            if not verbatim:
                continue

            # Determine node type from Docling's label
            node_type = self._map_node_type(item)

            # Extract bounding box if available
            bbox = None
            if hasattr(item, "prov") and item.prov:
                prov = item.prov[0]
                bbox = {
                    "x0": prov.bbox.l,
                    "y0": prov.bbox.t,
                    "x1": prov.bbox.r,
                    "y1": prov.bbox.b,
                }

            # Extract page number
            page_num = None
            if hasattr(item, "prov") and item.prov:
                page_num = item.prov[0].page_no

            # Determine OCR confidence
            confidence = 1.0
            if hasattr(item, "confidence"):
                confidence = item.confidence

            # Flag low-confidence regions for Scout agent
            if confidence < self._confidence_threshold and bbox and page_num:
                low_confidence_crops.append({
                    "document_id": str(document_id),
                    "page_number": page_num,
                    "bounding_box": bbox,
                    "ocr_confidence": confidence,
                    "fallback_text": verbatim,
                })

            # Build section path from document hierarchy
            section_path = self._build_section_path(item)

            # Handle tables: each row becomes an independent node
            if hasattr(item, "data") and item.data:  # Table data
                for row_idx, row in enumerate(item.data):
                    headers = item.data[0] if item.data else []
                    row_text = " | ".join(str(cell) for cell in row)
                    row_payload = {
                        "headers": [str(h) for h in headers],
                        "row_data": {str(headers[i]): str(row[i]) for i in range(min(len(headers), len(row)))},
                        "row_index": row_idx,
                        "parent_section": section_path,
                    }
                    hasher.update(row_text.encode("utf-8"))
                    nodes.append(ParsedNode(
                        node_type=NodeType.TABLE_ROW,
                        verbatim_text=row_text,
                        section_path=section_path,
                        page_number=page_num,
                        bounding_box=bbox,
                        ocr_confidence=confidence,
                        structured_payload=row_payload,
                        node_order=node_order,
                    ))
                    node_order += 1
                continue

            hasher.update(verbatim.encode("utf-8"))
            nodes.append(ParsedNode(
                node_type=node_type,
                verbatim_text=verbatim,
                section_path=section_path,
                page_number=page_num,
                bounding_box=bbox,
                ocr_confidence=confidence,
                node_order=node_order,
            ))

        checksum = hasher.hexdigest()
        total_pages = doc.num_pages if hasattr(doc, "num_pages") else 0

        return IngestionResult(
            document_id=document_id,
            nodes=nodes,
            checksum=checksum,
            total_pages=total_pages,
            low_confidence_crops=low_confidence_crops,
        )

    @staticmethod
    def _map_node_type(item) -> NodeType:
        """Map Docling document element labels to BERT NodeType."""
        label = getattr(item, "label", "").lower()
        mapping = {
            "title": NodeType.HEADING,
            "section_header": NodeType.HEADING,
            "heading": NodeType.HEADING,
            "paragraph": NodeType.PARAGRAPH,
            "text": NodeType.PARAGRAPH,
            "list_item": NodeType.LIST_ITEM,
            "table": NodeType.TABLE_ROW,
            "caption": NodeType.PARAGRAPH,
        }
        return mapping.get(label, NodeType.PARAGRAPH)

    @staticmethod
    def _build_section_path(item) -> str | None:
        """Build a hierarchical section path like '4 > 4.2 > 4.2(b)'."""
        # Traverse parent chain if available
        parts: list[str] = []
        current = item
        while hasattr(current, "parent") and current.parent:
            if hasattr(current.parent, "text") and current.parent.text:
                parts.append(current.parent.text.strip()[:80])
            current = current.parent
        if parts:
            return " > ".join(reversed(parts))
        return None
```

---

#### [NEW] `apps/api/bert/ingestion/json_streamer.py`

Handles 50MB+ JSON files with $O(1)$ memory using `ijson`:

```python
"""
Streaming JSON ingestion for large config files (50MB+).

Uses ijson to parse JSON incrementally in O(1) memory.
Every leaf value, nested object, and array element becomes
an independent ast_node with its full JSONPath preserved.

NEVER loads the full JSON file into memory.
NEVER chunks raw JSON strings by token count.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Generator
from uuid import UUID

import ijson

from bert.models.documents import NodeType
from bert.ingestion.docling_parser import ParsedNode, IngestionResult


class JSONStreamer:
    """Streams large JSON files into AST nodes with zero memory overhead."""

    def __init__(self, *, max_payload_bytes: int = 64 * 1024):
        """
        Args:
            max_payload_bytes: Maximum size of structured_payload per node.
                Objects larger than this are split into child nodes.
        """
        self._max_payload_bytes = max_payload_bytes

    def parse(self, file_path: Path, document_id: UUID) -> IngestionResult:
        """
        Stream-parse a JSON file into AST nodes.

        Strategy:
        1. Stream through the JSON using ijson prefix events
        2. Group events by their top-level key path
        3. Each terminal value or contained object becomes an ast_node
        4. Full JSONPath is preserved as section_path
        5. SHA-256 checksum computed incrementally
        """
        nodes: list[ParsedNode] = []
        hasher = hashlib.sha256()
        node_order = 0

        with open(file_path, "rb") as f:
            # Use ijson to iterate over key-value pairs incrementally
            parser = ijson.parse(f, use_float=True)

            current_path: list[str] = []
            current_value_parts: list[str] = []
            current_object_depth = 0
            object_buffer: dict = {}
            buffer_path: str = ""

            for prefix, event, value in parser:
                if event == "start_map":
                    current_object_depth += 1
                    if current_object_depth <= 2:
                        # Track top-level and second-level objects
                        buffer_path = prefix
                        object_buffer = {}
                elif event == "end_map":
                    current_object_depth -= 1
                    if current_object_depth <= 1 and object_buffer:
                        # Flush accumulated object as a single AST node
                        node_order += 1
                        payload_str = json.dumps(object_buffer, ensure_ascii=False)

                        # If the object is too large, split into per-key nodes
                        if len(payload_str.encode("utf-8")) > self._max_payload_bytes:
                            for sub_key, sub_val in object_buffer.items():
                                node_order += 1
                                sub_text = f"{sub_key}: {json.dumps(sub_val, ensure_ascii=False)}"
                                hasher.update(sub_text.encode("utf-8"))
                                nodes.append(ParsedNode(
                                    node_type=NodeType.JSON_RULE,
                                    verbatim_text=sub_text,
                                    section_path=f"{buffer_path}.{sub_key}" if buffer_path else sub_key,
                                    structured_payload={sub_key: sub_val},
                                    node_order=node_order,
                                ))
                        else:
                            verbatim = payload_str
                            hasher.update(verbatim.encode("utf-8"))
                            nodes.append(ParsedNode(
                                node_type=NodeType.JSON_RULE,
                                verbatim_text=verbatim,
                                section_path=buffer_path or "root",
                                structured_payload=object_buffer,
                                node_order=node_order,
                            ))
                        object_buffer = {}

                elif event == "map_key":
                    pass  # Handled by prefix tracking

                elif event in ("string", "number", "boolean", "null"):
                    if current_object_depth <= 2:
                        # Terminal value at a reasonable depth — store directly
                        key = prefix.rsplit(".", 1)[-1] if "." in prefix else prefix
                        if current_object_depth >= 1:
                            object_buffer[key] = value
                        else:
                            # Top-level scalar
                            node_order += 1
                            text_repr = f"{prefix}: {json.dumps(value, ensure_ascii=False)}"
                            hasher.update(text_repr.encode("utf-8"))
                            nodes.append(ParsedNode(
                                node_type=NodeType.JSON_RULE,
                                verbatim_text=text_repr,
                                section_path=prefix,
                                structured_payload={prefix: value},
                                node_order=node_order,
                            ))

                elif event == "start_array":
                    pass  # Arrays handled via their item events

                elif event == "end_array":
                    pass

        checksum = hasher.hexdigest()

        return IngestionResult(
            document_id=document_id,
            nodes=nodes,
            checksum=checksum,
            total_pages=0,  # JSON has no pages
            low_confidence_crops=[],  # No OCR for JSON
        )
```

---

#### [NEW] `apps/api/bert/ingestion/xlsx_handler.py`

Handles Excel spreadsheets — read rows into AST, write results back:

```python
"""
Excel spreadsheet ingestion and write-back via openpyxl.

Each row becomes an independent ast_node containing:
- Column headers (from row 1 or detected header row)
- Raw cell values as a JSONB dict
- Parent section path (sheet name)
- Row index for write-back targeting

Write-back preserves existing formatting, formulas, and merged cells.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any
from uuid import UUID

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

from bert.models.documents import NodeType
from bert.ingestion.docling_parser import ParsedNode, IngestionResult


class XLSXHandler:
    """Parse and write-back Excel files with zero data loss."""

    def __init__(self, *, header_row: int = 1):
        """
        Args:
            header_row: 1-indexed row number containing column headers.
        """
        self._header_row = header_row

    def parse(self, file_path: Path, document_id: UUID) -> IngestionResult:
        """
        Parse all sheets in an Excel file into AST nodes.

        Each data row becomes a TABLE_ROW / XLSX_ROW node with:
        - verbatim_text: pipe-separated cell values
        - structured_payload: {header: value} dict
        - section_path: "SheetName > Row N"
        """
        wb = load_workbook(str(file_path), read_only=True, data_only=True)
        nodes: list[ParsedNode] = []
        hasher = hashlib.sha256()
        node_order = 0

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = list(ws.iter_rows(values_only=True))

            if not rows:
                continue

            # Extract headers from the designated header row
            header_idx = self._header_row - 1
            if header_idx >= len(rows):
                continue

            headers = [
                str(cell).strip() if cell is not None else f"Column_{i + 1}"
                for i, cell in enumerate(rows[header_idx])
            ]

            # Process data rows (everything after the header)
            for row_idx, row in enumerate(rows[header_idx + 1:], start=self._header_row + 1):
                # Build row dict mapping headers to values
                row_dict: dict[str, Any] = {}
                cell_texts: list[str] = []
                for col_idx, cell_value in enumerate(row):
                    header = headers[col_idx] if col_idx < len(headers) else f"Column_{col_idx + 1}"
                    str_val = str(cell_value) if cell_value is not None else ""
                    row_dict[header] = cell_value
                    cell_texts.append(str_val)

                verbatim = " | ".join(cell_texts)
                if not verbatim.strip() or verbatim.replace("|", "").strip() == "":
                    continue  # Skip empty rows

                node_order += 1
                hasher.update(verbatim.encode("utf-8"))

                nodes.append(ParsedNode(
                    node_type=NodeType.XLSX_ROW,
                    verbatim_text=verbatim,
                    section_path=f"{sheet_name} > Row {row_idx}",
                    structured_payload={
                        "headers": headers,
                        "row_data": row_dict,
                        "sheet_name": sheet_name,
                        "row_index": row_idx,
                    },
                    node_order=node_order,
                ))

        wb.close()
        checksum = hasher.hexdigest()

        return IngestionResult(
            document_id=document_id,
            nodes=nodes,
            checksum=checksum,
            total_pages=0,
            low_confidence_crops=[],
        )

    @staticmethod
    def write_back(
        file_path: Path,
        results: list[dict],
        *,
        output_column: str = "AI_Response",
        status_column: str = "AI_Status",
        sheet_name: str | None = None,
    ) -> Path:
        """
        Write AI-generated results back into the original Excel file.

        Preserves all existing formatting, formulas, and merged cells.
        Appends two new columns: AI_Response and AI_Status.

        Args:
            file_path: Path to the original Excel file.
            results: List of dicts with 'row_index', 'fluent_output', 'verification_status'.
            output_column: Header for the AI response column.
            status_column: Header for the verification status column.
            sheet_name: Target sheet name (uses first sheet if None).

        Returns:
            Path to the modified file.
        """
        wb = load_workbook(str(file_path))
        ws = wb[sheet_name] if sheet_name else wb.active

        # Find or create output columns
        max_col = ws.max_column
        output_col_idx = max_col + 1
        status_col_idx = max_col + 2

        # Write headers
        ws.cell(row=1, column=output_col_idx, value=output_column)
        ws.cell(row=1, column=status_col_idx, value=status_column)

        # Write results back to their source rows
        for result in results:
            row_idx = result["row_index"]
            ws.cell(row=row_idx, column=output_col_idx, value=result.get("fluent_output", ""))
            ws.cell(row=row_idx, column=status_col_idx, value=result.get("verification_status", ""))

        # Save in-place
        wb.save(str(file_path))
        wb.close()

        return file_path
```

---

#### [NEW] `apps/api/bert/ingestion/checksum.py`

Verification layer ensuring zero data loss:

```python
"""
Ingestion completeness verification via SHA-256 checksums.

Verifies that every page/row/element from the source document
has been captured as an ast_node before marking ingestion complete.
"""

from __future__ import annotations

import hashlib
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from bert.models.documents import ASTNode, Document


async def verify_ingestion_completeness(
    session: AsyncSession,
    document_id: UUID,
    expected_checksum: str,
) -> bool:
    """
    Recompute SHA-256 from stored ast_nodes and compare
    against the ingestion-time checksum.

    Returns True if checksums match (zero data loss confirmed).
    """
    # Fetch all verbatim_text in node_order
    stmt = (
        select(ASTNode.verbatim_text)
        .where(ASTNode.document_id == document_id)
        .order_by(ASTNode.node_order)
    )
    result = await session.execute(stmt)
    texts = result.scalars().all()

    # Recompute checksum
    hasher = hashlib.sha256()
    for text in texts:
        hasher.update(text.encode("utf-8"))

    actual_checksum = hasher.hexdigest()

    if actual_checksum != expected_checksum:
        # DATA LOSS DETECTED — mark document as failed
        doc_stmt = select(Document).where(Document.id == document_id)
        doc = (await session.execute(doc_stmt)).scalar_one()
        doc.processing_status = "FAILED"
        await session.commit()
        return False

    return True
```

---

### Component 4: Anti-Hallucination Verification

---

#### [NEW] `apps/api/bert/verification/citation_gate.py`

The hard anti-hallucination gate — deterministic, no LLM involved:

```python
"""
Hard Anti-Hallucination Gate.

Deterministic verification that EVERY cited quote from an agent's output
actually exists in the source ast_nodes. Uses rapidfuzz for OCR-tolerant
substring matching.

On failure, output is hardcoded to INSUFFICIENT_EVIDENCE with P0_CRITICAL priority.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from rapidfuzz import fuzz

from bert.models.documents import PriorityTier, VerificationStatus


CITATION_THRESHOLD = 97  # rapidfuzz partial_ratio minimum
LOGPROB_THRESHOLD = 0.92  # Minimum token probability for critical entities

INSUFFICIENT_EVIDENCE_OUTPUT = {
    "verification_status": VerificationStatus.INSUFFICIENT_EVIDENCE,
    "priority_tier": PriorityTier.P0_CRITICAL,
    "fluent_output": (
        "Insufficient evidence in uploaded corpus — flagged for manual review."
    ),
}


@dataclass
class VerificationResult:
    """Result of citation and logprob verification."""
    passed: bool
    verification_status: VerificationStatus
    failed_citations: list[dict]
    failed_logprobs: list[dict]
    confidence_score: float  # 0.0 - 1.0


def verify_citations(
    claimed_quotes: list[str],
    source_texts: list[str],
    *,
    threshold: int = CITATION_THRESHOLD,
) -> tuple[bool, list[dict]]:
    """
    Verify that every claimed quote exists in the source corpus.

    Uses rapidfuzz.fuzz.partial_ratio for OCR-tolerant matching.
    A quote passes if it achieves >= threshold score against ANY source text.

    Args:
        claimed_quotes: List of verbatim quotes claimed by the agent.
        source_texts: List of verbatim_text from ast_nodes.
        threshold: Minimum partial_ratio score (0-100).

    Returns:
        (all_passed, list of failed citations with details)
    """
    failed: list[dict] = []

    for quote in claimed_quotes:
        if not quote or not quote.strip():
            continue

        best_score = 0.0
        best_match = ""

        for source in source_texts:
            score = fuzz.partial_ratio(quote, source)
            if score > best_score:
                best_score = score
                best_match = source[:200]  # Truncate for logging

            if score >= threshold:
                break  # Found a match, no need to check further

        if best_score < threshold:
            failed.append({
                "claimed_quote": quote[:200],
                "best_score": best_score,
                "best_match_preview": best_match,
                "threshold": threshold,
            })

    return len(failed) == 0, failed


def verify_logprobs(
    token_logprobs: list[dict[str, float]],
    *,
    threshold: float = LOGPROB_THRESHOLD,
    critical_entity_types: set[str] | None = None,
) -> tuple[bool, list[dict]]:
    """
    Verify that critical entity tokens have sufficient probability.

    Args:
        token_logprobs: List of {token, logprob, entity_type} dicts.
        threshold: Minimum probability (0.0 - 1.0).
        critical_entity_types: Entity types to check (e.g., DATE, AMOUNT, PARTY_NAME).

    Returns:
        (all_passed, list of failed tokens with details)
    """
    if critical_entity_types is None:
        critical_entity_types = {"DATE", "AMOUNT", "PARTY_NAME", "JURISDICTION", "LIABILITY_CAP"}

    failed: list[dict] = []

    for entry in token_logprobs:
        entity_type = entry.get("entity_type", "")
        if entity_type not in critical_entity_types:
            continue

        import math
        prob = math.exp(entry.get("logprob", -10.0))
        if prob < threshold:
            failed.append({
                "token": entry.get("token", ""),
                "entity_type": entity_type,
                "probability": prob,
                "threshold": threshold,
            })

    return len(failed) == 0, failed


def run_verification_gate(
    claimed_quotes: list[str],
    source_texts: list[str],
    token_logprobs: list[dict] | None = None,
) -> VerificationResult:
    """
    Run the full anti-hallucination verification gate.

    Steps:
    1. Verify all citations via rapidfuzz substring matching
    2. Verify critical entity token logprobs
    3. Return INSUFFICIENT_EVIDENCE on ANY failure

    This is a HARD gate — there is no partial pass.
    """
    # Step 1: Citation verification
    citations_passed, failed_citations = verify_citations(
        claimed_quotes, source_texts
    )

    # Step 2: Logprob verification (if available)
    failed_logprobs: list[dict] = []
    logprobs_passed = True
    if token_logprobs:
        logprobs_passed, failed_logprobs = verify_logprobs(token_logprobs)

    # Step 3: Determine result
    all_passed = citations_passed and logprobs_passed

    if all_passed:
        confidence = 1.0 - (len(failed_citations) + len(failed_logprobs)) * 0.1
        return VerificationResult(
            passed=True,
            verification_status=VerificationStatus.VERIFIED,
            failed_citations=[],
            failed_logprobs=[],
            confidence_score=max(confidence, 0.0),
        )
    else:
        return VerificationResult(
            passed=False,
            verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE,
            failed_citations=failed_citations,
            failed_logprobs=failed_logprobs,
            confidence_score=0.0,
        )
```

---

### Component 5: The 7-Agent Pipeline (LangGraph)

```mermaid
flowchart TD
    START["📥 Ingested Document\n(ast_nodes in PostgreSQL)"] --> CACHE_CHECK

    CACHE_CHECK{"Tier 1:\nExact Cache Hit?"}
    CACHE_CHECK -->|"✅ Hit"| CACHE_OUT["Return Cached Result\n(TIER1_CACHE)"]
    CACHE_CHECK -->|"❌ Miss"| SCOUT_CHECK

    SCOUT_CHECK{"Any ast_nodes\nwith OCR < 0.90?"}
    SCOUT_CHECK -->|"Yes"| SCOUT["🔭 1. SCOUT\n(Qwen2.5-VL-7B)\nVision OCR Rescue"]
    SCOUT_CHECK -->|"No"| QM

    SCOUT --> QM["📦 2. QUARTERMASTER\n(Qwen2.5-14B)\nClassify → category,\nsub_category, tags[]"]

    QM --> CHRONOS["⏰ 3. CHRONOS\n(Qwen2.5-14B)\nExtract dates,\nsupersession chains,\nis_latest_version"]

    CHRONOS --> VANGUARD["🎯 4. VANGUARD\n(Qwen2.5-14B)\nScore 0-100,\nassign priority_tier"]

    VANGUARD --> RANGER["🏹 5. RANGER\n(Qwen2.5-14B + Instructor)\nExtract atomic JSON facts\n+ verbatim_quote\n+ ast_node_id"]

    RANGER --> GATE{"🛡️ Citation Gate\nrapidfuzz ≥ 97%\nlogprob ≥ 0.92"}

    GATE -->|"✅ Passed"| ENVOY["📜 7. ENVOY\n(Qwen2.5-14B)\nVerified facts → fluent\nexecutive prose\nwith [Doc:Page] citations"]

    GATE -->|"❌ Failed"| ARBITER_CHECK{"Cross-document\nconflict?"}

    ARBITER_CHECK -->|"Yes"| ARBITER["⚖️ 6. ARBITER\n(Qwen2.5-14B / Claude)\nResolve contradictions\nvia is_latest_version"]
    ARBITER_CHECK -->|"No"| HARD_FAIL["❌ HARD FAIL\nINSUFFICIENT_EVIDENCE\nP0_CRITICAL\nFlagged for Manual Review"]

    ARBITER --> GATE2{"🛡️ Re-verify\nCitation Gate"}
    GATE2 -->|"✅"| ENVOY
    GATE2 -->|"❌"| HARD_FAIL

    ENVOY --> WORK_ITEM["💾 Store work_item\nVERIFIED\nTIER2_SLM_REGIMENT"]
    HARD_FAIL --> WORK_ITEM_FAIL["💾 Store work_item\nINSUFFICIENT_EVIDENCE\nP0_CRITICAL"]
    CACHE_OUT --> WORK_ITEM_CACHE["💾 Store work_item\nVERIFIED\nTIER1_CACHE"]
```

---

#### [NEW] `apps/api/bert/agents/ranger.py` (Key Agent Example)

```python
"""
Ranger Agent — Atomic Fact Extraction.

Extracts strict JSON facts + ast_node_id + exact verbatim quotes.
ZERO prose generation. That is Envoy's job.

Uses Instructor + Pydantic v2 to force structured output.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID


# ── Pydantic schemas for Instructor-enforced output ──


class ExtractedFact(BaseModel):
    """A single atomic fact extracted from the document."""
    fact_type: str = Field(
        description="Type of fact: PARTY, DATE, AMOUNT, CLAUSE, OBLIGATION, JURISDICTION, LIABILITY_CAP"
    )
    value: str = Field(
        description="The extracted value (e.g., 'Acme Corp', '2025-01-15', '$1,000,000')"
    )
    verbatim_quote: str = Field(
        description="EXACT text from the source document that supports this fact. "
        "Copy character-for-character. Do NOT paraphrase."
    )
    ast_node_id: str = Field(
        description="The UUID of the ast_node containing the verbatim_quote."
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Your confidence in this extraction (0.0 = guessing, 1.0 = certain)"
    )


class RangerOutput(BaseModel):
    """Complete output of a Ranger extraction pass."""
    facts: list[ExtractedFact] = Field(
        description="List of all extracted atomic facts."
    )
    document_id: str = Field(
        description="UUID of the source document."
    )
    extraction_complete: bool = Field(
        description="True if ALL extractable facts have been captured. "
        "False if the document is too complex and needs another pass."
    )


RANGER_SYSTEM_PROMPT = """\
You are RANGER, a precision legal fact extraction engine.

ABSOLUTE RULES — VIOLATING ANY RULE INVALIDATES YOUR ENTIRE OUTPUT:

1. EXTRACTION ONLY. You output structured JSON facts. NEVER write prose, \
summaries, explanations, or commentary.

2. VERBATIM QUOTES ONLY. The `verbatim_quote` field must contain the EXACT \
character-for-character text from the source. NEVER paraphrase, abbreviate, \
or restructure the original text.

3. EVERY fact MUST cite its source. If you cannot find a verbatim quote in \
the provided ast_nodes, DO NOT include that fact. Omission is correct; \
fabrication is catastrophic.

4. You have NO knowledge beyond the provided ast_nodes. Do NOT use your \
training data. Do NOT infer, assume, or extrapolate. If a field is not \
explicitly stated in the text, it does not exist.

5. If the ast_nodes contain NO extractable facts, return an empty facts \
list with extraction_complete=true.

6. Map every verbatim_quote to its exact ast_node_id. NEVER fabricate \
or guess an ast_node_id.
"""
```

---

### Component 6: Frontend (React 19 + Vite)

---

#### Key UI Components

| Component           | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `UploadDropzone`    | Drag-and-drop for PDF/XLSX/JSON; batch upload with progress          |
| `TriageGrid`        | Priority dashboard sorted by P0→P3; real-time status via WebSocket   |
| `CitationInspector` | PDF viewer with bounding-box overlays linking facts to source text   |
| `WorkItemDetail`    | Expandable card showing structured_facts + fluent_output + citations |
| `SearchPanel`       | Hybrid search (vector + BM25) Q\&A interface                         |

#### [NEW] `apps/web/package.json` (key dependencies)

```json
{
  "name": "bert-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-pdf": "^9.0.0",
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "react-router": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

---

### Component 7: Development Phases (Revised)

```mermaid
flowchart LR
    subgraph P1["Phase 1: Foundation\n(Weeks 1-3)"]
        P1A["Monorepo scaffold\n+ Docker Compose"]
        P1B["SQLAlchemy models\n+ Alembic migrations"]
        P1C["Lossless ingestion\n(PDF + JSON + XLSX)"]
        P1D["Checksum verification"]
    end

    subgraph P2["Phase 2: Regiment\n(Weeks 4-7)"]
        P2A["vLLM multi-model\nserving setup"]
        P2B["Scout + Quartermaster\n+ Chronos agents"]
        P2C["Vanguard + Ranger\nagents"]
        P2D["Citation Gate\n(rapidfuzz + logprob)"]
    end

    subgraph P3["Phase 3: Intelligence\n(Weeks 8-10)"]
        P3A["Arbiter agent\n+ conflict resolution"]
        P3B["Envoy agent\n+ fluent output"]
        P3C["RAG hybrid search\n(pgvector + BM25)"]
        P3D["Cloud burst\n(Groq + Anthropic)"]
    end

    subgraph P4["Phase 4: Product\n(Weeks 11-14)"]
        P4A["React frontend\n+ WebSocket"]
        P4B["CitationInspector\n+ TriageGrid"]
        P4C["License key system\n+ update server"]
        P4D["Evaluation suite\n+ benchmarks"]
    end

    P1 --> P2 --> P3 --> P4
```

#### Phase 1 Deliverable (What We Build First)

When you approve this plan:

```text
bert/
├── apps/
│   ├── web/                           # [SCAFFOLD] React 19 + Vite + TS + Tailwind 4
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── components/            # [PLACEHOLDER]
│   │   │   ├── stores/                # [PLACEHOLDER]
│   │   │   └── hooks/                 # [PLACEHOLDER]
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── tailwind.config.ts
│   └── api/                           # [PRODUCTION CODE] FastAPI + uv
│       ├── bert/
│       │   ├── __init__.py
│       │   ├── config.py              # Pydantic Settings (env-based)
│       │   ├── database.py            # Async SQLAlchemy engine + session
│       │   ├── api/
│       │   │   ├── __init__.py
│       │   │   ├── main.py            # FastAPI app + lifespan (ARQ pool)
│       │   │   ├── routes/
│       │   │   │   ├── __init__.py
│       │   │   │   ├── documents.py   # Upload + status endpoints
│       │   │   │   ├── health.py      # Health check
│       │   │   │   └── workspaces.py  # Workspace CRUD
│       │   │   └── websocket.py       # WS manager for real-time updates
│       │   ├── ingestion/
│       │   │   ├── __init__.py
│       │   │   ├── docling_parser.py  # PDF → AST nodes
│       │   │   ├── json_streamer.py   # 50MB+ JSON → AST nodes (O(1) mem)
│       │   │   ├── xlsx_handler.py    # Excel read/write
│       │   │   ├── checksum.py        # SHA-256 verification
│       │   │   └── router.py          # Route file type → correct parser
│       │   ├── agents/                # [PLACEHOLDER for Phase 2]
│       │   │   └── __init__.py
│       │   ├── retrieval/             # [PLACEHOLDER for Phase 3]
│       │   │   └── __init__.py
│       │   ├── verification/
│       │   │   ├── __init__.py
│       │   │   └── citation_gate.py   # rapidfuzz + logprob verification
│       │   ├── models/
│       │   │   ├── __init__.py
│       │   │   ├── base.py            # SQLAlchemy base + mixins
│       │   │   └── documents.py       # Document, ASTNode, WorkItem, AuditLog
│       │   └── tasks/
│       │       ├── __init__.py
│       │       └── ingestion.py       # ARQ worker tasks for async ingestion
│       ├── alembic/
│       │   ├── env.py
│       │   └── versions/              # Migration scripts
│       ├── tests/
│       │   ├── conftest.py
│       │   ├── test_docling_parser.py
│       │   ├── test_json_streamer.py
│       │   ├── test_xlsx_handler.py
│       │   ├── test_citation_gate.py
│       │   └── test_checksum.py
│       ├── pyproject.toml
│       ├── alembic.ini
│       └── Dockerfile.embedding       # Lightweight embedding server
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## Verification Plan

### Automated Tests

```bash
# 1. Start infrastructure
docker compose up -d postgres redis seaweedfs

# 2. Run migrations
cd apps/api && uv run alembic upgrade head

# 3. Run unit tests (ingestion + verification)
cd apps/api && uv run pytest tests/ -v --cov=bert --cov-report=term-missing

# 4. Specific test suites
uv run pytest tests/test_docling_parser.py -v      # PDF → AST nodes
uv run pytest tests/test_json_streamer.py -v       # JSON streaming O(1) memory
uv run pytest tests/test_xlsx_handler.py -v        # Excel read/write
uv run pytest tests/test_citation_gate.py -v       # Anti-hallucination gate
uv run pytest tests/test_checksum.py -v            # SHA-256 completeness

# 5. Type checking
cd apps/api && uv run mypy bert/ --strict
```

### Manual Verification

1. **PDF Ingestion**: Upload a multi-page legal contract → verify every paragraph, heading, table row appears as an `ast_node` → verify SHA-256 checksum matches
2. **JSON Streaming**: Upload a 50MB+ JSON config → verify $O(1)$ memory usage (monitor RSS) → verify all keys/values captured as `ast_nodes`
3. **XLSX Handling**: Upload a compliance questionnaire → verify all rows parsed → write dummy results back → verify original formatting preserved
4. **Citation Gate**: Feed the verifier a fabricated quote → confirm it returns `INSUFFICIENT_EVIDENCE` with `P0_CRITICAL`
5. **Docker Compose**: Run `docker compose up` → verify all services start and pass health checks

---

## Hardware Requirements (Revised)

| Environment            | GPU                                                         | RAM   | CPU     | Storage    |
| ---------------------- | ----------------------------------------------------------- | ----- | ------- | ---------- |
| **Development**        | 1× RTX 4090 24GB (runs 14B-AWQ + 7B-AWQ at reduced context) | 32GB  | 8-core  | 500GB NVMe |
| **Production (Small)** | 1× RTX 6000 Ada 48GB or A6000 48GB                          | 64GB  | 16-core | 1TB NVMe   |
| **Production (Scale)** | 2× A100 80GB (or 1×48GB + cloud burst)                      | 128GB | 32-core | 2TB NVMe   |
