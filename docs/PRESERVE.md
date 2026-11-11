# BERT Stabilization Baseline — Feature & Contract Preservation Inventory

> **Baseline Snapshot:** Branch `polish/stabilization` (clean git working tree prior to documentation).  
> **Runtime Observed at Baseline:** Backend API running on `http://localhost:8000` (`GET /health` -> `200 OK`, `{"status":"ok","inference_mode":"demo_simulator","db_mode":"sqlite_async"}`); Frontend Vite dev server (`http://localhost:5173`) not running at baseline.  
> **Purpose:** Authoritative inventory of every working feature, entry point, HTTP/WS endpoint, UI route/deep link, store action, and test contract to **preserve** across stabilization phases, plus a clearly separated section of **Known Baseline Discrepancies / Spec Conflicts Observed** so fixes do not break working invariants.

---

## Quick Runtime & Entrypoint Reference

| Layer | File Path | Key Symbols & Line Ranges |
| :--- | :--- | :--- |
| API Entrypoint | `apps/api/bert/main.py` | `lifespan` (`55-58`), `app` (`61`), `manager` (`69`), `job_controller` (`70`), `startup` (`73-86`), `health` (`88-90`) |
| API Compat Re-export | `apps/api/bert/api/main.py` | Re-exports `app`, `manager`, `startup` from `bert.main` (`3-5`) |
| API Config | `apps/api/bert/config.py` | `Settings` (`9-19`), `settings` (`21`) (`inference_mode`, `db_mode`, `database_url`, `api_origin`, `vllm_text_url`, `vllm_vision_url`, `groq_api_key`, `anthropic_api_key`) |
| Local Storage State | `apps/api/bert/state.py` | `API_ROOT` (`14`), `DATA_DIR` (`15-16`, `apps/api/data`), `stored_source_path` (`19-23`) |
| Async SQLAlchemy Base | `apps/api/bert/models/base.py` | `Base` (`14-15`), `engine` (`18`), `SessionFactory` (`19-21`), `session_scope` (`24-28`) |
| Web Entrypoint | `apps/web/src/main.tsx` | `StrictMode` + `BrowserRouter` mounting `App` (`1-7`) |
| Web API Client | `apps/web/src/lib/api.ts` | `API_URL` (`3`, default `http://localhost:8000`), `request` (`5-9`), `bertApi` (`11-50`) |
| Vite Config | `apps/web/vite.config.ts` | Port `5173`, `@tailwindcss/vite`, `optimizeDeps.exclude: ["pdfjs-dist"]`, `worker.format: "es"` (`5-10`) |

---

## 1. 7-Agent Pipeline, Telemetry Streaming & Pause/Resume/Interrupt

### 1.1 Regiment Ordering & Orchestrator
- **Canonical Agent Sequence:** `Scout` -> `Quartermaster` -> `Chronos` -> `Vanguard` -> `Ranger` -> `Arbiter` -> `Envoy`
  - Backend: `AGENT_NAMES` (`apps/api/bert/agents/pipeline.py:40`), `AGENT_MODELS` (`41-49`, `Scout: "vision"`, others `"text"`), `JobController.agent_name` (`apps/api/bert/agents/controller.py:169-170`).
  - Frontend: `AGENTS` & `AGENT_ROLES` (`apps/web/src/store/simulatorService.ts:3-4`), re-exported by `apps/web/src/store/useBertStore.ts:6,14`.
- **Pipeline Orchestrator:** `run_regiment` (`apps/api/bert/agents/pipeline.py:239-465`)
  - Emits transitions via `_agent_transition` (`pipeline.py:97-148`) and writes `AuditLog` entries via `_audit` (`pipeline.py:72-94`).
  - Helper functions: `_tier_for_score` (`229-236`), `_category_for_question` (`468-478`), `_risk_score` (`481-490`), `_agent_message` (`493-503`), `_fact_node` (`506-519`).
  - **Dual Execution Paths inside `run_regiment`:**
    1. **Non-XLSX Corpus Path** (`pipeline.py:288-363`): Treats up to 250 `ASTNode`s as `DOCUMENT_FINDING` `WorkItem`s, enforces `ocr_confidence < 0.90` gate failure (`313-314`), runs `Scout`..`Envoy`, commits per node, emits `gate_check` and `work_item` events.
    2. **XLSX Questionnaire Path** (`pipeline.py:364-465`): Pairs an uploaded/demo `SourceFormat.XLSX` document's rows (`question_nodes`) against non-XLSX `source_nodes`, generates `QUESTIONNAIRE_ROW` `WorkItem`s, runs `run_verification_gate`, calls `Envoy` synthesis (`424`) or `hard_gate_fields` (`421, 430-434`).

### 1.2 Specialist Agent Modules
| Stage | Agent | File & Symbols | Current Working Behavior |
| :--- | :--- | :--- | :--- |
| 1 | **Scout** | `apps/api/bert/agents/scout.py`: `rescue_regions` (`10-21`) | Filters `ParsedNode` items with `ocr_confidence < 0.90` into geometry crop dicts (`page_number`, `bounding_box`, `ocr_confidence`, `verbatim_text`). |
| 2 | **Quartermaster** | `apps/api/bert/agents/quartermaster.py`: `categorize_nodes` (`11-28`); `pipeline.py:263-274` | Tags each `ASTNode.category_tags` (`Access Control`, `Cryptography`, `Data Retention`, `Liability & Indemnification`, `Security Operations` + `node_type`) and assigns `Document.category` (`Questionnaire`, `Cloud Config`, `Commercial Contract`, `Security Audit`) + `Document.sub_category`. |
| 3 | **Chronos** | `apps/api/bert/agents/chronos.py`: `analyze_versions` (`11-26`) | Marks `XLSX` documents `is_latest_version=True`; evaluates non-XLSX documents to identify newest `latest_filename`, sets `is_latest_version` and `superseded_by` (see Section 11 for mixed `date`/`datetime` bug). |
| 4 | **Vanguard** | `apps/api/bert/agents/vanguard.py`: `score_node` (`10-22`), `score_nodes` (`25-28`) | Assigns `ASTNode.priority_score` (`96` for `s3:*`/`wildcard`, `88` for `ocr_confidence < 0.90`, `70` for `mfa`/`encrypt`, else `50`) and maps `PriorityTier` (`P0_CRITICAL >= 85`, `P1_HIGH >= 65`, else `P2_MEDIUM`). |
| 5 | **Ranger** | `apps/api/bert/agents/ranger.py`: `ExtractedFact` (`8-16`), `RangerOutput` (`19-24`) | Strict Pydantic v2 `extra="forbid"` schemas with `fact_type`, `value`, `verbatim_quote`, `ast_node_id`, `confidence` (no prose fields). |
| 6 | **Arbiter** | `apps/api/bert/agents/arbiter.py`: `resolve_conflicts` (`10-14`) | Summarizes `latest_documents` vs `superseded_documents` (`resolved` boolean) based on `Document.is_latest_version`. |
| 7 | **Envoy** | `apps/api/bert/agents/envoy.py`: `synthesize_verified_output` (`9-16`) | Enforces `if not gate.passed: raise ValueError(...)`; synthesizes `"Verified corpus evidence indicates <value> [<fact_type>]; ..."` strictly from `ExtractedFact`s. |

