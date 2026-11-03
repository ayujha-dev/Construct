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

The API starts with SQLite and permissive CORS. No Docker services are part of
the demo critical path.

## Processing contract

`POST /api/v1/documents/upload` stores the source under the ignored
`apps/api/data/` directory and parses it into ordered AST nodes. PDF extraction
uses `pypdf` when the file is a real PDF and falls back to readable text; JSON
uses `ijson` paths; XLSX uses `openpyxl` rows; TXT/MD use the safe text parser.
The SHA-256 digest is computed from every persisted node in order.

The pipeline runs:

```text
Scout → Quartermaster → Chronos → Vanguard → Ranger → Arbiter → Envoy
```

`rapidfuzz.fuzz.partial_ratio` must reach 97%. Low-confidence/stamped nodes or
unanswerable evidence hard-fail to `INSUFFICIENT_EVIDENCE` and `P0_CRITICAL`.

## Checkpoints

```text
RUNNING → PAUSING → PAUSED → RESUMING → RUNNING → COMPLETED
                                      ↘ FAILED
```

The controller saves the active agent, document, and AST node index before each
atomic step. Use `POST /api/v1/jobs/{job_id}/pause` and
`POST /api/v1/jobs/{job_id}/resume` with `{ "instruction": "..." }`.

## Frontend structure

There is one browser store at `apps/web/src/store/useBertStore.ts`. It consumes
REST and `/ws`, and falls back to `FileReader` plus a deterministic local agent
simulator whenever the API cannot be reached. The only product routes are `/`,
`/workspace`, and `/results`; `/files` and `/copilot` redirect to `/workspace`
for old bookmarks.

The ambient particle layer is fixed, `z-index: 0`, and
`pointer-events: none`. Workspace columns independently scroll inside an
`h-screen` layout so the composer remains visible.

## Checks

```bash
cd apps/api && .venv/bin/pytest tests/ -q
cd ../web && npm run build
```
