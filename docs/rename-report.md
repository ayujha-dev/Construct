# ShieldStaff Rebrand Discovery & Migration Report (Part A)

## 1. Executive Summary

This report catalogs all occurrences of legacy naming (`BERT`, `Berthier`, `Marshal`, `Louis-Alexandre`, `Regiment`, `Zero Hallucination Engine`) across the repository prior to migration.

- **Total Occurrences Identified**: 505
- **Total Files Impacted**: 164
- **Display Name**: ShieldStaff
- **Code/Slug**: shieldstaff
- **Env/Constant**: SHIELDSTAFF

## 2. Permitted Backward-Compatible Invariants & Aliases

1. **Database Enum Invariant**: `ResolvedByTier.TIER2_SLM_REGIMENT` is an immutable database/API schema value used across backend verification queries and test contracts (`Do NOT edit verification, hashing, scoring, pipeline, triage or export logic`). It is retained with aliasing where appropriate.
2. **Storage Key Fallback**: `shieldstaff-theme` and `shieldstaff-workspace` take precedence. If unset, legacy `bert-theme` and `bert-workspace` are read, and values are written to the new keys.
3. **Environment Variable Fallback**: `SHIELDSTAFF_*` variables take precedence. If unset, legacy `BERT_*` variables are accepted with a deprecation warning log.
4. **Database File Fallback**: Database connection defaults to `sqlite+aiosqlite:///./shieldstaff.db`. However, if `bert.db` exists and `shieldstaff.db` does not, it connects to `bert.db` so existing data is never orphaned.

## 3. Discovery Table