### 1.3 Inference Runtime Adapter
- `apps/api/bert/inference/runtime.py`:
  - `RuntimeProfile` (`14-23`) & `runtime_profile()` (`26-56`): selects `"demo_simulator"` (`network_enabled=False`), `"local_vllm"` (`Qwen/Qwen2.5-14B-Instruct-AWQ`, `Qwen/Qwen2.5-VL-7B-Instruct-AWQ`), or `"cloud_burst"` (Groq `llama-3.1-8b-instant` + Anthropic `claude-3-5-sonnet` for `Arbiter`).
  - `InferenceRuntime.complete(agent, context)` (`59-114`): executes `_anthropic_complete` (`95-114`) or `_openai_compatible_complete` (`70-93`) when `network_enabled=True`.

### 1.4 Job Execution Controller & Pause/Resume/Interrupt Endpoints
- **ORM Model:** `JobExecution` (`apps/api/bert/models/documents.py:159-178`) stores `status`, `current_agent_index`, `current_document_id`, `current_node_index`, `checkpoint_id`, `completed_step_outputs`, `user_override_instructions`, `error_message`.
- **In-Memory + DB Controller:** `TaskExecutionState` (`apps/api/bert/agents/controller.py:17-32`) and `JobController` (`35-199`):
  - `create` (`43-48`), `get` (`50-73`, hydrates from `JobExecution` table if absent from memory), `request_interrupt` (`75-83`, sets `PAUSING` + `pause_requested`), `resume` (`85-99`, appends `instruction` to `user_override_instructions`, clears `pause_requested`, sets `resume_requested`), `before_step` (`101-132`, awaits `resume_requested.wait()` cleanly between atomic steps), `mark_step` (`134-138`), `complete` (`140-144`), `fail` (`146-151`), `snapshot` (`153-166`), `_persist` (`178-199`).
- **HTTP Endpoints (`apps/api/bert/main.py` & `bert/api/schemas.py`):**
  - `POST /api/v1/jobs/demo` (`main.py:300-305`) -> starts async `_run_demo_job` (`352-366`), returns `JobExecutionResponse` (`schemas.py:126-137`).
  - `POST /api/v1/jobs/start` (`main.py:308-321`) -> accepts optional `JobStartRequest(document_id)` (`schemas.py:145-146`), starts async `_run_uploaded_job` (`369-386`).
  - `GET /api/v1/jobs/{job_id}` (`main.py:389-394`) -> returns current `JobExecutionResponse`.
  - `POST /api/v1/jobs/{job_id}/interrupt` (`main.py:397-403`) -> calls `request_interrupt(job_id)`.
  - `POST /api/v1/jobs/{job_id}/pause` (`main.py:406-410`) -> named alias calling `interrupt_job(job_id)`.
  - `POST /api/v1/jobs/{job_id}/resume` (`main.py:413-419`) -> accepts `JobResumeRequest` (`schemas.py:140-142`, `instruction` or alias `user_instruction`), calls `job_controller.resume(job_id, request.instruction)`.

### 1.5 WebSocket Streaming, Reactive Frontend State & Local Simulator
- **Backend WebSocket:**
  - `EventSink` (`apps/api/bert/agents/pipeline.py:52-69`) and `WebSocketManager` (`apps/api/bert/api/websocket.py:13-32`).
  - Routes: `WS /ws` & `WS /ws/events` (`apps/api/bert/main.py:93-101`).
  - Broadcast event payloads:
    - `agent_transition` (`pipeline.py:109-121, 133-145`): `type`, `agent_name`, `status` (`"running"` | `"completed"`), `latency_ms`, `input_hash`, `output_hash`, `document_id`, `node_index`, `message`.
    - `gate_check` (`pipeline.py:354-356, 411-419`): `type`, `passed`, `match_score`, `logprob`, `input_hash`, `output_hash`.
    - `work_item` (`pipeline.py:357, 464`): `type`, `id`, `status`.
    - Job lifecycle events (`controller.py:82, 98, 119-125, 131, 144, 151`): `JOB_PAUSING`, `JOB_PAUSED` (includes `checkpoint_id`, `paused_at_agent`, `file`, snapshot fields), `JOB_RESUMING` (includes `instruction`), `JOB_RESUMED`, `JOB_COMPLETED`, `JOB_FAILED` (includes `message`).
- **Frontend WebSocket & Store (`0` `setInterval` polling):**
  - `useWebSocket` (`apps/web/src/hooks/useWebSocket.ts:7-25`): connects `${API_URL}/ws` with exponential backoff (300ms..5000ms), parses JSON `PipelineEvent`, dispatches `appendEvent(event)`. Invoked once in `App.tsx:83`.
  - `bertApi` job methods (`apps/web/src/lib/api.ts:31-44`): `startJob`, `startDemo`, `getJob`, `pause`, `interrupt`, `resume`.
  - `jobExecutionSlice` (`apps/web/src/store/jobExecutionSlice.ts`): `startJob` (`38-47`), `pauseJob` (`49-71`), `resumeJob` (`73-104`), `appendEvent` (`179-211`, FIFO capped at 250 items, triggers `refresh()` on `JOB_COMPLETED`/`status === "COMPLETED"`).
- **Offline Simulator Fallback (`apps/web/src/store/simulatorService.ts`):**
  - `pauseLocalSimulation` (`17-19`), `resumeLocalSimulation` (`21-25`), `isLocalPaused` (`13-15`), `runLocalMultiAgentReview` (`236-289`, emits 7 `agent_transition` running/completed pairs at 550ms cadence and respects pause Promise gate).
- **UI Controls:**
  - `WorkspacePage.tsx:113-138`: Top telemetry pill + `⏸ Pause Agent` / `▶ Resume`.
  - `CopilotStream.tsx:64-76, 161-182, 263-285, 457-503`: Composer Pause/Resume, steering prompt submission when `isRunning`, paused checkpoint banner, live `events.slice(-15)` telemetry cards.

---

## 2. SHA-256 Checksums, Source Tree / AST Decomposition & Audit Ledger

### 2.1 ORM Persistence Contract
- `apps/api/bert/models/documents.py`:
  - Enums: `SourceFormat` (`21-26`: `PHYSICAL_SCAN`, `DIGITAL_PDF`, `XLSX`, `JSON_CONFIG`, `TEXT`), `PriorityTier` (`29-33`: `P0_CRITICAL`, `P1_HIGH`, `P2_MEDIUM`, `P3_LOW`), `NodeType` (`36-45`: `SECTION`, `CLAUSE`, `TABLE_ROW`, `JSON_RULE`, `STAMP_NOTE`, `HEADING`, `PARAGRAPH`, `LIST_ITEM`, `XLSX_ROW`), `VerificationStatus` (`48-51`: `VERIFIED`, `NEEDS_HUMAN_VERIFICATION`, `INSUFFICIENT_EVIDENCE`), `ResolvedByTier` (`54-57`: `TIER1_CACHE`, `TIER2_SLM_REGIMENT`, `TIER3_ARBITER`).
  - Tables: `Document` (`60-87`), `ASTNode` (`90-112`, `ForeignKey("documents.id", ondelete="CASCADE")`), `WorkItem` (`115-138`), `AuditLog` (`141-156`, column `"metadata"` mapped to `metadata_json`), `JobExecution` (`159-178`).
  - `startup()` (`apps/api/bert/main.py:73-86`) runs `Base.metadata.create_all` plus idempotent SQLite/SQL column checks for `documents.file_size_bytes` and `audit_log.metadata`.

