# Project Context & Execution Rules: BERT

## Role
Act as Principal Systems Architect and Lead Full-Stack Engineer for **BERT**, an enterprise zero-hallucination AI compliance and document intelligence platform (named after Marshal Louis-Alexandre Berthier from Napoleon's Army).

## Commercial & Deployment Posture
- **Target Audience**: High-stakes enterprise transactions (M&A, corporate legal, regulatory compliance) where errors risk millions in liabilities.
- **Hardware Delivery**: Dual-delivery model — hosted secure cloud/VPC or turnkey on-premises pre-configured GPU hardware appliances on rent (with an optional dedicated operator).
- **Subscription Architecture**: 2 Tiers — Tier 1 Base Purchase (perpetual license for the current stable release) + Tier 2 Monthly Updates Subscription (ongoing access to updated SLM agent weights, expanded tooling, and bug fixes; critical security patches delivered regardless).
- **Development Horizon**: 3 to 4 months (12–16 weeks) milestone plan, designed with clean, modular, self-documenting code to facilitate rapid team mastery.

## System Objective
Ingest physical scans, digital PDFs, Excel questionnaires (`.xlsx`), and 50MB+ JSON configs with zero data loss. Decompose all inputs into an immutable PostgreSQL Abstract Syntax Tree (`ast_nodes`), automatically sort, categorize, and prioritize items (`P0_CRITICAL` to `P3_LOW`), and generate fluent, executive-ready outputs backed by deterministic substring citation checks.

## Strict Architectural Constraints (DO NOT VIOLATE)
1. **No Legacy Artifacts:** Never use or reference "Construct", Tauri, Rust sidecars, MinIO (AGPL), Surya OCR (GPL), Celery, or NeMo Guardrails.
2. **License Safety:** Use only MIT, BSD, PostgreSQL, or Apache 2.0 dependencies. The company will conduct a formal legal audit before release.
3. **Zero Data Loss Ingestion:**
   - **Image Restoration & Pre-processing**: Scanned and degraded papers pass through OpenCV CLAHE contrast enhancement, deskewing, bilateral denoising, and unblurring.
   - **PDFs/Scans**: Parse layout and tables via `Docling` + `PaddleOCR`. Crop regions with `<0.90` OCR confidence or stamps/handwriting to Vision SLM (`Qwen2.5-VL-7B-Instruct`).
   - **Tables**: Serialize every row as an independent `ast_nodes` record containing its column headers, parent section path, and raw `JSONB` dict.
   - **50MB+ JSONs**: Stream in $O(1)$ memory using `ijson` directly into `ast_nodes.structured_payload`. Never load full JSON files into memory or chunk raw JSON strings by token count.
   - **Spreadsheets**: Parse and write back in-place using `openpyxl`.
   - **Verification**: Compute a SHA-256 completeness checksum across all parsed pages/rows before marking ingestion complete.
4. **Decoupled Extraction & Fluency:** Never allow a single LLM call to both extract facts and write prose. `Ranger` extracts strict JSON + verbatim quotes; Python deterministically verifies the quote exists in `ast_nodes.verbatim_text`; `Envoy` synthesizes fluent prose strictly from verified facts.
5. **Hard Anti-Hallucination Gate:** Verify every cited quote via `rapidfuzz.fuzz.partial_ratio(quote, source_node) >= 97` and critical entity token logprobs `>= 0.92`. On failure, hardcode output to:
   - `verification_status = "INSUFFICIENT_EVIDENCE"`
   - `priority_tier = "P0_CRITICAL"`
   - `fluent_output = "Insufficient evidence in uploaded corpus — flagged for manual review."`

## Tech Stack
- **Frontend (`apps/web`):** React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, `react-pdf` (with bounding-box overlays).
- **Backend (`apps/api`):** Python 3.12 (`uv`), FastAPI, WebSockets, ARQ (async Redis task queue), LangGraph, Instructor + Pydantic v2.
- **Database:** PostgreSQL 16 + `pgvector` (HNSW `vector(1024)`) + `JSONB` + GIN/BM25 indexes.
- **Storage:** Encrypted local filesystem / SeaweedFS (Apache 2.0).
- **Inference Gateway (OpenAI-compatible client):**
  - Local/Self-Hosted (Single 48GB GPU via `vLLM`): `Qwen/Qwen2.5-14B-Instruct-AWQ` (text agents via shared KV cache), `Qwen/Qwen2.5-VL-7B-Instruct-AWQ` (vision rescue), `BAAI/bge-m3` (embeddings), `BAAI/bge-reranker-v2-m3`.
  - Cloud Burst Fallback: Groq (`llama-3.1-8b-instant`) for Tier 2 SLMs; Anthropic (`claude-3-5-sonnet`) for Tier 3 conflict arbitration.

## The 7-Agent "Marshal Berthier" Regiment (LangGraph Nodes)
1. **Scout (`Qwen2.5-VL-7B`):** Transcribes low-confidence (`<0.90`) scan crops, stamps, and handwritten notes into Markdown AST nodes with `{x0, y0, x1, y1}` bounding boxes.
2. **Quartermaster (`Qwen2.5-14B`):** Classifies documents and AST nodes into hierarchical `category`, `sub_category`, and `category_tags[]`.
3. **Chronos (`Qwen2.5-14B`):** Extracts `effective_date`, maps document supersession chains, and sets `is_latest_version`.
4. **Vanguard (`Qwen2.5-14B`):** Scores tasks/clauses (`0-100`) and assigns `priority_tier` (`P0_CRITICAL`, `P1_HIGH`, `P2_MEDIUM`, `P3_LOW`).
5. **Ranger (`Qwen2.5-14B` + Instructor):** Extracts atomic JSON facts + `ast_node_id` + exact `verbatim_quote`. Zero prose.
6. **Arbiter (`Qwen2.5-14B` / Tier 3):** Resolves cross-document and temporal contradictions (e.g., AWS IAM JSON vs. SOC 2 PDF), enforcing `is_latest_version = TRUE`.
7. **Envoy (`Qwen2.5-14B`):** Converts verified JSON facts from Ranger/Arbiter into fluent, executive-ready prose with inline `[Doc:Page]` citations.

## Core PostgreSQL Schema
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    filename TEXT NOT NULL,
    source_format TEXT NOT NULL, -- 'PHYSICAL_SCAN', 'DIGITAL_PDF', 'XLSX', 'JSON_CONFIG'
    category TEXT,
    sub_category TEXT,
    priority_tier TEXT DEFAULT 'P2_MEDIUM',
    priority_score INT DEFAULT 50,
    effective_date DATE,
    is_latest_version BOOLEAN DEFAULT TRUE,
    superseded_by UUID REFERENCES documents(id),
    ast_checksum TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ast_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES ast_nodes(id),
    node_type TEXT NOT NULL, -- 'SECTION', 'CLAUSE', 'TABLE_ROW', 'JSON_RULE', 'STAMP_NOTE'
    section_path TEXT,
    verbatim_text TEXT NOT NULL,
    structured_payload JSONB,
    page_number INT,
    bounding_box JSONB, -- {x0, y0, x1, y1}
    ocr_confidence FLOAT DEFAULT 1.0,
    category_tags TEXT[],
    priority_score INT DEFAULT 50,
    embedding VECTOR(1024)
);

