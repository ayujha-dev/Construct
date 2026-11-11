# BERT must-know operations

## Startup commands

```bash
cd apps/api
source .venv/bin/activate
uvicorn bert.main:app --reload --port 8000

# another terminal
cd apps/web
npm run dev
```

The API starts with SQLite and permissive CORS. The web frontend also features an infallible deterministic local simulator fallback if the backend is offline.

## Frontend UI/UX Architecture (WeTransfer + Replit + Attio Hybrid)

The frontend has been completely rebuilt using a daylight-first editorial and precision SaaS visual language:

### 1. Dual Navigation Modes
- **Landing / Intake (`/`) — WeTransfer Floating Architecture**:
  - `WeTransferIconRail` (`w-16` fixed white rail) with monogram logo and minimal line icons (`Upload`, `Copilot`, `Canvas`, `Reports`, `Audit`).
  - `WeTransferTopPill` (floating top-right white pill) with navigation links and active workspace mode indicator.
- **Application (`/workspace` & `/results`) — Attio Structured Sidebar (`w-60`)**:
  - `AttioSidebar` with workspace header, Replit-style action buttons (`+ Upload Document or Sheet` and `⚡ Load Investor Demo Case`), route links with live badge counts, an **Active Corpus** section with colored squircle badges (Blue PDF, Emerald XLS, Amber JSN, Rose SCN), and bottom live review progress tracker.

### 2. Page Hierarchy
- **Page 1 (`/`) — Landing & Intake**:
  - **Section 1A**: Deep Midnight Navy (`#0B1026`) hero canvas hosting WebGL2 `<Particles />`, a floating white WeTransfer-style upload intake card with staged file list, review scope, playbook, and verification gate, plus large serif display typography ("Drop files. Verify every line.") and floating pastel badges.
  - **Section 1B**: Warm Alabaster (`#F7F7F5`) daylight editorial pitch ("One workspace, seven specialist agents. Zero hallucinations.") and a Royal Blue Bento Showcase Container (`#2563EB`) with expandable use-case drawers and a 2x2 capability grid.
- **Page 2 (`/workspace`) — Conversational Copilot & Bento Canvas**:
  - **Top Context Bar**: Active project breadcrumb, Replit-style `Copilot Stream | Bento Canvas` segmented mode toggle, real-time agent telemetry pill with inline `[Pause Agent]` / `[Resume]`, and live caution counters.
  - **Mode A (Copilot Stream)**: Attio prompt hub greeting, central prompt composer box with steering controls, 5 quick workflow squircles (`Auto-Answer .XLSX`, `Flag Critical Risks`, `Verify Scan Readability`, `Check Policy Conflicts`, `Generate Executive Summary`), live agent activity cards, safe checkpoint banners, and human escalation cards with 3 resolution actions (`Manual Override`, `Accept Vision Rescue`, `Flag for Legal`).
  - **Mode B (Bento Canvas)**: Dot-grid canvas with 4 grouped intelligence Bento cards (`Corpus Architecture`, `Critical Risks & Contradictions`, `Human Action Queue`, `Verified Evidence Clauses`), floating bottom-left chat dock, and floating action pill.
  - **Right Inspector Drawer (`w-96`)**: Verified quotes, AST nodes, visual viewer (PDF with bounding-box highlights, Excel sheet, JSON tree), and SHA-256 audit hashes.
- **Page 3 (`/results`) — Executive Results & Report Builder**:
  - Top header bar with SHA-256 Zero-Data-Loss Verified badge, `Reset Filters`, `Export Answered .XLSX`, and `Download Summary Report`.
  - Top category legend bar with colored square indicators (Attio style).
  - Envoy executive summary callout card.
  - Stacked visual breakdown bar chart with hover tooltips.
  - Contributing findings table with inline editor and quote citations.
  - Right Configuration & Insight sidebar (`w-80`) with data source filter, grouping, segmentation, and blue pill toggle switches.

## Processing Contract & 7-Agent Regiment

```text
Scout → Quartermaster → Chronos → Vanguard → Ranger → Arbiter → Envoy
```

`rapidfuzz.fuzz.partial_ratio` must reach ≥97%. Low-confidence/stamped nodes (<0.90 OCR) or unanswerable evidence hard-fail to `INSUFFICIENT_EVIDENCE` and `P0_CRITICAL` for human review.

## Verification & Build Checks

```bash
cd apps/api && .venv/bin/pytest tests/ -q
cd ../web && npm run build
```