### 2.2 Multi-Format Ingestion Router & Parsers
- **Router & Allowlists (`apps/api/bert/ingestion/router.py`):**
  - `ALLOWED_EXTENSIONS` (`13`: `.pdf`, `.xlsx`, `.json`, `.txt`, `.md`), `ALLOWED_CONTENT_TYPES` (`14-24`), `safe_filename` (`27-29`), `parse_file` (`32-42`), `stream_file` (`45-56`).
- **PDF / TXT / MD Parser (`apps/api/bert/ingestion/docling_parser.py`):**
  - `ParsedNode` (`16-27`), `IngestionResult` (`31-38`), `DoclingParser` (`49-149`: `parse` `60-70`, `stream_nodes` `72-75`, `_iter_nodes` `77-121`, `_extract_pages` `123-137`, `_node_type` `139-149`).
  - Extracts `%PDF-` pages via `pypdf.PdfReader` (`125-134`) or splits UTF-8 text on `\f` / `--- PAGE ---` (`135-137`).
  - Assigns `ocr_confidence = 0.81` for `[LOW_CONFIDENCE]` or stamp/handwritten lines (`89-92`), `0.86` for short `<8`-char non-heading lines (`91-92`), and `1.0` otherwise.
- **XLSX Parser & Write-Back (`apps/api/bert/ingestion/xlsx_handler.py`):**
  - `XLSXHandler` (`15-90`): `parse` (`21-29`), `stream_nodes` (`31-65`, `openpyxl` `read_only=True, data_only=True`, emits `NodeType.XLSX_ROW` with `section_path="{sheet_name} > Row {row_index}"` and `structured_payload={"headers", "row_data", "sheet_name", "row_index"}`), `write_back` (`67-90`).
- **O(1) Streaming JSON Parser (`apps/api/bert/ingestion/json_streamer.py`):**
  - `DEFAULT_MAX_PAYLOAD_BYTES = 65536` (`16`), `JSONStreamer` (`19-79`: `stream_nodes` `25-69` using `ijson.parse` without materializing full root JSON, UTF-8 safe 64KB chunk splitting with `#chunk-N`, `parse` `71-79`), `_json_path` (`82-96`, preserves array indices `[i]`).

### 2.3 SHA-256 Completeness & Audit Ledger
- **Ingestion Checksum Calculation & Verification:**
  - `checksum_for_nodes` (`apps/api/bert/ingestion/docling_parser.py:41-46`): SHA-256 over UTF-8 `verbatim_text` ordered by `node_order`.
  - `persist_ingestion_stream` (`apps/api/bert/agents/pipeline.py:168-226`): streams parser batches (`batch_size=250`), updates rolling SHA-256 digest (`195-221`), sets `Document.ast_checksum`, `total_pages`, `total_ast_nodes`, `processing_status` (`"COMPLETED"` or `"FAILED"`).
  - `verify_ingestion_completeness` (`apps/api/bert/ingestion/checksum.py:16-37`, `_update_digest` `40-42`): streams persisted `ASTNode.verbatim_text` ordered by `node_order`, recomputes SHA-256 digest, marks `Document.processing_status = "FAILED"` on mismatch.
  - `payload_hash` (`apps/api/bert/verification/citation_gate.py:139-142`): canonical sorted-key JSON SHA-256 used for all `AuditLog.input_hash` / `output_hash` values.
  - Client offline checksum: `checksum()` (`apps/web/src/store/simulatorService.ts:109-115`) via `crypto.subtle.digest("SHA-256", ...)`.
- **Audit Ledger Writers & Endpoints:**
  - Writers: `_audit` (`pipeline.py:72-94`), `resolve_escalation` (`main.py:464-475`), `sandbox_check` (`main.py:485-499`).
  - Endpoint: `GET /api/v1/audit-log` (`apps/api/bert/main.py:233-237`) -> returns up to 250 `AuditResponse` rows (`apps/api/bert/api/schemas.py:102-115`) ordered newest-first.
  - UI Display: `RightInspectorDrawer` `"Hashes"` tab (`RightInspectorDrawer.tsx:304-341`, displays `ast_checksum`, `file_size_bytes`, `processing_status`, `total_ast_nodes`), `ResultsPage` header badge (`ResultsPage.tsx:227-230`).

---

## 3. `rapidfuzz >= 97%` Verification Gate, Logprob Gate & Sandbox Check

### 3.1 Deterministic Anti-Hallucination Gate (`apps/api/bert/verification/citation_gate.py`)
- **Constants & Result Model:**
  - `CITATION_THRESHOLD = 97.0` (`16`)
  - `LOGPROB_THRESHOLD = 0.92` (`17`)
  - `CRITICAL_ENTITY_TYPES = {"DATE", "AMOUNT", "PARTY_NAME", "JURISDICTION", "LIABILITY_CAP"}` (`18-20`)
  - `INSUFFICIENT_EVIDENCE_OUTPUT = "Insufficient evidence in uploaded corpus — flagged for manual review."` (`21`)
  - `VerificationResult` (`25-34`)
- **Gate Functions:**
  - `verify_citations(claimed_quotes, source_texts, *, threshold=97.0)` (`37-61`): normalizes whitespace (`_normalize_whitespace` `64-66`) and runs `rapidfuzz.fuzz.partial_ratio`.
  - `verify_logprobs(token_logprobs, *, threshold=0.92)` (`75-95`, `_probability` `69-72`): accepts `probability` or `math.exp(logprob)` for `CRITICAL_ENTITY_TYPES`.
  - `run_verification_gate(claimed_quotes, source_texts, token_logprobs=None)` (`98-125`): returns `VERIFIED` / `P2_MEDIUM` if both pass; otherwise hard-fails to `INSUFFICIENT_EVIDENCE` / `P0_CRITICAL` / `INSUFFICIENT_EVIDENCE_OUTPUT`.
  - `hard_gate_fields(result)` (`128-136`).

### 3.2 Sandbox Endpoint
- `POST /api/v1/sandbox/check` (`apps/api/bert/main.py:481-527`), `SandboxRequest` & `SandboxResponse` (`apps/api/bert/api/schemas.py:165-178`):
  - `test="citation"`: tests `request.quote` via `run_verification_gate` against `"Access control requires multifactor authentication for privileged accounts."`
  - `test="logprob"`: validates `request.probability >= 0.92`.
  - `test="checksum"`: verifies non-empty `expected_checksum == actual_checksum`.
  - Persists `AuditLog` with `agent_name="Citation Gate"`, `action=f"SANDBOX_{request.test.upper()}"`, `metadata_json={"sandbox": True}`.

### 3.3 Work Items, Search & Escalation Resolution
- **Backend Endpoints (`apps/api/bert/main.py`):**
  - `GET /api/v1/work-items` (`188-204`): optional query params `priority_tier`, `category`, `verification_status`, `resolved_by_tier`; ordered by `priority_score DESC, created_at ASC`.
  - `GET /api/v1/search?query=...` (`207-221`): `ILIKE` over `prompt_or_question`, `category`, `fluent_output` (limit 25).
  - `GET /api/v1/work-items/{work_item_id}` (`224-230`).
  - `GET /api/v1/escalations` (`422-439`): returns `EscalationResponse` (`schemas.py:149-155`) for items where `verification_status != VERIFIED`.
  - `POST /api/v1/escalations/{work_item_id}/resolve` (`442-478`): validates `EscalationActionRequest` (`schemas.py:158-162`: `action` in `{"manual_correction", "retry", "skip", "approve", "counsel"}`), updates `WorkItem`, writes `AuditLog` (`agent_name="Human Review"`).
