"""Single FastAPI entrypoint for BERT's local-first document intelligence API."""

from __future__ import annotations

import json
import asyncio
import re
import time
from datetime import date
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import delete, desc, inspect, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from bert.api.schemas import (
    ASTNodeResponse,
    AuditResponse,
    CitationMatch,
    CopilotChatRequest,
    CopilotChatResponse,
    DocumentResponse,
    EscalationActionRequest,
    EscalationResponse,
    JobExecutionResponse,
    JobStartRequest,
    JobResumeRequest,
    SandboxRequest,
    SandboxResponse,
    SeedResponse,
    WorkItemResponse,
)
from bert.api.websocket import WebSocketManager
from bert.agents.controller import JobController
from bert.config import settings
from bert.ingestion.checksum import verify_ingestion_completeness
from bert.ingestion.router import ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, safe_filename, stream_file
from bert.models.base import Base, SessionFactory, engine
from bert.models.documents import ASTNode, AuditLog, Document, JobExecution, SourceFormat, WorkItem
from bert.agents.pipeline import persist_ingestion_stream, run_regiment
from bert.models.documents import PriorityTier, VerificationStatus
from bert.state import DATA_DIR, stored_source_path
from bert.verification.citation_gate import (
    INSUFFICIENT_EVIDENCE_OUTPUT,
    payload_hash,
    run_verification_gate,
)

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await startup()
    yield


app = FastAPI(title="BERT Document Intelligence API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
manager = WebSocketManager()
job_controller = JobController(manager.sink.publish)


async def startup() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        document_columns = await connection.run_sync(
            lambda sync_connection: {column["name"] for column in inspect(sync_connection).get_columns("documents")}
        )
        if "file_size_bytes" not in document_columns:
            await connection.execute(text("ALTER TABLE documents ADD COLUMN file_size_bytes INTEGER DEFAULT 0"))
        columns = await connection.run_sync(
            lambda sync_connection: {column["name"] for column in inspect(sync_connection).get_columns("audit_log")}
        )
        if "metadata" not in columns:
            await connection.execute(text("ALTER TABLE audit_log ADD COLUMN metadata JSON"))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "inference_mode": settings.inference_mode, "db_mode": settings.db_mode}


@app.websocket("/ws")
@app.websocket("/ws/events")
async def events(socket: WebSocket) -> None:
    await manager.connect(socket)
    try:
        while True:
            await socket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(socket)


@app.get("/api/v1/documents", response_model=list[DocumentResponse])
async def documents() -> list[Document]:
    async with SessionFactory() as session:
        result = await session.execute(select(Document).order_by(desc(Document.created_at)))
        return list(result.scalars().all())


@app.get("/api/v1/documents/{document_id}/nodes", response_model=list[ASTNodeResponse])
async def document_nodes(document_id: UUID) -> list[ASTNode]:
    async with SessionFactory() as session:
        result = await session.execute(select(ASTNode).where(ASTNode.document_id == document_id).order_by(ASTNode.node_order))
        return list(result.scalars().all())


