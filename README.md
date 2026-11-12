# ShieldStaff — Evidence-Verified Document Intelligence Platform

ShieldStaff is an evidence-first document intelligence platform and conversational copilot for security, compliance, and high-stakes contract work. It accepts real PDF, XLSX, JSON, TXT, and Markdown files, decomposes them into an immutable Abstract Syntax Tree (AST), runs the seven-agent review pipeline, mathematically verifies citations with `rapidfuzz >= 97%`, and produces executive-ready outputs backed by deterministic substring citation checks.

---

## Visual & Design Architecture (WeTransfer + Replit + Attio CRM)

ShieldStaff's frontend has been completely redesigned from the ground up to match the daylight-first editorial and precision SaaS visual language of our reference systems:

1. **Theme Tokens & Design System (`apps/web/src/index.css`)**:
   - **Primary Workspace Canvas**: Warm Alabaster / Porcelain (`#F8F9FA` / `#F7F7F5`) with crisp white elevated cards and subtle borders (`1px solid #E5E7EB`).
   - **Hero Contrast Surface**: Deep Midnight Navy (`#0B1026` to `#111827`) hosting the WebGL2 `<Particles />` intake canvas.
   - **Bento & Action Surface**: Vibrant Royal Blue (`#2563EB`) containers and primary CTAs.
   - **Attio Pastel Accents**: Status tags for `P0_CRITICAL` (Coral Rose), `P1_HIGH` (Warm Amber), and `VERIFIED SAFE` (Mint Emerald).
   - **Typography**: Editorial Display Headlines in `'Instrument Serif'` & `'Playfair Display'`, UI sans in `'Inter'` & `'Plus Jakarta Sans'`, and code citations in `'JetBrains Mono'`.

2. **Dual Navigation Shells**:
   - **Landing / Intake (`/`) — WeTransfer Floating Shell**:
     - `WeTransferIconRail`: Narrow 64px white icon rail with ShieldStaff monogram and minimal navigation icons (`Upload`, `Copilot`, `Canvas`, `Reports`, `Audit`).
     - `WeTransferTopPill`: Floating top-right pill with quick links and active workspace mode indicator.
   - **Inside Application (`/workspace` & `/results`) — Attio CRM / Replit Structured Sidebar**:
     - `AttioSidebar` (`w-60`): Workspace header, `+ Upload Document or Sheet` and `⚡ Load Investor Demo Case` action buttons, route navigation with live escalation counters, an **Active Corpus** section with colored squircle badges (Blue PDF, Emerald XLS, Amber JSN, Rose SCN), and bottom review progress bar.

3. **Page-by-Page Hierarchy**:
   - **Page 1: Landing, Intake Card & Pitch (`/`)**:
     - **Section 1A**: Deep Midnight Navy hero canvas hosting WebGL2 `<Particles />`, floating white WeTransfer-style upload widget card with staged items, review scope, target playbook, and verification gate, plus large serif display text ("Drop files. Verify every line.") and bobbing pastel file squircles.
     - **Section 1B**: Warm alabaster editorial pitch and a Royal Blue Bento Showcase Container (`#2563EB`) with expandable use-case drawers and a 2x2 capability grid.
   - **Page 2: The Conversational Copilot & Canvas (`/workspace`)**:
     - **Top Context Bar**: Active project breadcrumb, Replit-style `Copilot Stream | Bento Canvas` segmented mode toggle, real-time agent telemetry pill with inline `[Pause Agent]` / `[Resume]`, and live caution counters.
     - **Mode A (Copilot Stream)**: Attio prompt hub greeting, central prompt composer box with steering controls, 5 quick workflow squircles (`Auto-Answer .XLSX`, `Flag Critical Risks`, `Verify Scan Readability`, `Check Policy Conflicts`, `Generate Executive Summary`), live agent activity cards, safe checkpoint banners, and human escalation cards with 3 resolution actions (`Manual Override`, `Accept Vision Rescue`, `Flag for Legal`).
     - **Mode B (Bento Canvas)**: Dot-grid canvas with 4 grouped intelligence Bento cards (`Corpus Architecture`, `Critical Risks & Contradictions`, `Human Action Queue`, `Verified Evidence Clauses`), floating bottom-left chat dock, and floating action pill.
     - **Right Inspector Drawer (`w-96`)**: Verified quotes, AST nodes, visual viewer (PDF with bounding-box highlights, Excel sheet, JSON tree), and SHA-256 audit hashes.
   - **Page 3: Executive Results, Visual Analytics & Report Builder (`/results`)**:
     - Top report header bar with SHA-256 Zero-Data-Loss Verified badge, `Reset Filters`, `Export Answered .XLSX`, and `Download Summary Report`.
     - Top category legend bar with colored square indicators (Attio style).
     - Envoy executive summary callout card.
     - Responsive stacked visual breakdown bar chart with hover tooltips.
     - Contributing findings table with inline editor and quote citations.
     - Right Configuration & Insight sidebar (`w-80`) with data source filter, grouping, segmentation, and blue pill toggle switches.

---

## 7-Agent Review Pipeline

```text
Scout → Quartermaster → Chronos → Vanguard → Ranger → Arbiter → Envoy
```

1. **Scout (`Qwen2.5-VL-7B`):** Transcribes low-confidence (`<0.90`) scan crops, stamps, and handwriting into Markdown AST nodes.
2. **Quartermaster (`Qwen2.5-14B`):** Classifies documents and AST nodes into hierarchical categories and tags.
3. **Chronos (`Qwen2.5-14B`):** Maps effective dates, policy supersession chains, and enforces latest version authority.
4. **Vanguard (`Qwen2.5-14B`):** Computes risk scores (`0–100`) and assigns priority tiers (`P0_CRITICAL` to `P3_LOW`).
5. **Ranger (`Qwen2.5-14B` + Instructor):** Extracts atomic JSON facts + exact verbatim quotes. Zero prose.
6. **Arbiter (`Qwen2.5-14B`):** Resolves cross-document and temporal contradictions.
7. **Envoy (`Qwen2.5-14B`):** Converts verified facts into fluent, executive-ready prose with inline citations.

---

## Run Locally

### 1. API (Optional for full backend, fallback simulator built-in)

```bash
cd apps/api
source .venv/bin/activate
uvicorn shieldstaff.main:app --reload --port 8000
```

### 2. Web

```bash
cd apps/web
npm install
npm run dev
```

Open <http://localhost:5173>.

---

## Verification & Build

```bash
# Run backend pytest suite
cd apps/api && .venv/bin/pytest tests/ -q

# Run frontend TypeScript & Tailwind build
cd apps/web && npm run build
```