- **Frontend API & Store Actions:**
  - `bertApi.getWorkItems`, `bertApi.getEscalations`, `bertApi.resolve` (`apps/web/src/lib/api.ts:13, 20, 45-49`).
  - `jobExecutionSlice.ts`: `updateWorkItem` (`106-110`), `resolveWorkItem` (`112-170`, handles online API + offline deterministic actions `manual_correction`, `retry`, `not_applicable`/`skip`, `counsel`, `approve`), `batchResolve` (`172-177`).
  - `copilotSlice.ts`: `resolveEscalation` (`89-96`).

---

## 4. Copilot Stream & Bento Canvas Modes + Copilot Q&A

### 4.1 Workspace Container & Mode Switching
- `apps/web/src/pages/WorkspacePage.tsx` (`19-178`):
  - Calls `refresh()` on mount (`34-36`).
  - Segmented toggle (`85-109`) calls `setMode("stream" | "canvas")` (`62-68`), rendering `<CopilotStream />` or `<BentoCanvas />` alongside `<RightInspectorDrawer />` (`171-174`).
  - Displays live caution summary badges (`49-53, 142-156`) and `"View Results Report"` button navigating to `/results` (`158-164`).

### 4.2 Mode A: Copilot Stream (`apps/web/src/components/copilot/CopilotStream.tsx`)
- **Composer & Controls (`118-193`):** Multi-line prompt input (`Enter` submits via `handleKeyDown` `78-83`), `+ Upload File` (`85-90, 135-148`), Playbook badge (`150-153`), `7-Agent Strict Gate (≥97%)` pill (`155-158`), inline `Pause Agent` / `Resume` (`161-182`).
- **5 Quick Workflow Squircles (`196-242`):** `Auto-Answer .XLSX`, `Flag Critical Risks`, `Verify Scan Readability`, `Check Policy Conflicts`, `Executive Summary`.
- **3 Example Prompt Pills (`245-260`).**
- **Human Escalation Cards (`295-388`):** Inline manual override (`323-346` -> `handleManualResolve` `92-97`), `Accept Vision Rescue Text` (`approve`, `360-371`), `Flag for Legal & Skip` (`counsel`, `373-384`).
- **Q&A Answer Cards & Clickable Citation Badges (`391-449`):** Renders `chatMessages` with status badge (`VERIFIED (N%)` / `INSUFFICIENT EVIDENCE`) and clickable citation buttons (`418-443`) calling `inspectCitation(docId, page, bbox, nodeId)`.
- **Telemetry Activity Stream (`457-503`):** Renders `events.slice(-15)`.

### 4.3 Mode B: Bento Canvas (`apps/web/src/components/copilot/BentoCanvas.tsx`)
- **Header Filter Buttons (`80-105`):** `All Intelligence`, `Critical Risks`, `Verified Safe` (`selectedBentoTab` `41`).
- **4 Bento Intelligence Cards:**
  1. `Corpus Architecture` (`111-159`): lists `documents`; clicking selects document via `setSelectedDocument(doc.id)` (`133`).
  2. `Critical Risks & Contradictions` (`162-210`): lists `criticalItems`; clicking calls `inspectCitation` when `verified_citations[0]` exists (`182-191`).
  3. `Human Action Queue` (`213-262`): static preview card with `"Open in Copilot Stream"` navigating to `/workspace` (`239`).
  4. `Verified Evidence Clauses` (`265-311`): lists top 5 `verifiedItems`; clicking calls `inspectCitation` (`285-294`).
- **Floating Docks:** Bottom-left chat dock (`316-336`, calls `askCopilot`) and bottom action pill (`339-363`, `Chat` -> `/workspace`, `Inspect Quotes`, `+ Export` -> `/results`).

### 4.4 Copilot Q&A (Backend + Offline Fallback)
- **Backend (`apps/api/bert/main.py`):**
  - `POST /api/v1/copilot/chat` (`146-185`): accepts `CopilotChatRequest(prompt, document_id)` (`schemas.py:81-83`), filters `ASTNode` joined with `Document` excluding `SourceFormat.XLSX` (`152`), optionally filters by `document_id` (`155-156`), ranks via `_rank_copilot_nodes` (`600-620`, using `_copilot_terms` `591-597` with `mfa`/`2fa`/`multifactor` synonym folding), verifies `selected_node.verbatim_text` through `run_verification_gate` (`166-168`), returns `CopilotChatResponse` (`schemas.py:95-99`) with inline `[filename:page]` citation or `_insufficient_copilot_response()` (`623-629`).
- **Frontend (`apps/web/src/store/copilotSlice.ts` & `simulatorService.ts`):**
  - `askCopilot` (`copilotSlice.ts:27-87`, history capped at 50 via `slice(-49)`): tries `bertApi.askCopilot` (`api.ts:21-25`) if `backendAvailable`, falls back to `localCopilotSearch` (`simulatorService.ts:49-107`, `stemToken`/`queryTerms` `34-42`, threshold `>= 50%`).

---

## 5. Evidence Inspector (Quotes, AST, Visual Viewers & Audit)

### 5.1 Inspector Store State & Dual-Signature Citation API
- `apps/web/src/store/evidenceInspectionSlice.ts`:
  - Types: `ActiveInspectorTab` (`5`: `"quotes" | "visual" | "audit" | "ast"`), `ActiveViewMode` (`6`: `"visual" | "ast"`), `ActiveHighlightBox` (`8-16`: `{ x0, y0, x1, y1, nodeId, pageNumber, confidence }`).
  - Actions: `setActiveInspectorTab` (`44`), `setActiveHighlightBox` (`46`), `setZoomLevel` (`48`, clamped `0.5`–`3.0`), `setActiveViewMode` (`50`), `setSelectedNode` (`52-76`, resolves parent `documentId` across `nodesByDocument` or `workItems`, updates `activeHighlightBox`, lazy-loads nodes if needed), `inspectCitation` (`78-134`, atomically switches `activeInspectorTab="visual"`, `activeViewMode="visual"`, `selectedDocumentId`, `selectedNodeId`, `activeHighlightBox`; supports both `CitationMatch` object and positional `(docIdOrFilename, page, bbox, nodeId)` signatures).