| File | Line | Matched Term | Category | Planned Action | Context Snippet |
| --- | --- | --- | --- | --- | --- |
| `.env.example` | 3 | `bert` | Env & Persistence Defaults | Accept SHIELDSTAFF_*, fall back to BERT_* with warning; default shieldstaff.db | `DATABASE_URL=sqlite+aiosqlite:///./bert.db` |
| `BERT.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# Project Context & Execution Rules: BERT` |
| `BERT.md` | 4 | `bert, berthier, louis-alexandre, marshal` | Historical Reference Removal | Remove Marshal Berthier wording entirely | `Act as Principal Systems Architect and Lead Full-Stack Engineer for **BERT**, an enterprise zero-hallucination AI compli` |
| `BERT.md` | 40 | `berthier, marshal, regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `## The 7-Agent "Marshal Berthier" Regiment (LangGraph Nodes)` |
| `BERT.md` | 103 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `bert/` |
| `BERT.md` | 111 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `│       ├── bert/` |
| `MUST_KNOW.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# BERT must-know operations` |
| `MUST_KNOW.md` | 8 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `uvicorn bert.main:app --reload --port 8000` |
| `MUST_KNOW.md` | 45 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `## Processing Contract & 7-Agent Regiment` |
| `README.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# BERT — Zero-Hallucination Document Intelligence Platform` |
| `README.md` | 3 | `bert, berthier, marshal, regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `BERT is an evidence-first document intelligence platform and conversational copilot for security, compliance, and high-s` |
| `README.md` | 9 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `BERT's frontend has been completely redesigned from the ground up to match the daylight-first editorial and precision Sa` |
| `README.md` | 20 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `WeTransferIconRail`: Narrow 64px white icon rail with BERT monogram and minimal navigation icons (`Upload`, `Copilot`` |
| `README.md` | 44 | `berthier, marshal, regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `## 7-Agent "Marshal Berthier" Regiment` |
| `README.md` | 67 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `uvicorn bert.main:app --reload --port 8000` |
| `bert-architecture-plan.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# BERT — Agentic Zero-Hallucination Document Intelligence Platform` |
| `bert-architecture-plan.md` | 5 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `Design and build **BERT**, an enterprise AI compliance and document intelligence platform that ingests physical scans, d` |
| `bert-architecture-plan.md` | 7 | `berthier, marshal, regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `The system uses a **7-agent "Marshal Berthier" regiment** orchestrated via LangGraph, powered by the Qwen model family r` |
| `bert-architecture-plan.md` | 11 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| Dimension          \| Old (Construct)        \| New (BERT)                                                  \|` |
| `bert-architecture-plan.md` | 23 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `\| Agents             \| 4 generic agents       \| **7 named regiment** (Scout→Envoy)                          \|` |
| `bert-architecture-plan.md` | 31 | `bert, berthier, louis-alexandre, marshal` | Historical Reference Removal | Remove Marshal Berthier wording entirely | `> **Product Identity**: Confirmed name is **BERT** (inspired by Marshal Louis-Alexandre Berthier, Napoleon's Chief of St` |
| `bert-architecture-plan.md` | 95 | `berthier, marshal, regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `subgraph REGIMENT["🎖️ Marshal Berthier Regiment (LangGraph)"]` |
| `bert-architecture-plan.md` | 134 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `QUEUE --> REGIMENT` |
| `bert-architecture-plan.md` | 135 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `REGIMENT --> VERIFY` |
| `bert-architecture-plan.md` | 138 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `REGIMENT --> INFERENCE` |
| `bert-architecture-plan.md` | 139 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `REGIMENT -->\|"Overflow"\| CLOUD` |
| `bert-architecture-plan.md` | 145 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `style REGIMENT fill:#991b1b,stroke:#ef4444,color:#fff` |
| `bert-architecture-plan.md` | 160 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `bert/docker-compose.yml`` |
| `bert-architecture-plan.md` | 171 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `container_name: bert-postgres` |
| `bert-architecture-plan.md` | 174 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `POSTGRES_DB: bert` |
| `bert-architecture-plan.md` | 175 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `POSTGRES_USER: bert` |
| `bert-architecture-plan.md` | 182 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `test: ["CMD-SHELL", "pg_isready -U bert"]` |
| `bert-architecture-plan.md` | 190 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `container_name: bert-redis` |
| `bert-architecture-plan.md` | 211 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `container_name: bert-seaweedfs` |
| `bert-architecture-plan.md` | 224 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `container_name: bert-vllm-text` |
| `bert-architecture-plan.md` | 249 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `container_name: bert-vllm-vision` |
| `bert-architecture-plan.md` | 278 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `container_name: bert-embedding` |
| `bert-architecture-plan.md` | 315 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `bert/.env.example`` |
| `bert-architecture-plan.md` | 320 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `DATABASE_URL=postgresql+asyncpg://bert:bert_dev_secret@localhost:5432/bert` |
| `bert-architecture-plan.md` | 328 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `SEAWEEDFS_ACCESS_KEY=bert` |
| `bert-architecture-plan.md` | 330 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `SEAWEEDFS_BUCKET=bert-documents` |
| `bert-architecture-plan.md` | 342 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `LICENSE_SERVER_URL=https://license.bert.ai/v1` |
| `bert-architecture-plan.md` | 351 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `apps/api/bert/models/base.py`` |
| `bert-architecture-plan.md` | 392 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `apps/api/bert/models/documents.py`` |
| `bert-architecture-plan.md` | 395 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"""Document and AST node models — the core of BERT's data layer."""` |
| `bert-architecture-plan.md` | 646 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `apps/api/bert/ingestion/docling_parser.py`` |
| `bert-architecture-plan.md` | 675 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import ASTNode, NodeType` |
| `bert-architecture-plan.md` | 828 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"""Map Docling document element labels to BERT NodeType."""` |
| `bert-architecture-plan.md` | 859 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `apps/api/bert/ingestion/json_streamer.py`` |
| `bert-architecture-plan.md` | 885 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import NodeType` |
| `bert-architecture-plan.md` | 886 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.docling_parser import ParsedNode, IngestionResult` |
| `bert-architecture-plan.md` | 1005 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `#### [NEW] `apps/api/bert/ingestion/xlsx_handler.py`` |
| `bert-architecture-plan.md` | 1033 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import NodeType` |
| `bert-architecture-plan.md` | 1034 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.docling_parser import ParsedNode, IngestionResult` |
| `bert-architecture-plan.md` | 1172 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `apps/api/bert/ingestion/checksum.py`` |
| `bert-architecture-plan.md` | 1192 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import ASTNode, Document` |
| `bert-architecture-plan.md` | 1239 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `apps/api/bert/verification/citation_gate.py`` |
| `bert-architecture-plan.md` | 1261 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import PriorityTier, VerificationStatus` |
| `bert-architecture-plan.md` | 1425 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `### Component 5: The 7-Agent Regiment (LangGraph)` |
| `bert-architecture-plan.md` | 1467 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `#### [NEW] `apps/api/bert/agents/ranger.py` (Key Agent Example)` |
| `bert-architecture-plan.md` | 1571 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"name": "bert-web",` |
| `bert-architecture-plan.md` | 1615 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `subgraph P2["Phase 2: Regiment\n(Weeks 4-7)"]` |
| `bert-architecture-plan.md` | 1644 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `bert/` |
| `bert-architecture-plan.md` | 1658 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `│       ├── bert/` |
| `bert-architecture-plan.md` | 1725 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `cd apps/api && uv run pytest tests/ -v --cov=bert --cov-report=term-missing` |
| `bert-architecture-plan.md` | 1735 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `cd apps/api && uv run mypy bert/ --strict` |
| `docker-compose.yml` | 5 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `POSTGRES_DB: bert` |
| `docker-compose.yml` | 6 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `POSTGRES_USER: bert` |
| `docker-compose.yml` | 11 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `test: ["CMD-SHELL", "pg_isready -U bert -d bert"]` |
| `tests/test_phase7_e2e.js` | 41 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bert-phase7-upload-"));` |
| `tests/test_phase8_e2e.js` | 13 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `* 3. Theme toggle UI controls (pill, rail, sidebar), localStorage["bert-theme"]` |
| `tests/test_phase8_e2e.js` | 110 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `["-m", "uvicorn", "bert.main:app", "--host", "127.0.0.1", "--port", String(API_PORT)],` |
| `tests/test_phase8_e2e.js` | 435 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `localStorage.removeItem("bert-theme");` |
| `tests/test_phase8_e2e.js` | 443 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `stored: localStorage.getItem("bert-theme"),` |
| `tests/test_phase8_e2e.js` | 480 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `stored: localStorage.getItem("bert-theme"),` |
| `tests/test_phase8_e2e.js` | 484 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `assertEqual(afterToggle.stored, "dark", "Persists 'dark' in localStorage['bert-theme']");` |
| `tests/test_phase8_e2e.js` | 492 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `stored: localStorage.getItem("bert-theme"),` |
| `tests/e2e/package.json` | 2 | `bert` | Package Metadata | Update package name to shieldstaff-web / shieldstaff | `"name": "bert-e2e-tests",` |
| `tests/e2e/runner.js` | 51 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `console.log("           BERT Document Intelligence Platform — E2E Test Runner                ");` |
| `tests/e2e/lib/cdp.js` | 281 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bert-e2e-chrome-"));` |
| `.agents/teamwork/ORIGINAL_REQUEST.md` | 5 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Implement the architectural, accessibility, and multi-format evidence improvements for the BERT Document Intelligence Pl` |
| `.agents/teamwork/ORIGINAL_REQUEST.md` | 18 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Refactor state management in `useBertStore.ts` by decomposing the monolithic store into focused domain slices (documents` |
| `.agents/teamwork/victory_auditor/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Independently audit and verify the victory claim for the Bert prototype analysis and MVP roadmap deliverable against ORI` |
| `.agents/teamwork/victory_auditor/handoff.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# Independent Victory Audit Report: BERT Prototype Analysis & MVP Roadmap` |
| `.agents/teamwork/victory_auditor/handoff.md` | 106 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py:158` vs `CopilotStream.tsx:364, 377`: Verified FastAPI schema rejects `"approve"` and `"` |
| `.agents/teamwork/teamwork_explorer_m1_3/BRIEFING.md` | 25 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py` (EscalationActionRequest schema contract)` |
| `.agents/teamwork/teamwork_explorer_m1_3/BRIEFING.md` | 26 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/main.py` (resolve_escalation route handler & backend action handling)` |
| `.agents/teamwork/teamwork_explorer_m1_3/DISPATCH.md` | 8 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Inspect `apps/api/bert/api/schemas.py` and `EscalationActionRequest`.` |
| `.agents/teamwork/teamwork_explorer_m1_3/DISPATCH.md` | 10 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Check how `/api/v1/escalations/{id}/action` in `apps/api/bert/api/routes.py` handles these actions and ensure no 422 e` |
| `.agents/teamwork/teamwork_explorer_m1_3/DISPATCH.md` | 27 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are Explorer 3 for Milestone 1 of the BERT Document Intelligence Platform MVP.` |
| `.agents/teamwork/teamwork_explorer_m1_3/DISPATCH.md` | 36 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `1. Escalation Schema Contract Fix: Inspect `apps/api/bert/api/schemas.py` and `EscalationActionRequest`. Update action L` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 16 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `1. **Schema Definition in `apps/api/bert/api/schemas.py:158-161`**:` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 63 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `4. **Backend Route Handler in `apps/api/bert/main.py:442-479`**:` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 64 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `*(Note: The dispatch mentioned `apps/api/bert/api/routes.py`, but all FastAPI endpoints are in `apps/api/bert/main.py`, ` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 130 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `2. **Data Model in `apps/web/src/types/bert.ts:83-90`**:` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 190 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Exclusive write files: `apps/web/src/store/*`, `apps/web/src/App.tsx`, `apps/web/src/components/copilot/RightInspector` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 216 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Updating `EscalationActionRequest` in `apps/api/bert/api/schemas.py` to:` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 228 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `In `apps/api/bert/main.py:448-464`, adding explicit handling for `"approve"` and `"counsel"` ensures the `WorkItem` tran` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 293 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `The dispatch refers to `apps/api/bert/api/routes.py`, which does not exist in this repository. All route handling is in ` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 294 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `2. **Write Ownership on `apps/api/bert/main.py`**:` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 295 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | ``SCOPE.md` specifically lists `apps/api/bert/api/schemas.py` under write ownership, but does not list `apps/api/bert/mai` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 305 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- In `apps/api/bert/api/schemas.py`, update `EscalationActionRequest`:` |
| `.agents/teamwork/teamwork_explorer_m1_3/handoff.md` | 313 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- In `apps/api/bert/main.py:448-464`, add explicit branches for `request.action == "approve"` and `request.action == "co` |
| `.agents/teamwork/teamwork_explorer_m1_2/BRIEFING.md` | 29 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/web/src/types/bert.ts` (`ASTNode`, `Citation`, `CitationMatch`, `WorkItem`)` |
| `.agents/teamwork/teamwork_explorer_m1_2/BRIEFING.md` | 30 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/ingestion/docling_parser.py` (PDF coordinate origin and line bounding box formulas)` |
| `.agents/teamwork/teamwork_explorer_m1_2/DISPATCH.md` | 26 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are Explorer 2 for Milestone 1 of the BERT Document Intelligence Platform MVP.` |
| `.agents/teamwork/teamwork_explorer_m1_2/handoff.md` | 75 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- In `apps/api/bert/ingestion/docling_parser.py`:` |
| `.agents/teamwork/teamwork_explorer_m1_2/handoff.md` | 209 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `2. **Type Definition in `types/bert.ts`**:` |
| `.agents/teamwork/teamwork_explorer_m1_2/handoff.md` | 210 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `Citation` interface in `apps/web/src/types/bert.ts` currently lacks `bounding_box`. Adding `bounding_box?: { x0: numb` |
| `.agents/teamwork/teamwork_reviewer_m1_2/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Independently review architectural soundness, robustness under reactive updates, bounding box coordinate math, Pydantic ` |
| `.agents/teamwork/teamwork_reviewer_m1_2/BRIEFING.md` | 26 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Files to review**: `apps/web/src/store/*`, `apps/web/src/App.tsx`, `apps/web/src/components/*`, `apps/api/bert/api/s` |
| `.agents/teamwork/teamwork_reviewer_m1_2/DISPATCH.md` | 26 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are Reviewer 2 for Milestone 1 of the BERT Document Intelligence Platform MVP.` |
| `.agents/teamwork/teamwork_reviewer_m1_2/handoff.md` | 56 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Inspected File**: `apps/api/bert/api/schemas.py` (Lines 158–163):` |
| `.agents/teamwork/teamwork_reviewer_m1_2/handoff.md` | 131 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- In `apps/api/bert/main.py:460-463`, actions other than `manual_correction` and `retry` fall into a generic `else:` bra` |
| `.agents/teamwork/teamwork_reviewer_m1_2/handoff.md` | 176 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.api.schemas import EscalationActionRequest` |
| `.agents/teamwork/sub_orch_m1/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Orchestrate Milestone 1 (Core Architecture & State Unification) for BERT Document Intelligence Platform MVP.` |
| `.agents/teamwork/sub_orch_m1/DISPATCH.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are the Milestone 1 Sub-Orchestrator for the BERT Document Intelligence Platform.` |
| `.agents/teamwork/sub_orch_m1/DISPATCH.md` | 22 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `5. Fix Backend Contract Violation: Update `apps/api/bert/api/schemas.py` `EscalationActionRequest` to accept `Literal["m` |
| `.agents/teamwork/sub_orch_m1/DISPATCH.md` | 33 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py`` |
| `.agents/teamwork/sub_orch_m1/SCOPE.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Target: BERT Document Intelligence Platform MVP` |
| `.agents/teamwork/sub_orch_m1/SCOPE.md` | 10 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Backend escalation contract schema (`apps/api/bert/api/schemas.py`)` |
| `.agents/teamwork/sub_orch_m1/SCOPE.md` | 20 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| 5 \| Escalation Schema Fix \| Update `apps/api/bert/api/schemas.py` `EscalationActionRequest` to accept `Literal["manual` |
| `.agents/teamwork/sub_orch_m1/handoff.md` | 49 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Updated `EscalationActionRequest` in `apps/api/bert/api/schemas.py` to `Literal["manual_correction", "retry", "skip", ` |
| `.agents/teamwork/teamwork_challenger_m1_2/BRIEFING.md` | 26 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py` (`EscalationActionRequest`)` |
| `.agents/teamwork/teamwork_challenger_m1_2/BRIEFING.md` | 27 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/main.py` (`resolve_escalation`)` |
| `.agents/teamwork/teamwork_challenger_m1_2/DISPATCH.md` | 21 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are Challenger 2 for Milestone 1 of the BERT Document Intelligence Platform MVP.` |
| `.agents/teamwork/teamwork_challenger_m1_2/handoff.md` | 14 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **File Checked**: `apps/api/bert/api/schemas.py:158-163`` |
| `.agents/teamwork/teamwork_challenger_m1_2/handoff.md` | 22 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **File Checked**: `apps/api/bert/main.py:442-479` (`POST /api/v1/escalations/{work_item_id}/resolve`)` |
| `.agents/teamwork/teamwork_challenger_m1_2/handoff.md` | 92 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- The contract requirement was to support `approve` and `counsel` on `EscalationActionRequest` in `apps/api/bert/api/sch` |
| `.agents/teamwork/e2e_orch/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Design and implement a comprehensive, requirement-driven, opaque-box E2E test suite and automated test runner for the BE` |
| `.agents/teamwork/e2e_orch/DISPATCH.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are the E2E Testing Orchestrator for the BERT Document Intelligence Platform.` |
| `.agents/teamwork/e2e_orch/TEST_INFRA.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# BERT Document Intelligence Platform — E2E Test Infrastructure & Specification Catalog` |
| `.agents/teamwork/e2e_orch/TEST_INFRA.md` | 17 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `This document establishes the production-grade, opaque-box End-to-End (E2E) testing infrastructure and test case catalog` |
| `.agents/teamwork/e2e_orch/TEST_INFRA.md` | 71 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `1. **Isolated Temp Directory**: Spawns Chrome with `--user-data-dir=/tmp/bert-e2e-XXXXXX`.` |
| `.agents/teamwork/teamwork_auditor_m1_1/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Perform strict forensic integrity audit on Milestone 1 changes of the BERT Document Intelligence Platform MVP to detect ` |
| `.agents/teamwork/teamwork_auditor_m1_1/BRIEFING.md` | 18 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Write ownership: Worker owned apps/web/src/store/*, apps/web/src/App.tsx, apps/web/src/components/copilot/RightInspect` |
| `.agents/teamwork/teamwork_auditor_m1_1/BRIEFING.md` | 25 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Work product**: Milestone 1 changes across web store, App.tsx, RightInspectorDrawer.tsx, CopilotStream.tsx, apps/api` |
| `.agents/teamwork/teamwork_auditor_m1_1/DISPATCH.md` | 8 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Check for cheating, hardcoding of test strings or facade implementations in `apps/web/src/store/`, `apps/web/src/App.t` |
| `.agents/teamwork/teamwork_auditor_m1_1/DISPATCH.md` | 11 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Verify authentic Pydantic schema validation in `apps/api/bert/api/schemas.py` and that backend endpoints genuinely acc` |
| `.agents/teamwork/teamwork_auditor_m1_1/DISPATCH.md` | 23 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are the Forensic Auditor for Milestone 1 of the BERT Document Intelligence Platform MVP.` |
| `.agents/teamwork/teamwork_auditor_m1_1/handoff.md` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `**Work Product**: Milestone 1 Deliverables (`apps/web/src/store/*`, `apps/web/src/App.tsx`, `apps/web/src/components/cop` |
| `.agents/teamwork/teamwork_auditor_m1_1/handoff.md` | 46 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py`` |
| `.agents/teamwork/teamwork_auditor_m1_1/handoff.md` | 47 | `bert` | Env & Persistence Defaults | Accept SHIELDSTAFF_*, fall back to BERT_* with warning; default shieldstaff.db | `- Ephemeral runtime/test files: `apps/api/bert.db`, `apps/api/test_bert.db`, `apps/api/data/*`` |
| `.agents/teamwork/teamwork_auditor_m1_1/handoff.md` | 81 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- In `apps/api/bert/api/schemas.py:158-163`:` |
| `.agents/teamwork/teamwork_auditor_m1_1/handoff.md` | 115 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- The worker's dispatch strictly limited write scope to `apps/web/src/store/`, `apps/web/src/App.tsx`, `apps/web/src/com` |
| `.agents/teamwork/reviewer_e2e_1/DISPATCH.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `[Message] timestamp=2026-11-11T19:44:08Z sender=106b899f-14e6-4013-bf22-40a4e130217b priority=MESSAGE_PRIORITY_HIGH cont` |
| `.agents/teamwork/reviewer_e2e_1/handoff.md` | 199 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Why**: These tests execute in 0ms and do not test the BERT Document Intelligence Platform. If the frontend completel` |
| `.agents/teamwork/sentinel/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Conduct blocking victory audit on BERT platform improvements and verify compliance against ORIGINAL_REQUEST.md.` |
| `.agents/teamwork/sentinel/handoff.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# Sentinel Handoff Report — BERT Document Intelligence Platform Improvements` |
| `.agents/teamwork/sentinel/handoff.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `The Project Orchestrator claimed completion for the initial phase progression of the BERT Document Intelligence Platform` |
| `.agents/teamwork/sentinel/handoff.md` | 8 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `2. **Integrity & Facade Inspection**: Verified authentic decomposition of monolithic `useBertStore.ts` into 4 domain sli` |
| `.agents/teamwork/sentinel/handoff.md` | 29 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `The architectural and state unification improvements for the BERT Document Intelligence Platform have been successfully ` |
| `.agents/teamwork/explorer_arch/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Investigate and assess the UI architecture, state synchronization, component coupling, and layout/rendering constraints ` |
| `.agents/teamwork/explorer_arch/BRIEFING.md` | 30 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/web/src/store/useBertStore.ts`, `types/bert.ts`, `hooks/useWebSocket.ts`, `lib/api.ts`, `App.tsx`` |
| `.agents/teamwork/explorer_arch/BRIEFING.md` | 31 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py`, `apps/api/bert/main.py`, `apps/api/tests/`` |
| `.agents/teamwork/explorer_arch/DISPATCH.md` | 9 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Carry out Requirement R1: Structural and UI Architecture Assessment for the BERT Document Intelligence Platform prototyp` |
| `.agents/teamwork/explorer_arch/handoff.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `**BERT Document Intelligence Platform Prototype**` |
| `.agents/teamwork/explorer_arch/handoff.md` | 102 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Finding**: The viewer expects standard bottom-left PDF coordinate space where `top = pageSize.height - activeForPage` |
| `.agents/teamwork/explorer_arch/handoff.md` | 237 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `17: socket.onmessage = (message) => { try { const event = JSON.parse(message.data) as import("../types/bert").PipelineEv` |
| `.agents/teamwork/explorer_arch/handoff.md` | 267 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **File**: `apps/api/bert/api/schemas.py:158-161`` |
| `.agents/teamwork/explorer_arch/handoff.md` | 329 | `bert` | Env & Persistence Defaults | Accept SHIELDSTAFF_*, fall back to BERT_* with warning; default shieldstaff.db | `1. **Backend Database Driver**: The running API service uses SQLite (`bert.db` / `test_bert.db`) in development; product` |
| `.agents/teamwork/explorer_arch/handoff.md` | 346 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `1. Update `apps/api/bert/api/schemas.py`:` |
| `.agents/teamwork/explorer_arch/handoff.md` | 352 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `2. Enhance WebSocket handler in `apps/api/bert/api/websocket.py` to push atomic `job_updated` and `work_item_resolved` e` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 50 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Swagger UI accessible at `http://localhost:8000/docs` (`title: BERT Document Intelligence API - Swagger UI`).` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 53 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `GET http://localhost:5173` returned `HTTP 200 OK` (Vite 6 development server delivering document title `"BERT \| Zero-` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 59 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `1. **Backend Copilot Implementation (`apps/api/bert/main.py:146-185`)**:` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 154 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- *Observation*: `apps/api/bert/main.py:146` returns static `CopilotChatResponse`. `useBertStore.ts:952` blocks until th` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 169 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- *Inference*: Cross-pane evidence inspection is the core value proposition of BERT ("Zero-Hallucination Verified Eviden` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 232 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `- "Run Verification Regiment" primary button embedded directly inside the stream card.` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 297 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `This 4-phase roadmap is structured to take the BERT prototype from its current vertical-slice stage to a production-grad` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 432 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `The BERT Document Intelligence Platform prototype has a robust, test-verified foundation: all **14 backend tests pass** ` |
| `.agents/teamwork/explorer_roadmap/handoff.md` | 439 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `By executing the proposed **4-phase MVP Roadmap**—unifying inspector state in Phase 1, hardening accessibility in Phase ` |
| `.agents/teamwork/spec_miner_e2e_1/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Design complete opaque-box E2E test architecture and exhaustive 4-tier test catalog for the BERT Document Intelligence P` |
| `.agents/teamwork/spec_miner_e2e_1/DISPATCH.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are an E2E Specification Miner for the BERT Document Intelligence Platform E2E Testing Track.` |
| `.agents/teamwork/spec_miner_e2e_1/TEST_INFRA.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# BERT Document Intelligence Platform — E2E Test Infrastructure & Specification Catalog` |
| `.agents/teamwork/spec_miner_e2e_1/TEST_INFRA.md` | 17 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `This document establishes the production-grade, opaque-box End-to-End (E2E) testing infrastructure and test case catalog` |
| `.agents/teamwork/spec_miner_e2e_1/TEST_INFRA.md` | 71 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `1. **Isolated Temp Directory**: Spawns Chrome with `--user-data-dir=/tmp/bert-e2e-XXXXXX`.` |
| `.agents/teamwork/spec_miner_e2e_1/handoff.md` | 21 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- File: `apps/api/bert/api/schemas.py:158-161`:` |
| `.agents/teamwork/teamwork_worker_m1/BRIEFING.md` | 20 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py`` |
| `.agents/teamwork/teamwork_worker_m1/BRIEFING.md` | 35 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Code layout**: apps/web/src, apps/api/bert.` |
| `.agents/teamwork/teamwork_worker_m1/BRIEFING.md` | 63 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py`: Fixed `EscalationActionRequest` contract` |
| `.agents/teamwork/teamwork_worker_m1/DISPATCH.md` | 17 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py`` |
| `.agents/teamwork/teamwork_worker_m1/DISPATCH.md` | 64 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `In `apps/api/bert/api/schemas.py`:` |
| `.agents/teamwork/teamwork_worker_m1/handoff.md` | 58 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Source**: `apps/api/bert/api/schemas.py:158-161` restricted `EscalationActionRequest.action` to `Literal["manual_cor` |
| `.agents/teamwork/teamwork_worker_m1/handoff.md` | 60 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Updated `EscalationActionRequest` in `apps/api/bert/api/schemas.py`:` |
| `.agents/teamwork/teamwork_worker_m1/handoff.md` | 125 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Write Ownership Compliance**: All changes were strictly confined to authorized files: `apps/web/src/store/*`, `apps/` |
| `.agents/teamwork/teamwork_worker_m1/handoff.md` | 152 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `> bert-web@0.1.0 build` |
| `.agents/teamwork/teamwork_worker_m1/handoff.md` | 180 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.api.schemas import EscalationActionRequest` |
| `.agents/teamwork/teamwork_worker_m1/progress.md` | 11 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Updated `EscalationActionRequest` in `apps/api/bert/api/schemas.py` (Feature 5)` |
| `.agents/teamwork/explorer_e2e_remediation/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Formulate an exhaustive, concrete remediation strategy and blueprint for 38+ compromised E2E test cases across the BERT ` |
| `.agents/teamwork/explorer_e2e_remediation/DISPATCH.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are an E2E Remediation Explorer for the BERT Document Intelligence Platform E2E Testing Track.` |
| `.agents/teamwork/auditor_e2e_1/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Forensic integrity audit of the newly implemented E2E test suite in tests/e2e/ for BERT Document Intelligence Platform.` |
| `.agents/teamwork/auditor_e2e_1/DISPATCH.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are the Forensic Integrity Auditor for the BERT Document Intelligence Platform E2E Testing Track.` |
| `.agents/teamwork/auditor_e2e_1/handoff.md` | 270 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `*Result*: `FAILED (3771ms)`. Verifies genuine opaque-box HTTP communication with live FastAPI backend on port 8000, fail` |
| `.agents/teamwork/teamwork_reviewer_m1_1/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Independently review code quality, typecheck, build results, interface contracts, write ownership, and adversarial integ` |
| `.agents/teamwork/teamwork_reviewer_m1_1/BRIEFING.md` | 36 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- apps/api/bert/api/schemas.py` |
| `.agents/teamwork/teamwork_reviewer_m1_1/DISPATCH.md` | 12 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py` (`EscalationActionRequest` updated).` |
| `.agents/teamwork/teamwork_reviewer_m1_1/DISPATCH.md` | 28 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `[Message] timestamp=2026-11-11T19:30:03Z sender=07ef96ee-186c-45a8-b4ce-6571c61add26 priority=MESSAGE_PRIORITY_HIGH cont` |
| `.agents/teamwork/teamwork_reviewer_m1_1/handoff.md` | 94 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **File Inspected**: `apps/api/bert/api/schemas.py` (lines 158–163)` |
| `.agents/teamwork/teamwork_reviewer_m1_1/handoff.md` | 132 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- No files in `apps/web/src/pages/*`, `PdfViewer.tsx`, `SpreadsheetViewer.tsx`, `JsonTreeViewer.tsx`, or `types/bert.ts`` |
| `.agents/teamwork/teamwork_reviewer_m1_1/handoff.md` | 202 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.api.schemas import EscalationActionRequest` |
| `.agents/teamwork/teamwork_reviewer_m1_1/progress.md` | 11 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py` -> Verified` |
| `.agents/teamwork/teamwork_explorer_m1_1/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Investigate Features 1 & 2 (Store Decomposition & Polling Removal) for Milestone 1 of BERT Document Intelligence Platfor` |
| `.agents/teamwork/teamwork_explorer_m1_1/BRIEFING.md` | 29 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/main.py`, `pipeline.py`, `controller.py` (WebSocket event broadcaster traced)` |
| `.agents/teamwork/teamwork_explorer_m1_1/DISPATCH.md` | 23 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are Explorer 1 for Milestone 1 of the BERT Document Intelligence Platform MVP.` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 47 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Backend WebSocket telemetry emission in `apps/api/bert/`**:` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 48 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `JobController` publishes events via WebSocket broadcast: `JOB_PAUSING`, `JOB_RESUMING`, `JOB_PAUSED`, `JOB_RESUMED`, ` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 49 | `bert` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `- `run_regiment` in `pipeline.py` publishes `agent_transition` (running/completed), `gate_check`, and `work_item` update` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 241 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `3. **M1 Write Boundaries**: Worker must only write files in `apps/web/src/store/`, `apps/web/src/App.tsx`, `apps/web/src` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 260 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { ASTNode, Document, WorkItem } from "../types/bert";` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 549 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { ASTNode, CopilotChatResponse, Document, JobExecution, WorkItem } from "../types/bert";` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 571 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"me", "my", "our", "your", "company", "policy", "policies", "bert", "copilot", "please", "tell", "about", "it", "its", "` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 826 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { ASTNode, Document, JobExecution } from "../types/bert";` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 931 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { JobExecution, PipelineEvent, WorkItem } from "../types/bert";` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 1138 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `set({ activeJob: job, backendAvailable: true, isSimulating: true, notice: "Investor demo case loaded · 7-Agent regiment ` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 1183 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { CitationMatch } from "../types/bert";` |
| `.agents/teamwork/teamwork_explorer_m1_1/handoff.md` | 1312 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { CopilotChatMessage, CopilotChatResponse } from "../types/bert";` |
| `.agents/teamwork/teamwork_challenger_m1_1/DISPATCH.md` | 21 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are Challenger 1 for Milestone 1 of the BERT Document Intelligence Platform MVP.` |
| `.agents/teamwork/explorer_a11y/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Accessibility and UX Limitations Evaluation (Requirement R2) for the BERT Document Intelligence Platform prototype.` |
| `.agents/teamwork/explorer_a11y/DISPATCH.md` | 7 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Carry out Requirement R2: Accessibility and UX Limitations Evaluation for the BERT Document Intelligence Platform protot` |
| `.agents/teamwork/explorer_a11y/handoff.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `**BERT Document Intelligence Platform Prototype**` |
| `.agents/teamwork/explorer_a11y/handoff.md` | 160 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `- `AttioSidebar.tsx:90` ("7-Agent Regiment")` |
| `.agents/teamwork/explorer_a11y/handoff.md` | 283 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `\| **A11Y-11** \| Icon Buttons \| `CopilotStream.tsx:184-190` \| WCAG 4.1.2 (Name, Role, Value) \| Prompt composer submit but` |
| `.agents/teamwork/explorer_a11y/handoff.md` | 317 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `The BERT Document Intelligence Platform prototype features a compelling aesthetic inspired by modern enterprise tooling,` |
| `.agents/teamwork/explorer_a11y/raw_audit_results.json` | 6 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"title": "BERT \| Zero-Hallucination Document Intelligence",` |
| `.agents/teamwork/explorer_a11y/raw_audit_results.json` | 218 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"title": "BERT \| Zero-Hallucination Document Intelligence",` |
| `.agents/teamwork/explorer_a11y/raw_audit_results.json` | 288 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"sampleText": "BERT Compliance"` |
| `.agents/teamwork/explorer_a11y/raw_audit_results.json` | 632 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"title": "BERT \| Zero-Hallucination Document Intelligence",` |
| `.agents/teamwork/explorer_a11y/raw_audit_results.json` | 716 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"sampleText": "BERT Compliance"` |
| `.agents/teamwork/explorer_a11y/raw_audit_results.json` | 1066 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"title": "BERT \| Zero-Hallucination Document Intelligence",` |
| `.agents/teamwork/explorer_a11y/raw_audit_results.json` | 1168 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"sampleText": "BERT Compliance"` |
| `.agents/teamwork/test_writer_e2e_1/BRIEFING.md` | 4 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `Author and execute the comprehensive 140-test E2E test suite across Tiers 1-4 for the BERT Document Intelligence Platfor` |
| `.agents/teamwork/test_writer_e2e_1/DISPATCH.md` | 5 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `You are the E2E Test Writer for the BERT Document Intelligence Platform.` |
| `.agents/teamwork/test_writer_e2e_1/handoff.md` | 56 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `- **Root Cause in Implementation**: `apps/api/bert/api/schemas.py` defines `EscalationActionRequest.action` enum as `Lit` |
| `.agents/teamwork/test_writer_e2e_1/handoff.md` | 128 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `- `apps/api/bert/api/schemas.py` currently accepts only `manual_correction`, `retry`, and `skip`. Once the backend track` |
| `.agents/teamwork/test_writer_e2e_1/handoff.md` | 136 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `The production-grade E2E test suite for the BERT Document Intelligence Platform is **fully delivered, verified, and oper` |
| `.agents/teamwork/victory_auditor_1/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Audit project completion claim for BERT Document Intelligence Platform against ORIGINAL_REQUEST.md.` |
| `.agents/teamwork/victory_auditor_1/BRIEFING.md` | 25 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Work product**: BERT Document Intelligence Platform (apps/api, apps/web)` |
| `.agents/teamwork/victory_auditor_1/BRIEFING.md` | 41 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Confirmed `EscalationActionRequest` updated with `approve` and `counsel` in `apps/api/bert/api/schemas.py`.` |
| `.agents/teamwork/victory_auditor_1/DISPATCH.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Audit the completion claim made by the Project Orchestrator for the BERT Document Intelligence Platform implementation a` |
| `.agents/teamwork/victory_auditor_1/DISPATCH.md` | 17 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `2. Phase 2 — Cheating & Facade Detection: Verify store slices (`documentSlice.ts`, `jobExecutionSlice.ts`, `evidenceInsp` |
| `.agents/teamwork/victory_auditor_1/handoff.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# Victory Audit Handoff Report — BERT Document Intelligence Platform` |
| `.agents/teamwork/victory_auditor_1/handoff.md` | 23 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Details: Zero cheating patterns or facade implementations detected across all 4 store slices (`documentSlice.ts`, `jobEx` |
| `.agents/teamwork/victory_auditor_1/handoff.md` | 66 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- In `apps/api/bert/api/schemas.py`:` |
| `.agents/teamwork/victory_auditor_1/handoff.md` | 103 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `ORIGINAL_REQUEST.md` explicitly instructed: "Implement the architectural, accessibility, and multi-format evidence im` |
| `.agents/teamwork/interviewer/prompt_draft.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Implement the architectural, accessibility, and multi-format evidence improvements for the BERT Document Intelligence Pl` |
| `.agents/teamwork/interviewer/prompt_draft.md` | 14 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Refactor state management in `useBertStore.ts` by decomposing the monolithic store into focused domain slices (documents` |
| `.agents/teamwork/sub_orch_m2/BRIEFING.md` | 63 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Do NOT modify M1 files (`apps/web/src/store/*`, `apps/api/bert/api/schemas.py`) unless strictly necessary and compatib` |
| `.agents/teamwork/sub_orch_m2/DISPATCH.md` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `You are the Milestone 2 Sub-Orchestrator for the BERT Document Intelligence Platform.` |
| `.agents/teamwork/sub_orch_m2/DISPATCH.md` | 64 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Do NOT modify M1 files (`apps/web/src/store/*`, `apps/api/bert/api/schemas.py`) unless strictly necessary and compatib` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# BERT Document Intelligence Platform Prototype` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 15 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `The BERT (Batch Extraction, Review & Triage) prototype demonstrates a compelling domain vision: zero-hallucination compl` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 32 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| **Frontend Live Service** \| `http://localhost:5173` \| **200 OK** \| Delivered `"BERT \\| Zero-Hallucination Document Int` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 87 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `4. **Backend Contract Violation: HTTP 422 Escalation Rejection (`apps/api/bert/api/schemas.py:158` vs `useBertStore.ts:1` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 115 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `\| **A11Y-11** \| Icon Buttons \| `CopilotStream.tsx:184-190` \| 4.1.2 (Name, Role, Value) \| Submit button contains only an ` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 143 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Currently, the copilot interface operates as a static, blocking request/response search (`apps/api/bert/main.py:146` via` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 206 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `This 4-phase, 8-week engineering roadmap transforms the BERT prototype into a capability showcase MVP for enterprise sta` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 230 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `4. *Fix Backend Contract Violation*: Update `apps/api/bert/api/schemas.py` `EscalationActionRequest` to accept `Literal[` |
| `.agents/teamwork/orchestrator/BERT_PROTOTYPE_ANALYSIS_AND_MVP_ROADMAP.md` | 316 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Backend 422 contract violation: Inspect `apps/api/bert/api/schemas.py:158` (`EscalationActionRequest` rejecting `"appr` |
| `.agents/teamwork/orchestrator/BRIEFING.md` | 4 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Orchestrate the end-to-end implementation of architectural, accessibility, and multi-format evidence improvements for th` |
| `.agents/teamwork/orchestrator/DISPATCH.md` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Analyse the structure and UI of the BERT Document Intelligence Platform prototype, address its architectural complicatio` |
| `.agents/teamwork/orchestrator/DISPATCH.md` | 51 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Project: BERT (Document Intelligence Platform) in `/Users/ayu/Desktop/Codes/construct` on branch `feature/ui-engine-up` |
| `.agents/teamwork/orchestrator/DISPATCH.md` | 59 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Implement the architectural, accessibility, and multi-format evidence improvements for the BERT Document Intelligence Pl` |
| `.agents/teamwork/orchestrator/DISPATCH.md` | 72 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `Refactor state management in `useBertStore.ts` by decomposing the monolithic store into focused domain slices (documents` |
| `.agents/teamwork/orchestrator/PROJECT.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# Project: BERT Document Intelligence Platform MVP` |
| `.agents/teamwork/orchestrator/PROJECT.md` | 20 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| 5 \| Escalation Schema Fix \| Update `EscalationActionRequest` in `apps/api/bert/api/schemas.py` to allow `"approve"` an` |
| `.agents/teamwork/orchestrator/PROJECT.md` | 51 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `### Backend API Schema (`apps/api/bert/api/schemas.py`)` |
| `.agents/teamwork/orchestrator/PROJECT.md` | 66 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/api/schemas.py`` |
| `.agents/teamwork/orchestrator/handoff.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# Project Orchestrator Handoff Report — BERT Platform UI & Architecture Upgrade` |
| `.agents/teamwork/orchestrator/handoff.md` | 63 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `3. **Escalation Contract Fix (`apps/api/bert/api/schemas.py`)**:` |
| `docs/PDF_COORDINATES.md` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `This document defines the canonical coordinate geometry, transformation math, and multi-format `EvidenceLocator` contrac` |
| `docs/PDF_COORDINATES.md` | 9 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `All PDF bounding boxes persisted by BERT (`ASTNode.bounding_box`, `PDFLocator.bbox`) use **unrotated PDF user space** (`` |
| `docs/PRESERVE.md` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `# BERT Stabilization Baseline — Feature & Contract Preservation Inventory` |
| `docs/PRESERVE.md` | 13 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| API Entrypoint \| `apps/api/bert/main.py` \| `lifespan` (`55-58`), `app` (`61`), `manager` (`69`), `job_controller` (`70` |
| `docs/PRESERVE.md` | 14 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `\| API Compat Re-export \| `apps/api/bert/api/main.py` \| Re-exports `app`, `manager`, `startup` from `bert.main` (`3-5`) \|` |
| `docs/PRESERVE.md` | 15 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| API Config \| `apps/api/bert/config.py` \| `Settings` (`9-19`), `settings` (`21`) (`inference_mode`, `db_mode`, `databas` |
| `docs/PRESERVE.md` | 16 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| Local Storage State \| `apps/api/bert/state.py` \| `API_ROOT` (`14`), `DATA_DIR` (`15-16`, `apps/api/data`), `stored_sou` |
| `docs/PRESERVE.md` | 17 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| Async SQLAlchemy Base \| `apps/api/bert/models/base.py` \| `Base` (`14-15`), `engine` (`18`), `SessionFactory` (`19-21`)` |
| `docs/PRESERVE.md` | 26 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `### 1.1 Regiment Ordering & Orchestrator` |
| `docs/PRESERVE.md` | 28 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Backend: `AGENT_NAMES` (`apps/api/bert/agents/pipeline.py:40`), `AGENT_MODELS` (`41-49`, `Scout: "vision"`, others `"t` |
| `docs/PRESERVE.md` | 30 | `bert` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `- **Pipeline Orchestrator:** `run_regiment` (`apps/api/bert/agents/pipeline.py:239-465`)` |
| `docs/PRESERVE.md` | 40 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| 1 \| **Scout** \| `apps/api/bert/agents/scout.py`: `rescue_regions` (`10-21`) \| Filters `ParsedNode` items with `ocr_con` |
| `docs/PRESERVE.md` | 41 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| 2 \| **Quartermaster** \| `apps/api/bert/agents/quartermaster.py`: `categorize_nodes` (`11-28`); `pipeline.py:263-274` \|` |
| `docs/PRESERVE.md` | 42 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `\| 3 \| **Chronos** \| `apps/api/bert/agents/chronos.py`: `analyze_versions` (`11-26`) \| Marks `XLSX` documents `is_latest_` |
| `docs/PRESERVE.md` | 43 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| 4 \| **Vanguard** \| `apps/api/bert/agents/vanguard.py`: `score_node` (`10-22`), `score_nodes` (`25-28`) \| Assigns `ASTN` |
| `docs/PRESERVE.md` | 44 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| 5 \| **Ranger** \| `apps/api/bert/agents/ranger.py`: `ExtractedFact` (`8-16`), `RangerOutput` (`19-24`) \| Strict Pydanti` |
| `docs/PRESERVE.md` | 45 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| 6 \| **Arbiter** \| `apps/api/bert/agents/arbiter.py`: `resolve_conflicts` (`10-14`) \| Summarizes `latest_documents` vs ` |
| `docs/PRESERVE.md` | 46 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `\| 7 \| **Envoy** \| `apps/api/bert/agents/envoy.py`: `synthesize_verified_output` (`9-16`) \| Enforces `if not gate.passed:` |
| `docs/PRESERVE.md` | 49 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/inference/runtime.py`:` |
| `docs/PRESERVE.md` | 54 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **ORM Model:** `JobExecution` (`apps/api/bert/models/documents.py:159-178`) stores `status`, `current_agent_index`, `c` |
| `docs/PRESERVE.md` | 55 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **In-Memory + DB Controller:** `TaskExecutionState` (`apps/api/bert/agents/controller.py:17-32`) and `JobController` (` |
| `docs/PRESERVE.md` | 57 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **HTTP Endpoints (`apps/api/bert/main.py` & `bert/api/schemas.py`):**` |
| `docs/PRESERVE.md` | 67 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `EventSink` (`apps/api/bert/agents/pipeline.py:52-69`) and `WebSocketManager` (`apps/api/bert/api/websocket.py:13-32`)` |
| `docs/PRESERVE.md` | 68 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Routes: `WS /ws` & `WS /ws/events` (`apps/api/bert/main.py:93-101`).` |
| `docs/PRESERVE.md` | 89 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `apps/api/bert/models/documents.py`:` |
| `docs/PRESERVE.md` | 92 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `startup()` (`apps/api/bert/main.py:73-86`) runs `Base.metadata.create_all` plus idempotent SQLite/SQL column checks f` |
| `docs/PRESERVE.md` | 95 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Router & Allowlists (`apps/api/bert/ingestion/router.py`):**` |
| `docs/PRESERVE.md` | 97 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **PDF / TXT / MD Parser (`apps/api/bert/ingestion/docling_parser.py`):**` |
| `docs/PRESERVE.md` | 101 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `- **XLSX Parser & Write-Back (`apps/api/bert/ingestion/xlsx_handler.py`):**` |
| `docs/PRESERVE.md` | 103 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **O(1) Streaming JSON Parser (`apps/api/bert/ingestion/json_streamer.py`):**` |
| `docs/PRESERVE.md` | 108 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `checksum_for_nodes` (`apps/api/bert/ingestion/docling_parser.py:41-46`): SHA-256 over UTF-8 `verbatim_text` ordered b` |
| `docs/PRESERVE.md` | 109 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `persist_ingestion_stream` (`apps/api/bert/agents/pipeline.py:168-226`): streams parser batches (`batch_size=250`), up` |
| `docs/PRESERVE.md` | 110 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `verify_ingestion_completeness` (`apps/api/bert/ingestion/checksum.py:16-37`, `_update_digest` `40-42`): streams persi` |
| `docs/PRESERVE.md` | 111 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `payload_hash` (`apps/api/bert/verification/citation_gate.py:139-142`): canonical sorted-key JSON SHA-256 used for all` |
| `docs/PRESERVE.md` | 115 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- Endpoint: `GET /api/v1/audit-log` (`apps/api/bert/main.py:233-237`) -> returns up to 250 `AuditResponse` rows (`apps/a` |
| `docs/PRESERVE.md` | 122 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `### 3.1 Deterministic Anti-Hallucination Gate (`apps/api/bert/verification/citation_gate.py`)` |
| `docs/PRESERVE.md` | 136 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `POST /api/v1/sandbox/check` (`apps/api/bert/main.py:481-527`), `SandboxRequest` & `SandboxResponse` (`apps/api/bert/a` |
| `docs/PRESERVE.md` | 143 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Backend Endpoints (`apps/api/bert/main.py`):**` |
| `docs/PRESERVE.md` | 182 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Backend (`apps/api/bert/main.py`):**` |
| `docs/PRESERVE.md` | 234 | `bert` | Env & Persistence Defaults | Accept SHIELDSTAFF_*, fall back to BERT_* with warning; default shieldstaff.db | `\| Backend XLSX Export \| `GET /api/v1/export/questionnaire.xlsx` (`apps/api/bert/main.py:530-552`) \| `openpyxl` via `XLSX` |
| `docs/PRESERVE.md` | 235 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `\| Backend Markdown Export \| `GET /api/v1/export/summary.md` (`apps/api/bert/main.py:555-570`) \| `PlainTextResponse` (`.m` |
| `docs/PRESERVE.md` | 248 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- `GET /api/v1/documents` (`apps/api/bert/main.py:104-108`) -> `list[DocumentResponse]` ordered by `desc(Document.create` |
| `docs/PRESERVE.md` | 257 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Backend (`apps/api/bert/main.py`):**` |
| `docs/PRESERVE.md` | 265 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **Backend Demo Endpoints & Fixtures (`apps/api/bert/main.py`):**` |
| `docs/PRESERVE.md` | 323 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `1. **`apps/api/tests/test_escalation_schema_adversarial.py:175-178`:** Explicitly asserts `POST /api/v1/escalations/{id}` |
| `docs/PRESERVE.md` | 329 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `1. **`counsel` ("Flag for Legal") & Manual Override Flaws (`apps/api/bert/main.py:442-478`):** `VerificationStatus` lack` |
| `apps/web/index.html` | 7 | `bert` | Browser Metadata & Shell | Update title, meta, and backward-compatible theme init | `<title>BERT \| Evidence-Verified Document Intelligence</title>` |
| `apps/web/index.html` | 11 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `var stored = window.localStorage.getItem("bert-theme");` |
| `apps/web/package-lock.json` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"name": "bert-web",` |
| `apps/web/package-lock.json` | 8 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"name": "bert-web",` |
| `apps/web/package.json` | 2 | `bert` | Package Metadata | Update package name to shieldstaff-web / shieldstaff | `"name": "bert-web",` |
| `apps/web/src/tests/phase3_integrity_unit.ts` | 29 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `import type { WorkItem } from "../types/bert";` |
| `apps/web/src/tests/phase4_observability_unit.ts` | 33 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `import type { JobExecution, PipelineEvent, WorkItem } from "../types/bert";` |
| `apps/web/src/tests/phase5_triage_unit.ts` | 30 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `import type { Document, WorkItem } from "../types/bert";` |
| `apps/web/src/tests/phase6_results_unit.ts` | 33 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `import type { WorkItem } from "../types/bert";` |
| `apps/web/src/tests/phase7_landing_unit.ts` | 196 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `assertEqual(USE_CASES.length, 4, "4 BERT use cases defined");` |
| `apps/web/src/tests/phase8_design_system_unit.ts` | 7 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `* 4. Theme helper state machine: light default, dark persistence in localStorage["bert-theme"], data-theme + .dark class` |
| `apps/web/src/tests/phase8_design_system_unit.ts` | 120 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `assert(indexHtml.includes("bert-theme"), "index.html initializes data-theme synchronously from bert-theme");` |
| `apps/web/src/tests/phase8_design_system_unit.ts` | 285 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `assertEqual(THEME_STORAGE_KEY, "bert-theme", "THEME_STORAGE_KEY is 'bert-theme'");` |
| `apps/web/src/styles/tokens.css` | 2 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `* BERT Design System Tokens — "Audit Ledger / Evidence Dossier" Aesthetic` |
| `apps/web/src/components/ui/Select.tsx` | 49 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `const triggerId = id \|\| `bert-select-${autoId}`;` |
| `apps/web/src/components/copilot/AgentPipelineStepper.tsx` | 188 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `aria-label="Regiment stages"` |
| `apps/web/src/components/copilot/CopilotStream.tsx` | 290 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `Ask anything about your corpus or steer the active 7-agent regiment with real-time checkpointing.` |
| `apps/web/src/components/copilot/EvidenceLocatorBadge.tsx` | 4 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `import type { BboxTuple, BoundingBox, Document, EvidenceLocator } from "../../types/bert";` |
| `apps/web/src/components/copilot/JsonTreeViewer.tsx` | 11 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `import type { ASTNode, Document } from "../../types/bert";` |
| `apps/web/src/components/copilot/PdfViewer.tsx` | 24 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `import type { ASTNode, Document } from "../../types/bert";` |
| `apps/web/src/components/copilot/SpreadsheetViewer.tsx` | 7 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `import type { ASTNode, Document } from "../../types/bert";` |
| `apps/web/src/components/copilot/TextEvidenceViewer.tsx` | 5 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `import type { ASTNode, Document } from "../../types/bert";` |
| `apps/web/src/components/layout/AppShell.tsx` | 88 | `bert` | User-Facing UI & Logo | Replace with ShieldStaff / Shield icon / S monogram | `BERT Enterprise` |
| `apps/web/src/components/navigation/AttioSidebar.tsx` | 27 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `import type { Document } from "../../types/bert";` |
| `apps/web/src/components/navigation/AttioSidebar.tsx` | 208 | `bert` | User-Facing UI & Logo | Replace with ShieldStaff / Shield icon / S monogram | `BERT Compliance` |
| `apps/web/src/components/navigation/AttioSidebar.tsx` | 211 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `7-Agent Regiment` |
| `apps/web/src/components/navigation/WeTransferIconRail.tsx` | 68 | `bert` | User-Facing UI & Logo | Replace with ShieldStaff / Shield icon / S monogram | `title="BERT Document Intelligence"` |
| `apps/web/src/components/navigation/WeTransferIconRail.tsx` | 69 | `bert` | User-Facing UI & Logo | Replace with ShieldStaff / Shield icon / S monogram | `aria-label="BERT Home"` |
| `apps/web/src/components/navigation/WeTransferIconRail.tsx` | 74 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `BERT` |
| `apps/web/src/components/navigation/WeTransferTopPill.tsx` | 50 | `bert` | User-Facing UI & Logo | Replace with ShieldStaff / Shield icon / S monogram | `aria-label="BERT Overview"` |
| `apps/web/src/components/navigation/WeTransferTopPill.tsx` | 56 | `bert` | User-Facing UI & Logo | Replace with ShieldStaff / Shield icon / S monogram | `BERT Enterprise` |
| `apps/web/src/components/navigation/WeTransferTopPill.tsx` | 175 | `bert` | User-Facing UI & Logo | Replace with ShieldStaff / Shield icon / S monogram | `<span className="font-semibold text-[var(--text-primary)]">BERT Enterprise</span>` |
| `apps/web/src/hooks/useWebSocket.ts` | 22 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `socket.onmessage = (message) => { try { const event = JSON.parse(message.data) as import("../types/bert").PipelineEvent;` |
| `apps/web/src/lib/api.ts` | 15 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `} from "../types/bert";` |
| `apps/web/src/lib/evidenceLocators.ts` | 7 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `} from "../types/bert";` |
| `apps/web/src/lib/evidenceLocators.ts` | 33 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `console.warn(`[BERT Evidence] No source locator stored (${context})`, detail ?? "");` |
| `apps/web/src/lib/landingContent.ts` | 301 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `contractNote: "CITATION_THRESHOLD = 97.0 · apps/api/bert/verification/citation_gate.py",` |
| `apps/web/src/lib/landingContent.ts` | 355 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"When Scout detects ocr_confidence < 0.90, BERT blocks automatic verification, attaches page bounding-box coordinates, a` |
| `apps/web/src/lib/pipelineTelemetry.ts` | 8 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `} from "../types/bert";` |
| `apps/web/src/lib/resultsChart.ts` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { Document, WorkItem } from "../types/bert";` |
| `apps/web/src/lib/theme.ts` | 5 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `export const THEME_STORAGE_KEY = "bert-theme";` |
| `apps/web/src/lib/theme.ts` | 6 | `bert` | Storage Keys & Backward Compat | Read new key first, fall back to legacy key, write new | `export const THEME_CHANGE_EVENT = "bert-theme-change";` |
| `apps/web/src/lib/triageQueue.ts` | 7 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `} from "../types/bert";` |
| `apps/web/src/lib/workItemMetrics.ts` | 7 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `} from "../types/bert";` |
| `apps/web/src/lib/workItemMetrics.ts` | 164 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `* Mirrors backend `bert.verification.citation_gate.assess_quote_strength`:` |
| `apps/web/src/lib/workItemMetrics.ts` | 306 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `* and pre-export warnings. Matches `bert.verification.metrics.compute_work_item_metrics`.` |
| `apps/web/src/pages/LandingPage.tsx` | 295 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `7-Agent Regiment` |
| `apps/web/src/pages/LandingPage.tsx` | 353 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `<span>BERT · DETERMINISTIC EVIDENCE VERIFICATION</span>` |
| `apps/web/src/pages/LandingPage.tsx` | 443 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `Step through real BERT verification cases: SOC 2 MFA, AWS IAM{" "}` |
| `apps/web/src/pages/LandingPage.tsx` | 642 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `7-AGENT REGIMENT PIPELINE` |
| `apps/web/src/pages/LandingPage.tsx` | 648 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `BERT separates OCR rescue, classification, temporal tracking, risk scoring,` |
| `apps/web/src/pages/LandingPage.tsx` | 745 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `BERT USE CASES` |
| `apps/web/src/pages/LandingPage.tsx` | 751 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `Select any workflow to inspect how BERT parses source geometry, anchors locators,` |
| `apps/web/src/pages/LandingPage.tsx` | 839 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `Run BERT directly on your workstation or air-gapped node with SQLite async storage,` |
| `apps/web/src/pages/LandingPage.tsx` | 884 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `BERT · Evidence-Verified Document Intelligence` |
| `apps/web/src/pages/LandingPage.tsx` | 888 | `berthier, louis-alexandre, marshal` | Historical Reference Removal | Remove Marshal Berthier wording entirely | `Inspired by Marshal Louis-Alexandre Berthier. Every answer is backed by verbatim` |
| `apps/web/src/pages/ResultsPage.tsx` | 49 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `import type { WorkItem } from "../types/bert";` |
| `apps/web/src/pages/TriagePage.tsx` | 45 | `bert` | Frontend Logic & UI | Rebrand display strings & store aliases | `import type { WorkItem } from "../types/bert";` |
| `apps/web/src/store/copilotSlice.ts` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { CitationMatch, CopilotChatMessage, CopilotChatResponse } from "../types/bert";` |
| `apps/web/src/store/demoCorpusService.ts` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { ASTNode, Document, WorkItem } from "../types/bert";` |
| `apps/web/src/store/documentSlice.ts` | 5 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { ASTNode, Document, JobExecution } from "../types/bert";` |
| `apps/web/src/store/evidenceInspectionSlice.ts` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `import type { CitationMatch, EvidenceLocator } from "../types/bert";` |
| `apps/web/src/store/jobExecutionSlice.ts` | 27 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `} from "../types/bert";` |
| `apps/web/src/store/jobExecutionSlice.ts` | 1225 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `notice: "Investor demo case loaded · 7-Agent regiment reviewing corpus.",` |
| `apps/web/src/store/simulatorService.ts` | 19 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `} from "../types/bert";` |
| `apps/web/src/store/simulatorService.ts` | 121 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"bert",` |
| `apps/web/src/store/simulatorService.ts` | 792 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"# BERT Executive Review Summary (Envoy)",` |
| `apps/web/src/store/simulatorService.ts` | 866 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"# BERT Executive Review Summary (Envoy)",` |
| `apps/api/bert.db` | 780 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `                                                                                                                     ` |
| `apps/api/bert.db` | 802 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `@O      Envoy reviewed 13 finding(s) across 4 document(s) (active corpus): 8 machine-verified (62% defensibility), 0` |
| `apps/api/bert.db` | 828 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `- **P0_CRITICAL** [INSUFFICIENT_EVIDENCE] · Liability & Indemnification: Which lUMM 	 1!	Ad3973ac8956f4b9` |
| `apps/api/bert.db` | 6199 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `                                                                                                                     ` |
| `apps/api/bert.db` | 6552 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `@O      Envoy reviewed 13 finding(s) across 4 document(s) (active corpus): 8 machine-verified (62% defensibility), 0` |
| `apps/api/pyproject.toml` | 2 | `bert` | Package Metadata | Update package name to shieldstaff-web / shieldstaff | `name = "bert-api"` |
| `apps/api/pyproject.toml` | 4 | `bert` | Package Metadata | Update package name to shieldstaff-web / shieldstaff | `description = "BERT interactive vertical slice API"` |
| `apps/api/test_bert.db` | 267 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `                                                                                                                      ` |
| `apps/api/test_bert.db` | 302 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `                                                                                                                     ` |
| `apps/api/test_bert.db` | 417 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `   Y Y                                                                                                               ` |
| `apps/api/tests/conftest.py` | 13 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.base import Base, SessionFactory, engine` |
| `apps/api/tests/conftest.py` | 14 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.documents import ASTNode, AuditLog, Document, ExecutiveSummaryRecord, JobExecution, WorkItem` |
| `apps/api/tests/test_citation_gate.py` | 3 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.documents import PriorityTier, VerificationStatus` |
| `apps/api/tests/test_citation_gate.py` | 4 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.verification.citation_gate import run_verification_gate, verify_citations, verify_logprobs` |
| `apps/api/tests/test_copilot_and_file_stream.py` | 9 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.main import app, startup` |
| `apps/api/tests/test_copilot_and_file_stream.py` | 10 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.main import _write_demo_fixtures` |
| `apps/api/tests/test_demo_pipeline.py` | 8 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.main import app, manager, startup` |
| `apps/api/tests/test_demo_pipeline.py` | 9 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.base import SessionFactory` |
| `apps/api/tests/test_demo_pipeline.py` | 10 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.documents import AuditLog, WorkItem` |
| `apps/api/tests/test_escalation_schema_adversarial.py` | 14 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.main import app, startup` |
| `apps/api/tests/test_escalation_schema_adversarial.py` | 15 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.schemas import EscalationActionRequest` |
| `apps/api/tests/test_escalation_schema_adversarial.py` | 16 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.base import SessionFactory` |
| `apps/api/tests/test_escalation_schema_adversarial.py` | 17 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.documents import AuditLog, Document, PriorityTier, VerificationStatus, WorkItem` |
| `apps/api/tests/test_ingestion_ast.py` | 10 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.ingestion.json_streamer import JSONStreamer` |
| `apps/api/tests/test_ingestion_ast.py` | 11 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.ingestion.xlsx_handler import XLSXHandler` |
| `apps/api/tests/test_ingestion_ast.py` | 12 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.documents import NodeType` |
| `apps/api/tests/test_phase2_locators_summary_legal.py` | 19 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.main import app, manager, startup` |
| `apps/api/tests/test_phase2_locators_summary_legal.py` | 20 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.base import SessionFactory` |
| `apps/api/tests/test_phase2_locators_summary_legal.py` | 21 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.documents import (` |
| `apps/api/tests/test_phase2_locators_summary_legal.py` | 29 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.agents.pipeline import verify_node_region` |
| `apps/api/tests/test_phase2_locators_summary_legal.py` | 30 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.state import DATA_DIR` |
| `apps/api/tests/test_phase2_locators_summary_legal.py` | 31 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.verification.citation_gate import verify_region_text` |
| `apps/api/tests/test_phase2_locators_summary_legal.py` | 301 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `# Run full regiment across both dated_doc and undated scanned_doc (Chronos date/datetime check!).` |
| `apps/api/tests/test_phase3_integrity.py` | 31 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `import bert.main as main_module` |
| `apps/api/tests/test_phase3_integrity.py` | 32 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.agents.pipeline import _fact_node` |
| `apps/api/tests/test_phase3_integrity.py` | 33 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.main import app, manager, startup` |
| `apps/api/tests/test_phase3_integrity.py` | 34 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.base import SessionFactory` |
| `apps/api/tests/test_phase3_integrity.py` | 35 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.documents import (` |
| `apps/api/tests/test_phase3_integrity.py` | 46 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.state import DATA_DIR` |
| `apps/api/tests/test_phase3_integrity.py` | 47 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.verification.citation_gate import run_verification_gate, verify_citations` |
| `apps/api/tests/test_phase3_integrity.py` | 48 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.verification.metrics import compute_work_item_metrics` |
| `apps/api/tests/test_phase4_observability.py` | 12 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `import bert.agents.pipeline as pipeline_module` |
| `apps/api/tests/test_phase4_observability.py` | 13 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.main import app, manager, startup` |
| `apps/api/tests/test_phase4_observability.py` | 14 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.main import job_controller` |
| `apps/api/tests/test_phase5_triage.py` | 27 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `import bert.main as main_module` |
| `apps/api/tests/test_phase5_triage.py` | 28 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.main import app, startup` |
| `apps/api/tests/test_phase5_triage.py` | 29 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.base import SessionFactory` |
| `apps/api/tests/test_phase5_triage.py` | 30 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.models.documents import (` |
| `apps/api/tests/test_phase5_triage.py` | 40 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.verification.citation_gate import INSUFFICIENT_EVIDENCE_OUTPUT` |
| `apps/api/tests/test_real_upload_flow.py` | 7 | `bert` | Test Suite & Telemetry | Update assertions and add rebrand/alias verification | `from bert.api.main import app, manager, startup` |
| `apps/api/bert/__init__.py` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"""BERT API package."""` |
| `apps/api/bert/config.py` | 13 | `bert` | Env & Persistence Defaults | Accept SHIELDSTAFF_*, fall back to BERT_* with warning; default shieldstaff.db | `database_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./bert.db")` |
| `apps/api/bert/main.py` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"""Single FastAPI entrypoint for BERT's local-first document intelligence API."""` |
| `apps/api/bert/main.py` | 22 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.controller import JobController` |
| `apps/api/bert/main.py` | 23 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.pipeline import (` |
| `apps/api/bert/main.py` | 31 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.api.schemas import (` |
| `apps/api/bert/main.py` | 55 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.api.websocket import WebSocketManager` |
| `apps/api/bert/main.py` | 56 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.config import settings` |
| `apps/api/bert/main.py` | 57 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.checksum import verify_ingestion_completeness` |
| `apps/api/bert/main.py` | 58 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.docling_parser import DoclingParser` |
| `apps/api/bert/main.py` | 59 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.router import ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, safe_filename, stream_file` |
| `apps/api/bert/main.py` | 60 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.base import Base, SessionFactory, engine` |
| `apps/api/bert/main.py` | 61 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import (` |
| `apps/api/bert/main.py` | 74 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.state import DATA_DIR, stored_source_path` |
| `apps/api/bert/main.py` | 75 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.verification.citation_gate import (` |
| `apps/api/bert/main.py` | 80 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.verification.metrics import compute_work_item_metrics` |
| `apps/api/bert/main.py` | 89 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `app = FastAPI(title="BERT Document Intelligence API", version="0.1.0", lifespan=lifespan)` |
| `apps/api/bert/main.py` | 421 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `"""Prepare all demo documents synchronously, then run the 7-agent regiment in background."""` |
| `apps/api/bert/main.py` | 1105 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `from bert.ingestion.xlsx_handler import XLSXHandler` |
| `apps/api/bert/ingestion/checksum.py` | 13 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import ASTNode, Document` |
| `apps/api/bert/ingestion/docling_parser.py` | 29 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import NodeType, SourceFormat` |
| `apps/api/bert/ingestion/json_streamer.py` | 13 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.docling_parser import IngestionResult, ParsedNode, checksum_for_nodes` |
| `apps/api/bert/ingestion/json_streamer.py` | 14 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import NodeType, SourceFormat` |
| `apps/api/bert/ingestion/router.py` | 9 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.docling_parser import DoclingParser, IngestionResult, ParsedNode` |
| `apps/api/bert/ingestion/router.py` | 10 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.json_streamer import JSONStreamer` |
| `apps/api/bert/ingestion/router.py` | 11 | `bert` | Export Artifacts | Rename exported files/sheets to ShieldStaff | `from bert.ingestion.xlsx_handler import XLSXHandler` |
| `apps/api/bert/ingestion/xlsx_handler.py` | 14 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.docling_parser import IngestionResult, ParsedNode, checksum_for_nodes` |
| `apps/api/bert/ingestion/xlsx_handler.py` | 15 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import NodeType, SourceFormat` |
| `apps/api/bert/agents/__init__.py` | 1 | `berthier, marshal` | Historical Reference Removal | Remove Marshal Berthier wording entirely | `"""Marshal Berthier pipeline agents."""` |
| `apps/api/bert/agents/__init__.py` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.ranger import ExtractedFact` |
| `apps/api/bert/agents/arbiter.py` | 7 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import Document` |
| `apps/api/bert/agents/chronos.py` | 9 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import ASTNode, Document, NodeType, SourceFormat` |
| `apps/api/bert/agents/chronos.py` | 10 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.verification.citation_gate import assess_quote_strength` |
| `apps/api/bert/agents/controller.py` | 10 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.base import SessionFactory` |
| `apps/api/bert/agents/controller.py` | 11 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import JobExecution` |
| `apps/api/bert/agents/envoy.py` | 9 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.arbiter import resolve_conflicts` |
| `apps/api/bert/agents/envoy.py` | 10 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.ranger import ExtractedFact` |
| `apps/api/bert/agents/envoy.py` | 11 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import Document, PriorityTier, VerificationStatus, WorkItem` |
| `apps/api/bert/agents/envoy.py` | 12 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.verification.citation_gate import VerificationResult` |
| `apps/api/bert/agents/envoy.py` | 13 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.verification.metrics import compute_work_item_metrics` |
| `apps/api/bert/agents/envoy.py` | 165 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"# BERT Executive Review Summary",` |
| `apps/api/bert/agents/envoy.py` | 245 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"# BERT Executive Review Summary",` |
| `apps/api/bert/agents/pipeline.py` | 1 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `"""Deterministic implementation of the seven-stage regiment with locator propagation."""` |
| `apps/api/bert/agents/pipeline.py` | 20 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.arbiter import resolve_conflicts` |
| `apps/api/bert/agents/pipeline.py` | 21 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.chronos import analyze_versions, select_temporal_conflict_pairs` |
| `apps/api/bert/agents/pipeline.py` | 22 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.controller import JobController` |
| `apps/api/bert/agents/pipeline.py` | 23 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.envoy import build_executive_summary, synthesize_verified_output` |
| `apps/api/bert/agents/pipeline.py` | 24 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.quartermaster import categorize_nodes` |
| `apps/api/bert/agents/pipeline.py` | 25 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.ranger import ExtractedFact` |
| `apps/api/bert/agents/pipeline.py` | 26 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.scout import rescue_regions` |
| `apps/api/bert/agents/pipeline.py` | 27 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.vanguard import score_nodes` |
| `apps/api/bert/agents/pipeline.py` | 28 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.config import settings` |
| `apps/api/bert/agents/pipeline.py` | 29 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.inference.runtime import InferenceRuntime, runtime_profile` |
| `apps/api/bert/agents/pipeline.py` | 30 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.docling_parser import IngestionResult, ParsedNode, extract_pdf_region_text` |
| `apps/api/bert/agents/pipeline.py` | 31 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import (` |
| `apps/api/bert/agents/pipeline.py` | 43 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.verification.citation_gate import (` |
| `apps/api/bert/agents/pipeline.py` | 51 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.verification.metrics import compute_work_item_metrics` |
| `apps/api/bert/agents/quartermaster.py` | 8 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import ASTNode` |
| `apps/api/bert/agents/scout.py` | 7 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.ingestion.docling_parser import ParsedNode` |
| `apps/api/bert/agents/vanguard.py` | 7 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import ASTNode, PriorityTier` |
| `apps/api/bert/models/__init__.py` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import (` |
| `apps/api/bert/models/base.py` | 11 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.config import settings` |
| `apps/api/bert/models/documents.py` | 1 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `"""Typed SQLAlchemy models and domain enums for the BERT data contract."""` |
| `apps/api/bert/models/documents.py` | 13 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.base import Base` |
| `apps/api/bert/models/documents.py` | 186 | `regiment` | Metaphor & Pipeline Wording | Replace regiment with pipeline | `"""Durable checkpoint cursor for a resumable regiment execution."""` |
| `apps/api/bert/verification/citation_gate.py` | 14 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.config import settings` |
| `apps/api/bert/verification/citation_gate.py` | 15 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.models.documents import PriorityTier, VerificationStatus` |
| `apps/api/bert/api/main.py` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.main import app, manager, startup` |
| `apps/api/bert/api/websocket.py` | 10 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.agents.pipeline import EventSink` |
| `apps/api/bert/inference/__init__.py` | 3 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.inference.runtime import InferenceRuntime, RuntimeProfile, runtime_profile` |
| `apps/api/bert/inference/runtime.py` | 10 | `bert` | Documentation / Comments | Rebrand to ShieldStaff | `from bert.config import settings` |


## 4. Post-Migration Verification & Allowed Aliases Audit

### 4.1 Verification Search Audit
- `git grep -inE "(berthier|marshal|louis-alexandre)"`: **0 matches** (100% purged).
- `git grep -in "Zero Hallucination Engine"`: **0 matches** (100% purged).
- User-facing brand and monogram: Monogram "B" replaced by "S" (Shield) across all rail, sidebar, and header navigation elements with identical pixel dimensions (`w-10 h-10`, `w-7 h-7`, `w-8 h-8`) guaranteeing zero layout shift.
- Browser document `<title>` set to `ShieldStaff — Enterprise Document Intelligence`, SVG Shield favicon configured, meta tags updated.
- Exported artifacts: XLSX title and author set to `ShieldStaff`, sheet name `ShieldStaff_Verified_Findings`, Markdown executive summaries header `# ShieldStaff Executive Review Summary`.

### 4.2 Allowed Intentional Backward-Compatible Invariants
1. **`ResolvedByTier.TIER2_SLM_REGIMENT`**: Retained in `apps/api/bert/models/documents.py` to preserve existing database schemas, verification calculations, and API consumers.
2. **`run_pipeline = run_regiment`**: Backward-compatible alias in `apps/api/bert/agents/pipeline.py`.
3. **`apps/api/shieldstaff`**: Symlink pointing to `apps/api/bert` enabling both `from shieldstaff...` and `from bert...` imports without breaking existing external test harness references.
4. **Theme & Workspace Storage Aliases**: Web frontend checks `shieldstaff-theme` first, falls back to `bert-theme`, and writes to both; similarly checks `shieldstaff-workspace` first, falls back to `bert-workspace`, and writes to both.
5. **Environment Configuration**: API configuration accepts `SHIELDSTAFF_*` keys, and transparently falls back to `BERT_*` keys with a deprecation warning.
6. **SQLite Database Fallback**: Defaults to `sqlite+aiosqlite:///./shieldstaff.db`, but falls back to `bert.db` if `bert.db` exists and `shieldstaff.db` does not.

### 4.3 Test Suite Verification Results
- **Backend Pytest**: `101 passed, 0 failed` in 77.96s (`cd apps/api && .venv/bin/pytest tests/ -q`).
- **Frontend Build**: `npm run build` succeeded with 0 errors across 1,646 modules in 1.42s.
- **Frontend TypeScript Unit Tests**: `phase2`, `phase3`, `phase4`, `phase5`, `phase6`, `phase7`, `phase8`, and `challenger_m1` all passed (1,792+ assertions).
- **Headless Chrome E2E Suites**:
  - `test_phase2_e2e.js`: 4/4 passed
  - `test_phase3_e2e.js`: 5/5 passed
  - `test_phase4_e2e.js`: 4/4 passed
  - `test_phase5_e2e.js`: 5/5 passed
  - `test_phase6_e2e.js`: 5/5 passed
  - `test_phase7_e2e.js`: 4/4 passed
  - `test_phase8_e2e.js`: 4/4 passed
  - `test_challenger_m1_2_frontend.js`: 3/3 passed
  - `runner.js --tier=1`: 60/60 passed in 185.74s