@app.get("/api/v1/documents/{document_id}/file")
async def document_file(document_id: UUID) -> FileResponse:
    async with SessionFactory() as session:
        document = await session.get(Document, document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        source_path = Path(document.storage_path) if document.storage_path else stored_source_path(str(document.id), document.filename)
        filename = Path(document.filename).name or "source.bin"
        extension = Path(filename).suffix.lower()

    if not source_path.is_file():
        raise HTTPException(status_code=404, detail="Document file not found")

    media_type = {
        ".pdf": "application/pdf",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".json": "application/json",
        ".txt": "text/plain",
        ".md": "text/plain",
    }.get(extension, "application/octet-stream")
    safe_header_filename = filename.replace("\\", "_").replace('"', "'").replace("\r", "").replace("\n", "")
    return FileResponse(
        source_path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{safe_header_filename}"'},
    )


@app.post("/api/v1/copilot/chat", response_model=CopilotChatResponse)
async def copilot_chat(request: CopilotChatRequest) -> CopilotChatResponse:
    async with SessionFactory() as session:
        query = (
            select(ASTNode, Document)
            .join(Document, ASTNode.document_id == Document.id)
            .where(Document.source_format != SourceFormat.XLSX)
            .order_by(ASTNode.node_order)
        )
        if request.document_id is not None:
            query = query.where(ASTNode.document_id == request.document_id)
        rows = list((await session.execute(query)).all())

    ranked = _rank_copilot_nodes(request.prompt, rows)
    if not ranked:
        return _insufficient_copilot_response()

    _, selected_node, selected_document = ranked[0]
    source_texts = [node.verbatim_text for _, node, _ in ranked]
    claimed_quote = selected_node.verbatim_text
    gate = run_verification_gate([claimed_quote], source_texts)
    if not gate.passed:
        return _insufficient_copilot_response()

    page = selected_node.page_number or 1
    inline_citation = f"[{selected_document.filename}:{page}]"
    citation = CitationMatch(
        quote=claimed_quote,
        ast_node_id=str(selected_node.id),
        page_number=selected_node.page_number,
        bounding_box=selected_node.bounding_box,
        document_filename=selected_document.filename,
        confidence_score=gate.best_citation_score,
    )
    return CopilotChatResponse(
        answer=f"{claimed_quote} {inline_citation}",
        verification_status=VerificationStatus.VERIFIED.value,
        match_score=gate.best_citation_score,
        citations=[citation],
    )


@app.get("/api/v1/work-items", response_model=list[WorkItemResponse])
async def work_items(
    priority_tier: str | None = None, category: str | None = None, verification_status: str | None = None,
    resolved_by_tier: str | None = None,
) -> list[WorkItem]:
    async with SessionFactory() as session:
        query = select(WorkItem).order_by(WorkItem.priority_score.desc(), WorkItem.created_at)
        if priority_tier:
            query = query.where(WorkItem.priority_tier == priority_tier)
        if category:
            query = query.where(WorkItem.category == category)
        if verification_status:
            query = query.where(WorkItem.verification_status == verification_status)
        if resolved_by_tier:
            query = query.where(WorkItem.resolved_by_tier == resolved_by_tier)
        result = await session.execute(query)
        return list(result.scalars().all())


@app.get("/api/v1/search", response_model=list[WorkItemResponse])
async def search(query: str) -> list[WorkItem]:
    """Search prompts, categories, and gated outputs across the persisted workbench."""
    normalized = query.strip()
    if not normalized:
        return []
    pattern = f"%{normalized}%"
    async with SessionFactory() as session:
        result = await session.execute(
            select(WorkItem)
            .where(or_(WorkItem.prompt_or_question.ilike(pattern), WorkItem.category.ilike(pattern), WorkItem.fluent_output.ilike(pattern)))
            .order_by(WorkItem.priority_score.desc())
            .limit(25)
        )
        return list(result.scalars().all())


@app.get("/api/v1/work-items/{work_item_id}", response_model=WorkItemResponse)
async def work_item(work_item_id: UUID) -> WorkItem:
    async with SessionFactory() as session:
        item = await session.get(WorkItem, work_item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Work item not found")
        return item


@app.get("/api/v1/audit-log", response_model=list[AuditResponse])
async def audit_log() -> list[AuditLog]:
    async with SessionFactory() as session:
        result = await session.execute(select(AuditLog).order_by(desc(AuditLog.id)).limit(250))
        return list(result.scalars().all())


async def _upload_document(file: UploadFile) -> Document:
    filename = safe_filename(file.filename or "")
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS or (file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES):
        raise HTTPException(status_code=415, detail="Upload a PDF, XLSX, JSON, TXT, or Markdown file")
    document_id = uuid4()
    destination = stored_source_path(str(document_id), filename)
    with destination.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            await asyncio.to_thread(output.write, chunk)
    await file.close()
    source_format = {
        ".pdf": SourceFormat.DIGITAL_PDF,
        ".xlsx": SourceFormat.XLSX,
        ".json": SourceFormat.JSON_CONFIG,
        ".txt": SourceFormat.TEXT,
        ".md": SourceFormat.TEXT,
    }[extension]
    async with SessionFactory() as session:
        document = await persist_ingestion_stream(
            session,
            uuid4(),
            filename,
            source_format,
            stream_file(destination, document_id),
            document_id=document_id,
            storage_path=str(destination),
        )
        document.file_size_bytes = destination.stat().st_size
        complete = await verify_ingestion_completeness(session, document.id, document.ast_checksum)
        await session.commit()
        if not complete:
            raise HTTPException(status_code=422, detail="Ingestion completeness verification failed")
        return document


@app.post("/api/v1/documents/upload", response_model=DocumentResponse)
async def upload_document(file: UploadFile = File(...)) -> Document:
    return await _upload_document(file)


@app.post("/api/v1/ingest", response_model=DocumentResponse)
async def ingest(file: UploadFile = File(...)) -> Document:
    return await _upload_document(file)


@app.post("/api/v1/demo/seed", response_model=SeedResponse)
async def seed_demo() -> SeedResponse:
    workspace_id = uuid4()
    batch_id = uuid4()
    fixture_paths = await asyncio.to_thread(_write_demo_fixtures)
    async with SessionFactory() as session:
        documents_to_process = await _prepare_demo_documents(session, workspace_id, fixture_paths)
        work = await run_regiment(session, workspace_id, batch_id, documents_to_process, manager.sink)
        return SeedResponse(
            workspace_id=workspace_id, batch_id=batch_id, document_count=len(documents_to_process),
            work_item_count=len(work), critical_count=sum(1 for item in work if _enum_value(item.priority_tier) == "P0_CRITICAL"),
        )


@app.post("/api/v1/jobs/demo", response_model=JobExecutionResponse)
async def start_demo_job() -> dict[str, Any]:
    """Start a background demo run that can be paused between atomic agent steps."""
    state = await job_controller.create(uuid4(), uuid4())
    asyncio.create_task(_run_demo_job(state.job_id))
    return job_controller.snapshot(state)


@app.post("/api/v1/jobs/start", response_model=JobExecutionResponse)
async def start_job(request: JobStartRequest | None = None) -> dict[str, Any]:
    """Start the seven-agent review for one uploaded document or the current corpus."""

    async with SessionFactory() as session:
        query = select(Document).order_by(desc(Document.created_at))
        if request and request.document_id:
            query = query.where(Document.id == request.document_id)
        documents_to_process = list((await session.execute(query)).scalars().all())
    if not documents_to_process:
        raise HTTPException(status_code=404, detail="Upload a source before starting a review")
    state = await job_controller.create(documents_to_process[0].workspace_id, uuid4())
    asyncio.create_task(_run_uploaded_job(state.job_id, documents_to_process))
    return job_controller.snapshot(state)


async def _prepare_demo_documents(
    session: AsyncSession,
    workspace_id: UUID,
    fixture_paths: list[tuple[str, SourceFormat, Path]],
) -> list[Document]:
    await session.execute(delete(ASTNode))
    await session.execute(delete(WorkItem))
    await session.execute(delete(AuditLog))
    await session.execute(delete(Document))
    await session.commit()
    documents: list[Document] = []
    for filename, source_format, path in fixture_paths:
        document_id = uuid4()
        document = await persist_ingestion_stream(
            session, workspace_id, filename, source_format, stream_file(path, document_id),
            document_id=document_id, storage_path=str(path),
        )
        document.file_size_bytes = path.stat().st_size
        if not await verify_ingestion_completeness(session, document.id, document.ast_checksum):
            raise HTTPException(status_code=422, detail=f"Ingestion completeness failed for {filename}")
        document.category = "Security & Compliance"
        document.effective_date = date_for_filename(filename)
        document.is_latest_version = "2023" not in filename
        documents.append(document)
    await session.commit()
    return documents


async def _run_demo_job(job_id: UUID) -> None:
    state = await job_controller.get(job_id)
    if state is None:
        return
    try:
        fixture_paths = await asyncio.to_thread(_write_demo_fixtures)
        async with SessionFactory() as session:
            documents_to_process = await _prepare_demo_documents(session, state.workspace_id, fixture_paths)
            await run_regiment(
                session, state.workspace_id, state.batch_id, documents_to_process, manager.sink,
                controller=job_controller, job_id=job_id,
            )
        await job_controller.complete(job_id)
    except Exception as error:
        await job_controller.fail(job_id, str(error))


async def _run_uploaded_job(job_id: UUID, documents: list[Document]) -> None:
    state = await job_controller.get(job_id)
    if state is None:
        return
    try:
        async with SessionFactory() as session:
            persisted: list[Document] = []
            for document in documents:
                record = await session.get(Document, document.id)
                if record is not None:
                    persisted.append(record)
            await run_regiment(
                session, state.workspace_id, state.batch_id, persisted, manager.sink,
                controller=job_controller, job_id=job_id,
            )
        await job_controller.complete(job_id)
    except Exception as error:
        await job_controller.fail(job_id, str(error))


@app.get("/api/v1/jobs/{job_id}", response_model=JobExecutionResponse)
async def get_job(job_id: UUID) -> dict[str, Any]:
    state = await job_controller.get(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_controller.snapshot(state)


@app.post("/api/v1/jobs/{job_id}/interrupt", response_model=JobExecutionResponse)
async def interrupt_job(job_id: UUID) -> dict[str, Any]:
    try:
        state = await job_controller.request_interrupt(job_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Job not found") from error
    return job_controller.snapshot(state)


@app.post("/api/v1/jobs/{job_id}/pause", response_model=JobExecutionResponse)
async def pause_job(job_id: UUID) -> dict[str, Any]:
    """Named pause alias used by the live copilot."""

    return await interrupt_job(job_id)


@app.post("/api/v1/jobs/{job_id}/resume", response_model=JobExecutionResponse)
async def resume_job(job_id: UUID, request: JobResumeRequest) -> dict[str, Any]:
    try:
        state = await job_controller.resume(job_id, request.instruction)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Job not found") from error
    return job_controller.snapshot(state)


@app.get("/api/v1/escalations", response_model=list[EscalationResponse])
async def escalations() -> list[EscalationResponse]:
    async with SessionFactory() as session:
        result = await session.execute(
            select(WorkItem).where(WorkItem.verification_status != VerificationStatus.VERIFIED).order_by(WorkItem.priority_score.desc())
        )
        items = list(result.scalars().all())
        return [
            EscalationResponse(
                work_item_id=item.id,
                reason="Evidence gate failed; source proof is insufficient for an autonomous answer.",
                prompt_or_question=item.prompt_or_question,
                priority_tier=_enum_value(item.priority_tier),
                verification_status=_enum_value(item.verification_status),
                fluent_output=item.fluent_output,
            )
            for item in items
        ]


@app.post("/api/v1/escalations/{work_item_id}/resolve", response_model=WorkItemResponse)
async def resolve_escalation(work_item_id: UUID, request: EscalationActionRequest) -> WorkItem:
    async with SessionFactory() as session:
        item = await session.get(WorkItem, work_item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Escalation not found")
        if request.action == "manual_correction":
            correction = (request.correction or "").strip()
            if not correction:
                raise HTTPException(status_code=422, detail="A manual correction is required")
            item.fluent_output = correction
            item.verification_status = VerificationStatus.VERIFIED
            item.priority_tier = PriorityTier.P2_MEDIUM
            item.priority_score = 50
        elif request.action == "retry":
            item.verification_status = VerificationStatus.NEEDS_HUMAN_VERIFICATION
            item.fluent_output = "Deep vision retry requested — awaiting a fresh source pass."
        else:
            item.verification_status = VerificationStatus.VERIFIED
            item.priority_tier = PriorityTier.P3_LOW
            item.priority_score = 10
            item.fluent_output = "Marked not applicable by reviewer."
        session.add(
            AuditLog(
                work_item_id=item.id,
                agent_name="Human Review",
                action=f"ESCALATION_{request.action.upper()}",
                input_hash=payload_hash(request.model_dump()),
                output_hash=payload_hash({"status": item.verification_status.value, "output": item.fluent_output}),
                model_name="human-review-console",
                processing_time_ms=1,
                metadata_json={"action": request.action},
            )
        )
        await session.commit()
        await session.refresh(item)
        return item


@app.post("/api/v1/sandbox/check", response_model=SandboxResponse)
async def sandbox_check(request: SandboxRequest) -> SandboxResponse:
    started = time.perf_counter()

    async def record(result: SandboxResponse) -> SandboxResponse:
        async with SessionFactory() as session:
            session.add(
                AuditLog(
                    agent_name="Citation Gate",
                    action=f"SANDBOX_{request.test.upper()}",
                    input_hash=payload_hash(request.model_dump()),
                    output_hash=payload_hash(result.model_dump()),
                    model_name="deterministic-rapidfuzz-logprob-gate",
                    processing_time_ms=max(1, int((time.perf_counter() - started) * 1000)),
                    metadata_json={"sandbox": True},
                )
            )
            await session.commit()
        return result

    if request.test == "citation":
        quote = request.quote or ""
        gate = run_verification_gate([quote], ["Access control requires multifactor authentication for privileged accounts."])
        return await record(SandboxResponse(
            passed=gate.passed, status="VERIFIED" if gate.passed else VerificationStatus.INSUFFICIENT_EVIDENCE.value,
            priority_tier="P2_MEDIUM" if gate.passed else PriorityTier.P0_CRITICAL.value,
            message="Citation accepted by the corpus gate." if gate.passed else INSUFFICIENT_EVIDENCE_OUTPUT,
            score=gate.best_citation_score,
        ))
    if request.test == "logprob":
        probability = request.probability if request.probability is not None else 0.0
        passed = probability >= 0.92
        return await record(SandboxResponse(
            passed=passed, status="VERIFIED" if passed else VerificationStatus.NEEDS_HUMAN_VERIFICATION.value,
            priority_tier="P2_MEDIUM" if passed else PriorityTier.P0_CRITICAL.value,
            message="Critical entity confidence clears the gate." if passed else "Critical entity confidence requires human verification.",
            score=probability * 100,
        ))
    expected = request.expected_checksum or ""
    actual = request.actual_checksum or ""
    passed = expected == actual and bool(expected)
    return await record(SandboxResponse(
        passed=passed, status="VERIFIED" if passed else VerificationStatus.INSUFFICIENT_EVIDENCE.value,
        priority_tier="P2_MEDIUM" if passed else PriorityTier.P0_CRITICAL.value,
        message="AST checksum confirms completeness." if passed else "AST checksum mismatch: a source row or paragraph is missing.",
        score=100.0 if passed else 0.0,
    ))


@app.get("/api/v1/export/questionnaire.xlsx")
async def export_questionnaire() -> FileResponse:
    from bert.ingestion.xlsx_handler import XLSXHandler

    async with SessionFactory() as session:
        result = await session.execute(select(WorkItem).order_by(WorkItem.created_at))
        items = list(result.scalars().all())
    source = DATA_DIR / "Enterprise_Security_Questionnaire.xlsx"
    if not source.exists():
        await asyncio.to_thread(_write_demo_fixtures)
    await asyncio.to_thread(
        XLSXHandler.write_back,
        source,
        [
            {
                "row_index": index + 2,
                "fluent_output": item.fluent_output,
                "verification_status": _enum_value(item.verification_status),
            }
            for index, item in enumerate(items)
        ],
    )
    return FileResponse(source, filename="BERT_Completed_Questionnaire.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.get("/api/v1/export/summary.md", response_class=PlainTextResponse)
async def export_summary() -> str:
    async with SessionFactory() as session:
        items = list((await session.execute(select(WorkItem).order_by(WorkItem.priority_score.desc()))).scalars().all())
    verified = sum(_enum_value(item.verification_status) == VerificationStatus.VERIFIED.value for item in items)
    lines = [
        "# BERT Executive Review Summary",
        "",
        f"- Work items processed: {len(items)}",
        f"- Evidence-verified items: {verified}",
        f"- Open human escalations: {len(items) - verified}",
        "",
        "## Findings",
    ]
    lines.extend(f"- **{_enum_value(item.priority_tier)}** · {item.category}: {item.prompt_or_question} — {item.fluent_output}" for item in items)
    return "\n".join(lines) + "\n"


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def date_for_filename(filename: str) -> date:
    return date(2023 if "2023" in filename else 2026, 1, 1)


_COPILOT_STOP_WORDS = frozenset(
    {
        "a", "an", "and", "are", "be", "by", "can", "contain", "does", "for", "from", "how",
        "in", "is", "of", "on", "the", "to", "what", "which", "who", "with", "used", "all",
        "company", "current", "provide", "please", "tell",
    }
)
_COPILOT_GENERIC_TERMS = frozenset({"control", "data", "document", "information", "policy", "security", "system"})


def _copilot_terms(value: str) -> set[str]:
    terms = set(re.findall(r"[a-z0-9]+(?:[-:*][a-z0-9]+)*", value.lower()))
    terms.difference_update(_COPILOT_STOP_WORDS)
    if {"mfa", "2fa", "multifactor"} & terms or "multi-factor" in value.lower():
        terms.difference_update({"mfa", "2fa", "multifactor"})
        terms.add("mfa")
    return terms


def _rank_copilot_nodes(
    prompt: str, rows: list[tuple[ASTNode, Document]]
) -> list[tuple[float, ASTNode, Document]]:
    query_terms = _copilot_terms(prompt)
    if not query_terms:
        return []
    ranked: list[tuple[float, ASTNode, Document]] = []
    for node, document in rows:
        source_terms = _copilot_terms(node.verbatim_text)
        overlap = query_terms & source_terms
        if not overlap:
            continue
        if not overlap - _COPILOT_GENERIC_TERMS:
            continue
        score = len(overlap) / len(query_terms)
        if score >= 0.20:
            ranked.append((score, node, document))
    # Prefer the fuller policy clause over a compact table row when both carry
    # the same question terms.  The selected text remains verbatim evidence.
    ranked.sort(key=lambda item: (item[0], len(item[1].verbatim_text), -item[1].node_order), reverse=True)
    return ranked


def _insufficient_copilot_response() -> CopilotChatResponse:
    return CopilotChatResponse(
        answer=INSUFFICIENT_EVIDENCE_OUTPUT,
        verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE.value,
        match_score=0.0,
        citations=[],
    )


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _write_binary_pdf(path: Path, pages: list[list[str]]) -> None:
    """Write a small standards-compliant PDF without external canvas state."""
    page_ids = list(range(3, 3 + len(pages)))
    font_id = 3 + len(pages)
    content_ids = list(range(font_id + 1, font_id + 1 + len(pages)))
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(pages)} >>".encode(),
    ]
    for page_id, content_id in zip(page_ids, content_ids):
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>".encode()
        )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for page in pages:
        commands = ["BT", "/F1 16 Tf", "72 744 Td"]
        for line_index, line in enumerate(page):
            if line_index:
                commands.append("0 -22 Td")
            commands.append(f"({_pdf_escape(line)}) Tj")
        commands.append("ET")
        content = "\n".join(commands).encode("latin-1")
        objects.append(f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_number, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{object_number} 0 obj\n".encode())
        output.extend(body)
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    )
    path.write_bytes(output)


def _write_demo_fixtures() -> list[tuple[str, SourceFormat, Path]]:
    DATA_DIR.mkdir(exist_ok=True)
    files: list[tuple[str, SourceFormat, Path]] = []
    pdf_sources = {
        "SOC2_Type_II_2026.pdf": [
            "SOC 2 Type II 2026",
            "Access control requires multifactor authentication for privileged accounts.",
            "Encryption at rest uses AES-256 and keys are rotated annually.",
            "Access | Control | MFA required | Privileged accounts",
            "[LOW_CONFIDENCE] STAMP NOTE: Compliance addendum reviewed 2026-02-14",
        ],
        "Legacy_InfoSec_Policy_2023.pdf": [
            "Legacy Information Security Policy 2023",
            "Password rotation is required every 90 days for all workforce accounts.",
            "The 2023 policy applies to all production systems.",
        ],
    }
    for filename, lines in pdf_sources.items():
        path = DATA_DIR / filename
        _write_binary_pdf(path, [lines])
        files.append((filename, SourceFormat.DIGITAL_PDF, path))
    json_path = DATA_DIR / "aws_iam_prod_config.json"
    json_path.write_text(json.dumps({
        "rules": {
            "production-read": {"effect": "Allow", "action": "s3:GetObject", "resource": "arn:aws:s3:::prod/*"},
            "wildcard-admin": {"effect": "Allow", "action": "s3:*", "resource": "*"},
        },
        "owner": "Platform Security",
    }), encoding="utf-8")
    files.append((json_path.name, SourceFormat.JSON_CONFIG, json_path))
    xlsx_path = DATA_DIR / "Enterprise_Security_Questionnaire.xlsx"
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Questionnaire"
    sheet.append(["Question", "Scope"])
    questions = [
        "Does the company enforce MFA for privileged accounts?",
        "Which encryption standard is used at rest?",
        "What is the password rotation conflict between policies?",
        "Does AWS production contain a wildcard S3 action?",
        "What is the effective date of the current control policy?",
        "Which access control evidence is available?",
        "Which data retention control is documented?",
        "Which liability and indemnification cap is documented?",
        "How are production keys rotated?",
        "What is the current authentication policy?",
        "Unanswerable: provide the vendor's cyber insurance limit.",
        "Unanswerable: identify the exact retention duration for litigation holds.",
    ]
    for question in questions:
        sheet.append([question, "Enterprise security review"])
    workbook.save(xlsx_path)
    workbook.close()
    files.append((xlsx_path.name, SourceFormat.XLSX, xlsx_path))
    return files