### 5.2 Inspector Drawer & 4 Tabs (`apps/web/src/components/copilot/RightInspectorDrawer.tsx`)
- **Tab Bar (`89-122`):** `Verified Quotes` (`"quotes"`), `Source AST` (`"ast"`), `Viewer` (`"visual"`), `Hashes` (`"audit"`).
- **Search & Filter Pills (`125-155`):** Free-text `searchQuery` + 6 `FilterPill` buttons (`All`, `P0 Critical`, `P1 Review`, `Verified`, `Tables`, `JSON Rules`).
- **Tab 1 — `Verified Quotes` (`159-244`):** Renders `filteredWorkItems`; clicking a card with a citation resolves node bounding box from `nodesByDocument` and calls `inspectCitation`.
- **Tab 2 — `Source AST` (`247-282`):** Renders `docNodes` with `node_type`, `section_path`, `verbatim_text`, `ocr_confidence`, and bounding-box availability tag; clicking calls `setSelectedNode(node.id)`.
- **Tab 3 — `Viewer` (`285-301`):** Dispatches `.xlsx` -> `<SpreadsheetViewer />`, `.json` -> `<JsonTreeViewer />`, all others -> `<PdfViewer />`.
  - **`PdfViewer` (`apps/web/src/components/copilot/PdfViewer.tsx:16-180`):**
    - Byte source: `documentFiles[id]` (`File.arrayBuffer()`) or `bertApi.getFile(id)` (`GET /api/v1/documents/{id}/file`, `main.py:118-143`, inline `FileResponse`).
    - Renders via `pdfjs-dist` (`getDocument`, `GlobalWorkerOptions.workerSrc`, `PdfPage` `125-180`).
    - Toolbar: Zoom out/in (`0.5`–`3.0`), `%` readout, `Fit width` (`fitToWidth` `94-97`), Previous/Next page (`moveToPage` `88-92`), `IntersectionObserver` scroll page tracking (`67-77`).
    - SVG Highlight Overlay (`176-178`): `<svg className="pdf-overlay pdf-overlay-{verified|warning|low}">` with `<rect id="pdf-highlight-{nodeId}" className="pdf-highlight-rect" ... />`, `.pdf-highlight-anchor`, and `.pdf-highlight-tooltip` auto-scrolled into view (`79-86, 170-172`).
  - **`SpreadsheetViewer` (`apps/web/src/components/copilot/SpreadsheetViewer.tsx:18-95`):**
    - Reads `.xlsx` bytes via `XLSX.read` (`33-39`), builds `sheets` + `activeSheet` tabs (`role="tablist"` / `role="tab"`, `64-66`), renders table with `columnName(index)` (`A..Z`, `86-95`), row click invokes `setSelectedNode(rowNode.id)` (`79`).
  - **`JsonTreeViewer` (`apps/web/src/components/copilot/JsonTreeViewer.tsx:12-106`):**
    - Parses JSON bytes (`26-30`), renders breadcrumb bar (`formatBreadcrumb` `84-91`) + recursive collapsible `JsonBranch` (`51-71`), maps clicks via `pathsMatch` (`93-99`) to `setSelectedNode(node.id)` (`44-47`).
- **Tab 4 — `Hashes` (`304-341`):** Displays SHA-256 verification status card and per-document `ast_checksum`, `file_size_bytes`, `processing_status`, `total_ast_nodes`.

---

## 6. Results Page (`apps/web/src/pages/ResultsPage.tsx`)

- **Top Header Bar (`222-267`):** Title `"Executive Compliance & Risk Report"`, `"SHA-256 Zero-Data-Loss Verified"` badge, `"Reset Filters"` (`240-249`), `"Export Answered .XLSX"` (`251-257`), `"Download Summary Report"` (`259-265`), transient status feedback (`copiedNotification` `234-238`).
- **Category Legend (`274-284`):** Renders first 6 entries from `CATEGORY_COLORS` (`29-39`).
- **Envoy Executive Summary Card (`287-313`):** Displays `complianceRate` Defensibility Score (`157`) and summary callout prose.
- **Stacked Visual Breakdown Chart (`316-372`):** Aggregates `chartData` (`87-149`) grouped by `"documents" | "categories"` and segmented by `"category" | "caution"`, with hover tooltips (`339-341`).
- **Contributing Findings & Verbatim Evidence Table (`375-532`):**
  - Client-side `searchFilter` (`387-396`) + `filteredItems` (`69-84`).
  - Columns: Priority badge (`P0_CRITICAL`..`P3_LOW`), Category, Question/Clause, Fluent Answer (with inline `Edit` -> `Save` calling `handleInlineResolve` `212-217` -> `resolveWorkItem(id, "manual_correction", ...)`), conditional Exact Verbatim Quote (clickable, calling `inspectCitation` `480-494`), Match %, and Action button (`516-524`).
- **Insight Configuration Sidebar (`536-675`):**
  - `<select>` filters: `Data Source` (`selectedDocFilter`: `"ALL"` or `doc.id`), `Metric` (`metricType`: `"count" | "confidence"`), `Grouped By` (`groupedBy`: `"documents" | "categories"`), `Segmented By` (`segmentedBy`: `"category" | "caution"`).
  - Toggle switches: `onlyCritical` (`620-632`), `showExactQuotes` (`640-652`), `enforceLatestVersion` (`660-672`).

---

## 7. XLSX Export & MD/Summary Export

| Surface | Entry Point | Format & Mechanism | Behavior |
| :--- | :--- | :--- | :--- |
| Backend XLSX Export | `GET /api/v1/export/questionnaire.xlsx` (`apps/api/bert/main.py:530-552`) | `openpyxl` via `XLSXHandler.write_back` (`apps/api/bert/ingestion/xlsx_handler.py:67-90`) | Queries all `WorkItem`s ordered by `created_at`, appends `AI_Response` and `AI_Status` columns to `apps/api/data/Enterprise_Security_Questionnaire.xlsx`, returns `FileResponse` (`BERT_Completed_Questionnaire.xlsx`). |
| Backend Markdown Export | `GET /api/v1/export/summary.md` (`apps/api/bert/main.py:555-570`) | `PlainTextResponse` (`.md` text) | Queries all `WorkItem`s ordered by `priority_score DESC`, outputs `# BERT Executive Review Summary` with counts and bulleted findings. |
| Frontend XLSX Export | `ResultsPage.tsx` `handleExportXlsx` (`160-180`) | Client-side `xlsx` (`json_to_sheet`, `writeFile`) | Exports `filteredItems` to `BERT_Compliance_Report_YYYY-MM-DD.xlsx` (sheet `"BERT_Verified_Findings"`). |
| Frontend Summary Export | `ResultsPage.tsx` `handleDownloadSummary` (`182-210`) | Client-side `Blob` download (`text/plain`) | Exports counts + critical findings list as `BERT_Executive_Summary_YYYY-MM-DD.txt`. |
| Sidebar Export CTA | `AttioSidebar.tsx:72-74, 275-281` | `navigate("/results")` | `"Export Completed .XLSX"` navigates to `/results` (does not directly download). |

*Note: `apps/web/src/lib/api.ts` currently does not include client wrappers for `/api/v1/export/questionnaire.xlsx` or `/api/v1/export/summary.md`.*

---

## 8. Active Corpus Loader, File Upload / Ingest & Investor Demo Case

### 8.1 Active Corpus Loader & Document Endpoints
- **Backend:**
  - `GET /api/v1/documents` (`apps/api/bert/main.py:104-108`) -> `list[DocumentResponse]` ordered by `desc(Document.created_at)`.
  - `GET /api/v1/documents/{document_id}/nodes` (`main.py:111-115`) -> `list[ASTNodeResponse]` ordered by `ASTNode.node_order`.
  - `GET /api/v1/documents/{document_id}/file` (`main.py:118-143`) -> `FileResponse` inline stream with MIME lookup (`.pdf`, `.xlsx`, `.json`, `.txt`, `.md`).
- **Frontend Store & UI:**
  - `refresh()` (`apps/web/src/store/jobExecutionSlice.ts:213-227`): fetches `getDocuments()` + `getWorkItems()`, sets `backendAvailable: true`, preserves `selectedDocumentId` if still present or selects `documents[0]`, lazy-loads nodes for `selectedDocumentId`.
  - `setSelectedDocument` / `selectDocument` (`apps/web/src/store/documentSlice.ts:25-32`) & `loadNodes` (`38-58`).
  - `AttioSidebar.tsx:200-253`: `Active Corpus` list with `getFormatBadge` (`57-70`: `SCN` rose, `XLS` emerald, `JSN` amber, `PDF` blue), action indicator dot (`215-217, 242-247`), file count (`203`).

