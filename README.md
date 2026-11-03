# BERT

BERT is an evidence-first document review copilot for security, compliance, and
high-stakes contract work. It accepts real PDF, XLSX, JSON, TXT, and Markdown
files, extracts an ordered AST, runs the seven Marshal Berthier agents, verifies
citations with `rapidfuzz >= 97%`, and publishes an executive-ready result.

## Run locally with zero external services

### API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e "[test]"
uvicorn bert.main:app --reload --port 8000
```

The default is local SQLite (`apps/api/bert.db`) and the deterministic simulator.
Docker, Postgres, Redis, GPU inference, and model credentials are not required.

### Web

```bash
cd apps/web
npm ci
npm run dev
```

Open <http://localhost:5173>.

## Demo flow

1. Click **Load Investor Demo Case**, or open **Live Review Copilot**.
2. Upload a `.pdf`, `.xlsx`, `.json`, `.txt`, or `.md` file.
3. Watch Scout → Quartermaster → Chronos → Vanguard → Ranger → Arbiter → Envoy stream over `/ws`.
4. Click **Pause Agent & Edit Task**, send an instruction, and resume from the saved checkpoint.
5. Open **Results & Executive Summary** to filter findings and download Markdown/XLSX exports.

If port `8000` is unavailable, the browser automatically uses its deterministic
FileReader simulator so the upload, seven-agent walkthrough, citation inspector,
pause/resume controls, and results view remain usable during a presentation.

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/v1/documents/upload` | Parse a real source and persist AST nodes/checksum |
| `POST /api/v1/jobs/start` | Start processing an uploaded document |
| `POST /api/v1/jobs/demo` | Load the built-in investor bundle and start review |
| `POST /api/v1/jobs/{job_id}/pause` | Request a safe checkpoint pause |
| `POST /api/v1/jobs/{job_id}/resume` | Resume with optional `instruction` |
| `GET /api/v1/documents/{id}/nodes` | Read source nodes for citation inspection |
| `GET /api/v1/work-items` | Read verified findings and escalations |
| `GET /api/v1/export/summary.md` | Download executive Markdown |
| `GET /api/v1/export/questionnaire.xlsx` | Download answered workbook |
| `WS /ws` | Receive live agent, gate, checkpoint, and result events |

## Clean codebase map

```text
apps/api/bert/main.py                 FastAPI entrypoint
apps/api/bert/state.py                Local source storage/runtime state
apps/api/bert/ingestion/              PDF, XLSX, JSON, TXT, checksum parsers
apps/api/bert/agents/                 Seven agents and pause/resume controller
apps/api/bert/verification/            Citation gate and hard-fail policy
apps/web/src/App.tsx                  Persistent shell and three routes
apps/web/src/index.css                Tailwind v4 import and product styling
apps/web/src/types/bert.ts            Shared TypeScript contracts
apps/web/src/store/useBertStore.ts    REST, WebSocket, and local fallback state
apps/web/src/components/layout/       Navbar and shell
apps/web/src/components/copilot/      Queue, stream, and source inspector
apps/web/src/pages/LandingPage.tsx    `/` investor overview
apps/web/src/pages/WorkspacePage.tsx  `/workspace` live review copilot
apps/web/src/pages/ResultsPage.tsx    `/results` executive output
```

## Verification

```bash
cd apps/api && .venv/bin/pytest tests/ -q
cd ../web && npm run build
```
