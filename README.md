# ShieldStaff — Evidence-Verified Document Intelligence Platform

**ShieldStaff** is an evidence-first document intelligence platform and conversational copilot for security questionnaires, contract risk triage, and compliance audits. It ingests PDF, XLSX, JSON, TXT, and Markdown files into an immutable Abstract Syntax Tree (AST), runs a 7-agent review pipeline, verifies every claim against source quotes (`rapidfuzz >= 97%` and critical-entity `logprob >= 0.92`), and produces audit-ready outputs.

> **Core Guarantee:** Every answer is tied to a source quote or flagged for review. Missing, stale, or low-confidence evidence fails closed to human triage.

---

## Quick Start: Run & View the Dev Build

### 1. Start the Backend API (Port `8000`)

```bash
cd apps/api
source .venv/bin/activate
uvicorn bert.main:app --port 8000
```

- Health check: <http://localhost:8000/health>
- Persists documents, AST nodes, work items, checkpoints, and SHA-256 `AuditLog` rows in local async SQLite (`sqlite_async`).

### 2. Start the Frontend Web App (Port `5173`)

```bash
cd apps/web
npm install
npm run dev
```

Open **<http://localhost:5173>** in your browser.

---

## Offline Local Simulation Mode

ShieldStaff includes a built-in deterministic offline simulation mode in the web client (`apps/web/src/store/useBertStore.ts`). If the backend API on port `8000` is unreachable, the frontend automatically runs in **Offline Local Mode**:

- Staging and uploading real `.pdf`, `.xlsx`, `.json`, `.txt`, and `.md` files parses and previews them directly in browser state.
- Clicking **Launch Demo Dossier** / **Load demo case** loads the 4-document demo corpus (`SOC2_Type_II_2026.pdf`, `aws_iam_prod_config.json`, `Legacy_InfoSec_Policy_2023.pdf`, `Enterprise_Security_Questionnaire.xlsx`) so you can inspect `/workspace`, `/triage`, and `/results` without an external LLM or cloud dependency.
- All interactive homepage playgrounds (Verification Gate Playground, Pipeline Explorer, Risk Tiers, Triage Preview, Use Case tabs) run deterministically in local state with zero backend mutation.

---

## Interactive Homepage & Visual Architecture

Controlled by `ENABLE_INTERACTIVE_HOME` in `apps/web/src/config/features.ts` (defaults to `true`; set to `false` to toggle back to the legacy `<Particles />` landing page):

### ShapeGrid + Aurora Animated Backdrop
- **Layered Canvas (`apps/web/src/features/home/background/`)**:
  - `HomeBackdrop.tsx` & `HomeBackdropInner.tsx` render a fixed, non-blocking backdrop (`pointer-events-none`, `aria-hidden="true"`).
  - **Layer 1**: `var(--bg-canvas)` archival paper (`#FAF8F5` light) / obsidian ledger (`#0E1117` dark).
  - **Layer 2**: `ShapeGrid` interactive geometric lattice with `clickCascade` active inside `#hero` and disabled below the fold.
  - **Layer 3**: `Aurora` WebGL2 shader scoped to the hero header with automatic static gradient fallback when WebGL2 is unavailable.
  - **Layer 4**: Theme-aware readability scrim ensuring WCAG AA (`>= 4.5:1`) text contrast across both Light and Dark themes.
  - Automatically pauses animations on `prefers-reduced-motion: reduce` and hidden browser tabs, and caps DPR on compact/low-core devices.