### 8.2 File Upload & Ingest
- **Backend (`apps/api/bert/main.py`):**
  - `POST /api/v1/documents/upload` (`276-278`) and `POST /api/v1/ingest` (`281-283`) both call `_upload_document` (`240-273`).
  - Validates extension/content type against `ALLOWED_EXTENSIONS` / `ALLOWED_CONTENT_TYPES`, streams file in 1MB chunks to `stored_source_path(str(document_id), filename)` in `apps/api/data/`, invokes `persist_ingestion_stream` (`pipeline.py:168-226`) + `verify_ingestion_completeness` (`checksum.py:16-37`), records `file_size_bytes`.
- **Frontend (`apps/web/src/store/documentSlice.ts`):**
  - `uploadFile(file)` (`60-108`): online path calls `bertApi.upload(file)` -> `bertApi.startJob(document.id)` -> `loadNodes(document.id)`; offline fallback calls `readWithFileReader`, `checksum`, `localDocument`, `localItems`, and `runLocalMultiAgentReview` (`simulatorService.ts:109-289`).
  - Triggers: `LandingPage.tsx:52-87, 116-150` (drag-and-drop / file picker + `"Start Agent Review"`), `AttioSidebar.tsx:49-55, 97-110` (`+ Upload Document or Sheet`), `CopilotStream.tsx:85-90, 135-148` (`+ Upload File`).

### 8.3 Investor Demo Case (Online + Offline Fallback)
- **Backend Demo Endpoints & Fixtures (`apps/api/bert/main.py`):**
  - `POST /api/v1/demo/seed` (`286-297`) -> synchronous seed + full `run_regiment`, returns `SeedResponse` (`document_count: 4`, `work_item_count: 12`, `critical_count`).
  - `POST /api/v1/jobs/demo` (`300-305`) -> async background `_run_demo_job` (`352-366`) with `JobController` checkpointing & WebSocket telemetry.
  - Fixture generator `_write_demo_fixtures` (`678-734`) writes 4 files into `apps/api/data/`:
    1. `SOC2_Type_II_2026.pdf` (binary `%PDF-1.4` via `_write_binary_pdf` `636-675`, 5 lines including `[LOW_CONFIDENCE] STAMP NOTE`)
    2. `Legacy_InfoSec_Policy_2023.pdf` (binary `%PDF-1.4` via `_write_binary_pdf`, 3 lines)
    3. `aws_iam_prod_config.json` (`rules.production-read`, `rules.wildcard-admin` w/ `s3:*`, `owner`)
    4. `Enterprise_Security_Questionnaire.xlsx` (`Questionnaire` sheet, 12 questions)
  - `_prepare_demo_documents` (`324-349`) deletes all `ASTNode`, `WorkItem`, `AuditLog`, `Document` rows, ingests the 4 fixtures, assigns `date_for_filename` (`577-578`: `2023-01-01` vs `2026-01-01`), and sets `is_latest_version = "2023" not in filename`.
  - Checked-in sample corpus in `apps/data/` (separate from `apps/api/data/`): 5 files (`270faffe-7601-403a-945e-ceb0352e2b41_FINAL Shield Staff Pitch PPT.pdf` [2.9MB, 6 pages, 960x540], `Enterprise_Security_Questionnaire.xlsx`, `Legacy_InfoSec_Policy_2023.pdf`, `SOC2_Type_II_2026.pdf`, `aws_iam_prod_config.json`).
- **Frontend Demo Loader & Offline Corpus:**
  - `loadDemo()` (`apps/web/src/store/jobExecutionSlice.ts:229-272`): calls `bertApi.startDemo()` + `refresh()`, and on failure builds offline corpus via `buildDemoCorpus()` (`apps/web/src/store/demoCorpusService.ts:5-557`: 4 docs `SOC2_Type_II_2026.pdf`, `Security_Questionnaire.xlsx`, `aws_iam_prod_config.json`, `Scanned_Addendum_p7.pdf`; 12 `ASTNode`s; 9 `WorkItem`s) and launches `runLocalMultiAgentReview`.
  - Triggers: `LandingPage.tsx:89-92, 216-221`, `WeTransferTopPill.tsx:16-19, 43-49`, `AttioSidebar.tsx:112-121`.

---

## 9. Routing, Shell Layouts & URL Query Deep Links

- **Route Table (`apps/web/src/App.tsx:92-99`):**
  - `/` -> `<LandingPage />`
  - `/workspace` -> `<WorkspacePage />`
  - `/results` -> `<ResultsPage />`
  - `/files` -> `<Navigate to="/workspace" replace />`
  - `/copilot` -> `<Navigate to="/workspace" replace />`
  - `*` -> `<Navigate to="/" replace />`
- **Dual Shell Layouts (`apps/web/src/components/layout/AppShell.tsx:7-31`):**
  - On `/`: renders `<WeTransferIconRail />` (`apps/web/src/components/navigation/WeTransferIconRail.tsx:5-121`, fixed `w-16` rail linking `/`, `/workspace`, `/workspace?mode=canvas`, `/results`, `/results?tab=audit`) + `<WeTransferTopPill />` (`apps/web/src/components/navigation/WeTransferTopPill.tsx:5-61`, smooth scroll `#use-cases` / `#how-it-works` / `#security-gate`, Demo trigger) + `<LandingPage />` (`apps/web/src/pages/LandingPage.tsx:40-466`) hosting WebGL2 `<Particles />` (`apps/web/src/components/ui/Particles.tsx:52-954`, `Particles.css`).
  - On `/workspace` and `/results`: renders `<AttioSidebar />` (`apps/web/src/components/navigation/AttioSidebar.tsx:23-285`, fixed `w-60` sidebar linking `/workspace`, `/workspace?mode=canvas`, `/results`, `/results?filter=escalations`, `/results?tab=audit`) + `flex-1` main container.
- **URL Query Parameters & Deep Links:**
  - `UrlStateSync` (`apps/web/src/App.tsx:10-79`):
    - Inbound (`21-36`, on `/workspace`): reads `?doc` (matches `d.id === urlDoc || d.filename === urlDoc`) -> `setSelectedDocument(match.id)` and `?node` -> `setSelectedNode(urlNode)`.
    - Outbound (`38-76`, on `/workspace`): writes/deletes `?doc`, `?page` (from `activeHighlightBox?.pageNumber`), and `?node` using `setSearchParams(..., { replace: true })`.
  - `WorkspacePage.tsx` (`22-23, 62-68`): reads `?mode=canvas` via `searchParams.get("mode")`.
  - Navigation links emit `?mode=canvas`, `?filter=escalations`, and `?tab=audit` (`AttioSidebar.tsx:142, 170, 185`; `WeTransferIconRail.tsx:58, 84`).
- **UI Primitives & Stylesheets:**
  - `apps/web/src/index.css` (`1-218`): Tailwind v4 (`@import "tailwindcss";`), CSS custom properties (`4-13`), `.font-display`/`.font-ui`/`.font-code` (`45-55`), `.dot-grid-pattern` (`58-61`), `.pdf-stage`/`.pdf-page`/`.pdf-overlay`/`.pdf-highlight-rect`/`.pdf-overlay-{verified|warning|low}` (`111-171`), `.spreadsheet-viewer`/`.json-viewer`/`.pdf-viewer` toolbar CSS (`174-218`).
  - `apps/web/index.html` (`1-16`): Google Fonts link (`10`).
  - Unused UI primitive files present: `apps/web/src/components/ui/Badge.tsx` (`3-5`), `apps/web/src/components/ui/Button.tsx` (`3-5`); empty directories: `apps/web/src/components/domain/`, `apps/web/src/stores/`.