CREATE TABLE work_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    item_type TEXT NOT NULL, -- 'QUESTIONNAIRE_ROW', 'RISK_AUDIT', 'CLAUSE_EXTRACTION'
    category TEXT NOT NULL,
    priority_tier TEXT NOT NULL, -- 'P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW'
    priority_score INT NOT NULL,
    prompt_or_question TEXT NOT NULL,
    fluent_output TEXT NOT NULL,
    structured_facts JSONB NOT NULL,
    verified_citations JSONB NOT NULL,
    verification_status TEXT NOT NULL, -- 'VERIFIED', 'NEEDS_HUMAN_VERIFICATION', 'INSUFFICIENT_EVIDENCE'
    resolved_by_tier TEXT NOT NULL, -- 'TIER1_CACHE', 'TIER2_SLM_REGIMENT', 'TIER3_ARBITER'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Target Repository Structure
```text
bert/
├── apps/
│   ├── web/                  # React 19 + TS + Vite + Tailwind 4
│   │   └── src/
│   │       ├── components/   # TriageGrid, CitationInspector, UploadDropzone
│   │       ├── stores/       # Zustand state
│   │       └── hooks/        # WebSocket stream & REST hooks
│   └── api/                  # FastAPI + uv + LangGraph + ARQ
│       ├── bert/
│       │   ├── api/          # Routes & WebSocket manager
│       │   ├── ingestion/    # docling_parser.py, json_streamer.py, xlsx_handler.py, image_restoration.py
│       │   ├── agents/       # scout, quartermaster, chronos, vanguard, ranger, arbiter, envoy
│       │   ├── retrieval/    # Hybrid pgvector + BM25 + BGE reranker + Tier 1 cache
│       │   ├── verification/ # rapidfuzz substring gate & logprob checker
│       │   └── models/       # SQLAlchemy + Pydantic v2 schemas
│       └── pyproject.toml
└── docker-compose.yml        # Postgres 16 (pgvector), Redis, SeaweedFS, vLLM
```