### Interactive Showcase Sections (`apps/web/src/features/home/`)
1. **Hero Live Document-to-Evidence Demo (`#hero`)**: Clickable highlighted claims animate the live source highlight across a **PDF page + bounding box** (`Page 14 · bbox [72, 610, 512, 636]`), a **JSON path** (`$.rules.wildcard-admin.action`), and an **XLSX row** (`Questionnaire!A5:D5 · Row 5`) alongside the multi-file dossier intake card (**Start Agent Review**, **Load demo case**, **Launch Live Copilot**).
2. **Scroll-Linked Story Navigation (`StoryNavBar`)**: Sticky anchor bar linking `#evidence-demo`, `#pipeline-explorer`, `#verification-gate`, `#risk-tiers`, `#triage-preview`, and `#use-cases` with `IntersectionObserver` active-section tracking and smooth scrolling.
3. **7-Agent Pipeline Explorer (`#pipeline-explorer`)**: Keyboard-operable stepper (`Scout` -> `Quartermaster` -> `Chronos` -> `Vanguard` -> `Ranger` -> `Arbiter` -> `Envoy`) with hover/focus/tap stage inspection and a **Play Document Run** button that steps a sample dossier through `pending -> running -> done`.
4. **Verification Gate Playground (`#verification-gate`)**: Live editable quote tester against a fixed source sentence. Runs a faithful JavaScript illustration of `apps/api/bert/verification/citation_gate.py` against the `>=97%` threshold, minimum length/word rules, and bare-heading rejection with **Pass**, **Weak Evidence**, and **Fail** states.
5. **Risk Tier Explorer (`#risk-tiers`)**: Clickable `P0_CRITICAL`, `P1_HIGH`, `P2_MEDIUM`, and `P3_LOW` tabs detailing score bands, target SLAs, deterministic routing logic, and sample findings.
6. **Human Triage Preview (`#triage-preview`)**: Purely local-state sandbox with three realistic escalations, **Accept (`A`) / Override (`O`) / Flag for Legal (`L`) / N/A (`N`)** shortcuts, and a single-click **Undo** toast.
7. **Use Cases Tabs (`#use-cases`)**: Interactive mini-demos for **Security Questionnaire** (`.xlsx`), **Contract Risk Triage** (`Chronos` + `Vanguard`), and **Degraded Scans** (`Scout` OCR threshold `0.90` + Vision Rescue).
8. **Command Palette (`Cmd/Ctrl+K`)**: Global modal (`CommandPaletteModal.tsx`) for jumping to any section, navigating routes (`/workspace`, `/triage`, `/results`, `/results?tab=audit`), loading the demo corpus, or toggling Light/Dark theme.

---

## 7-Agent Review Pipeline

```text
Scout → Quartermaster → Chronos → Vanguard → Ranger → Arbiter → Envoy
```

1. **Scout (`Qwen2.5-VL-7B`):** Detects low-confidence (`ocr_confidence < 0.90`) scan crops, stamps, and handwriting and queues Vision Rescue bounding boxes for human verification.
2. **Quartermaster (`Qwen2.5-14B`):** Classifies AST nodes into compliance domains (Access Control, IAM, Data Retention, Liability) while preserving exact source locators.
3. **Chronos (`Qwen2.5-14B`):** Ranks policy versions by effective date and builds `superseded_by` lineage edges across years.
4. **Vanguard (`Qwen2.5-14B` + Deterministic Rules):** Computes `0–100` risk scores and assigns priority tiers (`P0_CRITICAL` to `P3_LOW`) for wildcards (`s3:*`), uncapped liability, and weak OCR.
5. **Ranger (`Qwen2.5-14B` + Instructor):** Extracts strict JSON `ExtractedFact` payloads paired with verbatim source quotes and token logprobs.
6. **Arbiter (`Qwen2.5-14B`):** Cross-checks governing vs. superseded documents and surfaces explicit `TEMPORAL_CONFLICT` items.
7. **Envoy (`Qwen2.5-14B`):** Synthesizes answers, executive summaries, and `.XLSX` exports strictly from gate-passed facts—or fails closed to `/triage` with `INSUFFICIENT_EVIDENCE`.

---

## Application Routes

- **`/`** — ShieldStaff interactive landing page, multi-file dossier intake, and showcase playgrounds.
- **`/workspace`** — Conversational Copilot Stream & Bento Document Canvas with live Pause/Resume telemetry and Right Inspector Drawer (PDF bounding-box viewer, JSON tree, Spreadsheet grid, and SHA-256 AST checksums).
- **`/triage`** — Two-pane Human Triage Queue (`P0`–`P3`) with evidence-visibility gating, `J/K/A/O/L/N` keyboard shortcuts, bulk resolution, and transactional Undo.
- **`/results`** — Executive Results dashboard, category breakdown, `.XLSX` export, and SHA-256 Audit Ledger (`/results?tab=audit`).

---

## Verification & Testing

```bash
# 1. Frontend TypeScript check + production Vite bundle (must exit 0)
cd apps/web && npm run build

# 2. Verify zero setInterval polling in frontend source (must return 0 matches)
grep -rn "setInterval" apps/web/src/

# 3. Frontend unit & design-system suites (from apps/web)
cd apps/web && npx jiti src/tests/phase8_design_system_unit.ts
cd apps/web && npx jiti src/tests/phase7_landing_unit.ts

# 4. Backend pytest suite
cd apps/api && .venv/bin/pytest tests/ -q

# 5. End-to-End headless Chrome suites (from repo root)
node tests/test_phase8_e2e.js
node tests/e2e/runner.js --tier=1
```