---

## 10. Existing Test Suites & Baseline Status

| Suite / Check | Entry Point / Command | Baseline Status (Clean Tree) | Scope & Prerequisites |
| :--- | :--- | :--- | :--- |
| **Backend pytest** | `cd apps/api && .venv/bin/pytest tests/ -v` (`apps/api/pyproject.toml:24-26`, `apps/api/tests/conftest.py:1-28`) | **PASS** — `65 passed, 586 warnings in 20.30s` (exit 0) | Python `3.15.2`, `pytest 8.4.2`, `pytest-asyncio 0.26.0` (`asyncio_mode="auto"`). Files: `test_citation_gate.py` (5), `test_copilot_and_file_stream.py` (3), `test_demo_pipeline.py` (2), `test_escalation_schema_adversarial.py` (51), `test_ingestion_ast.py` (3), `test_real_upload_flow.py` (1). Isolated DB `test_bert.db`. Warnings are `pytest_asyncio` `get_event_loop_policy` deprecations. |
| **Frontend Build & Typecheck** | `cd apps/web && npm run build` (`apps/web/package.json:8`, `tsconfig.app.json`, `tsconfig.node.json`) | **PASS** — `1621 modules transformed`, `built in 2.45s` (exit 0) | Runs `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json && vite build` (`typescript ^5.7.0` strict mode). **No `eslint` script/config exists.** Vite emits `>500 kB` chunk-size warning on `index-*.js` and `pdf.worker.min-*.mjs`. |
| **E2E CDP Suite** | `tests/e2e/runner.js` (`tests/e2e/package.json`, `lib/api.js`, `lib/assert.js`, `lib/cdp.js`, `suites/tier{1..4}_*.js`) | **Not run at baseline** (`tests/e2e/report.json` holds prior 1-test run `TC-F05-01` PASSED) | **140 tests**: `tier1_feature_coverage.js` (60), `tier2_boundary_corner.js` (60), `tier3_cross_feature.js` (14), `tier4_workload_scenarios.js` (6). Zero npm deps; uses Node `v26.13.0` native `fetch`/`WebSocket` + raw CDP over `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (`157.0.8103.40`). Requires running API `:8000` (running) + Web `:5173` (**not running**). |
| **Challenger 2 (Frontend Reactive & URL Sync)** | `tests/test_challenger_m1_2_frontend.js` (`1-363`) | **Not run at baseline** | 3 tests: static `setInterval`/`fetchJob` scan (`31-72`), `appendEvent` unit simulation (`78-175`), live CDP URL sync & polling check (`181-313`, requires `:5173`). |
| **Challenger 1 (Coordinate & Citation Store)** | `apps/web/src/tests/challenger_m1_coordinate_citation.ts` (`1-467`) | **Not run at baseline** | 3 TS suites: PDF point-space projection math (`61-180`), `inspectCitation` atomic tab switching (`185-303`), dual signature + 1000-iter stress test (`308-441`). Needs `tsx`/`ts-node` (neither installed) or bundling. |

---

## 11. Known Baseline Discrepancies / Spec Conflicts Observed

The items below are **documented bugs, placeholders, or spec conflicts** in the baseline codebase (distinct from the working contracts in Sections 1–10):

### 11.1 Existing Tests That Lock In Buggy or Constrained Behavior
1. **`apps/api/tests/test_escalation_schema_adversarial.py:175-178`:** Explicitly asserts `POST /api/v1/escalations/{id}/resolve` with `{"action": "counsel", ...}` returns `verification_status == "VERIFIED"`, locking in the `bert/main.py:459-463` `else:` bug where `counsel`, `approve`, and `skip` all overwrite the finding to `VERIFIED` / `P3_LOW` / `10` / `"Marked not applicable by reviewer."` (Line `58` also seeds `resolved_by_tier="HUMAN_IN_THE_LOOP"`, which is not in `ResolvedByTier`.)
2. **`apps/api/tests/test_real_upload_flow.py:49`:** Asserts `agent_transition` WS events carry lowercase `status == "completed"`. Fixing job-status leakage in `jobExecutionSlice.ts:184-186` must **keep** `agent_transition.status` lowercase (`"running"` / `"completed"`) or add a separate `job_status` field rather than breaking this test.
3. **`apps/api/tests/test_copilot_and_file_stream.py:59-64`:** Asserts exact dictionary equality on insufficient Copilot responses (`{"answer", "verification_status", "match_score", "citations"}`); line `52` asserts `bounding_box["x1"] <= 612`; line `70,75` asserts 2 `DIGITAL_PDF` fixtures with `612x792` `MediaBox`.
4. **`apps/api/tests/test_demo_pipeline.py:27-28, 34`:** Hardcodes `document_count == 4` and `work_item_count == 12`.

### 11.2 Backend Logic, Ingestion, Gate & Observability Bugs
1. **`counsel` ("Flag for Legal") & Manual Override Flaws (`apps/api/bert/main.py:442-478`):** `VerificationStatus` lacks `ESCALATED_LEGAL`; `counsel` falls into `else:` and marks risks `VERIFIED`/`P3_LOW`. `note` and `manual_payload` on `EscalationActionRequest` are dropped; `manual_correction` does not update `resolved_by_tier` or `gate_telemetry`.
2. **Evidence Locator & Citation Schema Gaps (`schemas.py:42`, `pipeline.py:331-335, 440-448`, `main.py:152, 170`):** `verified_citations` lacks `bounding_box`, `section_path`, `sheet_name`/`row_index`, `json_path`, `char_range`, `page_width`/`page_height`/`rotation`, and `confidence_score`. `copilot_chat` excludes `SourceFormat.XLSX` and sets `page = selected_node.page_number or 1` for non-paged formats.
3. **PDF Coordinates, Rotation & Scanned PDFs (`docling_parser.py:72-149`, `main.py:251-257`):** `DoclingParser` uses `pypdf.extract_text()` (not `docling`), ignores `cm`/`tm` text coordinates, `MediaBox`/`CropBox`, and `page.rotation`, and fabricates US Letter `612x792` boxes (`y1` clamps at `12.0` past line 53). `_upload_document` never assigns `PHYSICAL_SCAN`; binary scanned PDFs with empty `extract_text()` fall back to `raw.decode("utf-8", errors="ignore")` (ingesting raw PDF bytes); `stream_nodes` discards `low_confidence_crops`; `[LOW_CONFIDENCE]` prefix is stripped before DB persistence; questionnaire path (`pipeline.py:385-402`) never checks `fact_node.ocr_confidence < 0.90`.
4. **Weak-Quote Loophole & Fallback Citation (`citation_gate.py:37-61`, `pipeline.py:519`):** `verify_citations` uses symmetric `fuzz.partial_ratio` with no minimum quote length, token count, or length ratio guard (e.g., `"MFA"` or a bloated fabricated quote containing `"SOC 2 Type II 2026"` passes at `100.0`). `_fact_node` falls back to `source_nodes[0]` for unmatched questions.
5. **Chronos Runtime Crash & Supersession Gaps (`chronos.py:11-26`, `pipeline.py:450`):** `analyze_versions` sorts by `document.effective_date or document.created_at`, raising `TypeError` (`date` vs `datetime`) when dated demo docs coexist with uploaded docs (`effective_date=None`). `superseded_count` uses `len(documents) - 1`; `_fact_node` ignores `is_latest_version`; `pipeline.py:450` hardcodes `"2026 SOC 2 supersedes 2023 Policy"` for `"password"` questions; no manual Chronos override endpoints exist.
6. **Corpus, Telemetry & Export Bugs (`main.py`, `pipeline.py`, `controller.py`):**
   - Missing endpoints: `GET/DELETE /api/v1/documents/{id}`, corpus reset, `GET /api/v1/jobs`, and `PATCH /api/v1/work-items/{id}`. `GET /api/v1/documents/{id}/nodes` returns `[]` instead of `404` on unknown ID; `WorkItem.document_id` and `AuditLog.document_id` lack `ForeignKey` cascades; upload `workspace_id` is ignored across queries.
   - `agent_transition` WS event (`pipeline.py:109-121, 133-145`) omits `job_id` and `current_agent_index`, sends `node_index` instead of `current_node_index`, and sends lowercase `status` (`"running"`/`"completed"`).
   - `JobExecution.user_override_instructions` is never read by `run_regiment`; `InferenceRuntime.complete()` return values (`pipeline.py:124`) are discarded; `AuditLog.model_version` is never populated; `_agent_transition` hardcodes `confidence=0.96` (`pipeline.py:128`) and `document_id=None` for Scout–Vanguard.
   - `export_questionnaire` (`main.py:540-551`) mutates `apps/api/data/Enterprise_Security_Questionnaire.xlsx` in place on every download using sequential `index + 2` rows; `export_summary` (`555-570`) returns static counts rather than a true Envoy briefing.

### 11.3 Frontend State, URL Sync, Viewer & UI Bugs
1. **Active Corpus Snap-Back & URL Deep-Link Race (`App.tsx:21-76`, `WorkspacePage.tsx:62-68`):**
   - `UrlStateSync` inbound effect includes `selectedDocumentId` and `selectedNodeId` in its dependency array (`36`), reverting user clicks in `AttioSidebar` back to the stale `?doc=` before outbound sync runs.
   - Outbound effect wipes `?doc=` and `?page=` on cold load while `documents` is still `[]`.
   - Inbound `?page=` is never read; `WorkspacePage.setMode` overwrites all query params with `{ mode: "canvas" }` or `{}`; `ResultsPage` ignores `?filter=escalations` and `?tab=audit`.
2. **Job Status Desync & Simulator Bugs (`jobExecutionSlice.ts:180-206, 229-272`, `simulatorService.ts:259-288`, `documentSlice.ts:75`):**
   - `appendEvent` copies lowercase `event.status` (`"running"`/`"completed"`) directly into `activeJob.status`, breaking `activeJob?.status === "RUNNING"` checks; `JOB_RESUMED` sets invalid `status: "RESUMED"` and `isSimulating: false`.
   - `loadDemo` offline does not clear `events`, `chatMessages`, `selectedNodeId`, `activeHighlightBox`, or `documentFiles`; `runLocalMultiAgentReview` omits `isSimulating: false` and `job` sync on completion and hardcodes `"14/16 items verified"`; `uploadFile` offline calls `readAsText` on binary `.pdf`/`.xlsx` files.
3. **Viewer Locator, Performance & Routing Bugs:**
   - `PdfViewer.tsx:164-167` uses `pageSize.height - y1 * zoomLevel` instead of `viewport.convertToViewportRectangle(...)`, breaking on rotated/cropped/non-Letter PDFs (e.g., `960x540` pitch deck); mounts all pages simultaneously (no virtualization); lacks `.textLayer`; clips `.pdf-highlight-tooltip` inside `.pdf-page { overflow: hidden }`.
   - `SpreadsheetViewer.tsx:55-56, 75-78` expects `structured_payload.row_index` & `sheet_name` while `demoCorpusService.ts:166,178,190,202` emits `{ row, col_A, col_B }`; `RightInspectorDrawer.tsx:288-294` routes `.xls`/`.csv`/`.txt`/`.md` to `PdfViewer`.
   - `JsonTreeViewer.tsx:93-99` `pathsMatch("root", x)` normalizes `"root"` to `""` so `left.endsWith("")` matches every key; branches do not auto-expand on external `selectedNodeId` changes.
   - `evidenceInspectionSlice.ts:95, 114` converts `confidence_score > 1 ? /100 : score` (`1` becomes `100%`) and overwrites citation confidence with `node?.ocr_confidence`; `refresh()` only loads nodes for `selectedDocumentId`.
4. **HITL Queue Fragmentation & `counsel` UX (`CopilotStream.tsx:60-62`, `BentoCanvas.tsx:213-262`):**
   - Verified `P0_CRITICAL` findings appear inside `CopilotStream` escalation cards with `Accept Vision Rescue Text`; offline `counsel` keeps items stuck in the queue; `BentoCanvas` Human Action Queue is hardcoded static HTML.
5. **Counter Divergence, Placebo Controls & Hardcoded Copy:**
   - Empty corpus renders `100% Defensibility Score` (`ResultsPage.tsx:157`); `AttioSidebar.tsx:47` defaults total to `16` and `isActionNeeded` (`215-217`) never clears resolved scan/P0 docs; `ResultsPage.tsx:109-111, 131-133` double-counts `P1_HIGH` items in chart segments (`Math.max(8, ...)` can sum >100%); `metricType` and `enforceLatestVersion` are placebo controls in `ResultsPage.tsx`; `ResultsPage.tsx:302-312` hardcodes Envoy prose; `CopilotStream.tsx:459, 498` hardcodes fallback `"SOC2_Type_II_2026.pdf"` and `"rapidfuzz gate: ≥97% match"`; `BentoCanvas.tsx` `selectedBentoTab` does not filter cards and `"Inspect Quotes"` is a no-op; `useWebSocket()` status is ignored by UI green dots; no 7-stage visual stepper exists.
6. **Landing Intake, CSS & Accessibility Gaps:**
   - `LandingPage.tsx:78-87` uploads only the first real file (`stagedFiles.find`), losing additional staged files; `DEFAULT_STAGED_FILES` cannot be removed; `WeTransferTopPill.tsx:38` links to nonexistent `#security-gate`; `Particles.tsx:943-945` has a dependency-less `useEffect`.
   - `index.css` lacks rules for `.badge*`, `.btn*`, `.animate-fade-in`, `.pdf-highlight-tooltip`/`.pdf-highlight-anchor`/`.viewer-toolbar-group`/`.zoom-readout`/`.page-navigation`/`.document-viewer-*`/`.spin`, `.spreadsheet-scroll`/`.spreadsheet-grid`/`.spreadsheet-row-focused`/`.sheet-tabs`/`.sheet-tab*`/`.sheet-meta`, and all `.json-*` classes; `index.html:10` relies on Google Fonts CDN; `select-none` blocks text copy across main workspace/inspector/results surfaces; missing `<main id="main-content">`, skip-link, `role="switch"` / `aria-live` / `<label for>` / WCAG AA contrast (`text-zinc-400`), resizable splitters, and mobile responsive sizing expected by `tests/e2e/suites/`.
