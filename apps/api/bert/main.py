"""Single FastAPI entrypoint for BERT's local-first document intelligence API."""

from __future__ import annotations

import asyncio
import json
import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response
from sqlalchemy import delete, desc, inspect, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from bert.agents.controller import JobController
from bert.agents.pipeline import (
    persist_executive_summary,
    persist_ingestion_stream,
    run_regiment,
    verify_node_region,
)
from bert.api.schemas import (
    ASTNodeResponse,
    AuditResponse,
    CitationMatch,
    CopilotChatRequest,
    CopilotChatResponse,
    DocumentResponse,
    EscalationActionRequest,
    EscalationResponse,
    ExecutiveSummaryResponse,
    JobExecutionResponse,
    JobResumeRequest,
    JobStartRequest,
    SandboxRequest,
    SandboxResponse,
    SeedResponse,
    SummaryGenerateRequest,
    UndoRequest,
    WorkItemResponse,
)
from bert.api.websocket import WebSocketManager
from bert.config import settings
from bert.ingestion.checksum import verify_ingestion_completeness
from bert.ingestion.docling_parser import DoclingParser
from bert.ingestion.router import ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, safe_filename, stream_file
from bert.models.base import Base, SessionFactory, engine
from bert.models.documents import (
    ASTNode,
    AuditLog,
    Document,
    ExecutiveSummaryRecord,
    JobExecution,
    PriorityTier,
    ResolvedByTier,
    SourceFormat,
    VerificationStatus,
    WorkItem,
    utc_now,
)
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

        audit_columns = await connection.run_sync(
            lambda sync_connection: {column["name"] for column in inspect(sync_connection).get_columns("audit_log")}
        )
        if "metadata" not in audit_columns:
            await connection.execute(text("ALTER TABLE audit_log ADD COLUMN metadata JSON"))

        ast_columns = await connection.run_sync(
            lambda sync_connection: {column["name"] for column in inspect(sync_connection).get_columns("ast_nodes")}
        )
        if "locator" not in ast_columns:
            await connection.execute(text("ALTER TABLE ast_nodes ADD COLUMN locator JSON"))

        work_item_columns = await connection.run_sync(
            lambda sync_connection: {column["name"] for column in inspect(sync_connection).get_columns("work_items")}
        )
        work_item_migrations = {
            "escalation_reason": "ALTER TABLE work_items ADD COLUMN escalation_reason TEXT",
            "escalation_assignee": "ALTER TABLE work_items ADD COLUMN escalation_assignee VARCHAR(200)",
            "escalated_at": "ALTER TABLE work_items ADD COLUMN escalated_at DATETIME",
            "escalated_by": "ALTER TABLE work_items ADD COLUMN escalated_by VARCHAR(200)",
            "original_priority_tier": "ALTER TABLE work_items ADD COLUMN original_priority_tier VARCHAR(20)",
            "previous_state_snapshot": "ALTER TABLE work_items ADD COLUMN previous_state_snapshot JSON",
        }
        for col_name, ddl in work_item_migrations.items():
            if col_name not in work_item_columns:
                await connection.execute(text(ddl))


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
        query = select(ASTNode, Document).join(Document, ASTNode.document_id == Document.id).order_by(ASTNode.node_order)
        if request.document_id is not None:
            query = query.where(ASTNode.document_id == request.document_id)
        else:
            query = query.where(Document.source_format != SourceFormat.XLSX)
        rows = list((await session.execute(query)).all())

    ranked = _rank_copilot_nodes(request.prompt, rows)
    if not ranked:
        return _insufficient_copilot_response()

    _, selected_node, selected_document = ranked[0]
    if selected_node.ocr_confidence < 0.90:
        return _insufficient_copilot_response()

    source_texts = [node.verbatim_text for _, node, _ in ranked]
    claimed_quote = selected_node.verbatim_text
    gate = run_verification_gate([claimed_quote], source_texts)
    region_passed, region_match_score = verify_node_region(selected_node, selected_document, claimed_quote)
    if not gate.passed or not region_passed:
        return _insufficient_copilot_response()

    locator_dict = dict(selected_node.locator) if selected_node.locator else None
    if locator_dict is not None and not locator_dict.get("checksum"):
        locator_dict["checksum"] = selected_document.ast_checksum

    if locator_dict and locator_dict.get("source_type") == "json":
        inline_citation = f"[{selected_document.filename}:{locator_dict.get('json_path')}]"
    elif locator_dict and locator_dict.get("source_type") == "xlsx":
        inline_citation = f"[{selected_document.filename}:{locator_dict.get('sheet')}!{locator_dict.get('col_range')}]"
    else:
        page = selected_node.page_number or 1
        inline_citation = f"[{selected_document.filename}:{page}]"

    citation = CitationMatch(
        quote=claimed_quote,
        ast_node_id=str(selected_node.id),
        page_number=selected_node.page_number,
        bounding_box=selected_node.bounding_box,
        document_filename=selected_document.filename,
        confidence_score=gate.best_citation_score,
        locator=locator_dict,
        region_match_score=region_match_score,
    )
    return CopilotChatResponse(
        answer=f"{claimed_quote} {inline_citation}",
        verification_status=VerificationStatus.VERIFIED.value,
        match_score=gate.best_citation_score,
        citations=[citation],
    )


@app.get("/api/v1/work-items", response_model=list[WorkItemResponse])
async def work_items(
    priority_tier: str | None = None,
    category: str | None = None,
    verification_status: str | None = None,
    resolved_by_tier: str | None = None,
    document_id: str | None = None,
) -> list[WorkItem]:
    parsed_doc_id = _parse_optional_uuid(document_id)
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
        if parsed_doc_id is not None:
            query = query.where(WorkItem.document_id == parsed_doc_id)
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
    if extension == ".pdf":
        source_format = await asyncio.to_thread(DoclingParser().detect_source_format, destination)
    else:
        source_format = {
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
            workspace_id=workspace_id,
            batch_id=batch_id,
            document_count=len(documents_to_process),
            work_item_count=len(work),
            critical_count=sum(1 for item in work if _enum_value(item.priority_tier) == "P0_CRITICAL"),
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
    await session.execute(delete(ExecutiveSummaryRecord))
    await session.execute(delete(Document))
    await session.commit()
    documents: list[Document] = []
    for filename, source_format, path in fixture_paths:
        document_id = uuid4()
        actual_format = source_format
        if path.suffix.lower() == ".pdf":
            actual_format = await asyncio.to_thread(DoclingParser().detect_source_format, path)
        document = await persist_ingestion_stream(
            session,
            workspace_id,
            filename,
            actual_format,
            stream_file(path, document_id),
            document_id=document_id,
            storage_path=str(path),
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
                session,
                state.workspace_id,
                state.batch_id,
                documents_to_process,
                manager.sink,
                controller=job_controller,
                job_id=job_id,
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
                session,
                state.workspace_id,
                state.batch_id,
                persisted,
                manager.sink,
                controller=job_controller,
                job_id=job_id,
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
            select(WorkItem)
            .where(WorkItem.verification_status != VerificationStatus.VERIFIED)
            .order_by(WorkItem.priority_score.desc(), WorkItem.created_at)
        )
        items = list(result.scalars().all())
        return [
            EscalationResponse(
                work_item_id=item.id,
                document_id=item.document_id,
                reason=_escalation_display_reason(item),
                prompt_or_question=item.prompt_or_question,
                priority_tier=_enum_value(item.priority_tier),
                verification_status=_enum_value(item.verification_status),
                fluent_output=item.fluent_output,
                escalation_reason=item.escalation_reason,
                escalation_assignee=item.escalation_assignee,
                escalated_at=item.escalated_at,
                escalated_by=item.escalated_by,
                original_priority_tier=item.original_priority_tier,
                can_undo=item.can_undo,
                verified_citations=item.verified_citations or [],
            )
            for item in items
        ]


@app.post("/api/v1/escalations/{work_item_id}/resolve", response_model=WorkItemResponse)
async def resolve_escalation(work_item_id: UUID, request: EscalationActionRequest) -> WorkItem:
    async with SessionFactory() as session:
        item = await session.get(WorkItem, work_item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Escalation not found")

        if request.action == "undo":
            return await _apply_work_item_undo(
                session,
                item,
                actor=request.actor,
                note=request.note,
            )

        snapshot = _snapshot_work_item(item)
        actor = (
            (request.actor or "").strip()
            or str((request.manual_payload or {}).get("actor") or (request.manual_payload or {}).get("approver_id") or "").strip()
            or "Compliance Reviewer"
        )
        assignee = (
            (request.assignee or "").strip()
            or str((request.manual_payload or {}).get("assignee") or "").strip()
            or None
        )
        reason_code = (request.reason_code or "").strip()
        note_text = (request.note or "").strip()
        if reason_code and note_text and reason_code != note_text:
            reason: str | None = f"{reason_code}: {note_text}"
        else:
            reason = reason_code or note_text or None
        now = utc_now()

        if item.original_priority_tier is None:
            item.original_priority_tier = _enum_value(item.priority_tier)

        if request.action == "manual_correction":
            correction = (request.correction or "").strip()
            if not correction:
                raise HTTPException(status_code=422, detail="A manual correction is required")
            item.previous_state_snapshot = snapshot
            item.fluent_output = correction
            item.verification_status = VerificationStatus.VERIFIED
            item.priority_tier = PriorityTier.P2_MEDIUM
            item.priority_score = 50
            item.resolved_by_tier = ResolvedByTier.HUMAN_IN_THE_LOOP
            item.escalation_reason = reason or item.escalation_reason
            item.escalated_by = actor
            item.escalated_at = now
        elif request.action == "retry":
            item.previous_state_snapshot = snapshot
            item.verification_status = VerificationStatus.NEEDS_HUMAN_VERIFICATION
            item.fluent_output = "Deep vision retry requested — awaiting a fresh source pass."
            item.escalation_reason = reason or "Deep vision retry requested."
            item.escalated_by = actor
            item.escalated_at = now
        elif request.action == "counsel":
            item.previous_state_snapshot = snapshot
            # Preserve original priority_tier and priority_score for legal counsel escalation.
            item.verification_status = VerificationStatus.ESCALATED_LEGAL
            item.escalation_reason = reason or (request.correction or "").strip() or "Referred to legal counsel for review."
            item.escalation_assignee = assignee or "Legal Counsel"
            item.escalated_at = now
            item.escalated_by = actor
            item.fluent_output = f"Escalated to {item.escalation_assignee}: {item.escalation_reason}"
        elif request.action == "approve":
            item.previous_state_snapshot = snapshot
            item.verification_status = VerificationStatus.VERIFIED
            item.resolved_by_tier = ResolvedByTier.HUMAN_IN_THE_LOOP
            correction = (request.correction or "").strip()
            if correction:
                item.fluent_output = correction
            elif item.fluent_output == INSUFFICIENT_EVIDENCE_OUTPUT or "human verification" in item.fluent_output.lower():
                facts = item.structured_facts or []
                fact_quote = str(facts[0].get("verbatim_quote", "")).strip() if facts else ""
                item.fluent_output = f"Reviewer approved extracted evidence: {fact_quote}" if fact_quote else "Reviewer approved finding."
            item.escalation_reason = reason or item.escalation_reason
            item.escalated_by = actor
            item.escalated_at = now
        else:  # "skip"
            item.previous_state_snapshot = snapshot
            item.verification_status = VerificationStatus.VERIFIED
            item.priority_tier = PriorityTier.P3_LOW
            item.priority_score = 10
            item.resolved_by_tier = ResolvedByTier.HUMAN_IN_THE_LOOP
            item.fluent_output = (request.note or "").strip() or "Marked not applicable by reviewer."
            item.escalation_reason = reason or item.escalation_reason
            item.escalated_by = actor
            item.escalated_at = now

        session.add(
            AuditLog(
                document_id=item.document_id,
                work_item_id=item.id,
                agent_name="Human Review",
                action=f"ESCALATION_{request.action.upper()}",
                input_hash=payload_hash(request.model_dump()),
                output_hash=payload_hash(
                    {
                        "status": _enum_value(item.verification_status),
                        "priority_tier": _enum_value(item.priority_tier),
                        "output": item.fluent_output,
                        "assignee": item.escalation_assignee,
                        "reason": item.escalation_reason,
                    }
                ),
                model_name="human-review-console",
                processing_time_ms=1,
                metadata_json={
                    "action": request.action,
                    "actor": actor,
                    "when": now.isoformat(),
                    "reason": item.escalation_reason,
                    "reason_code": request.reason_code,
                    "assignee": item.escalation_assignee,
                    "original_priority_tier": item.original_priority_tier,
                    "manual_payload": request.manual_payload,
                },
            )
        )
        summary_record = await _invalidate_and_regenerate_summary(session, workspace_id=item.workspace_id)
        await session.commit()
        await session.refresh(item)

    await manager.sink.publish({"type": "work_item", "id": str(item.id), "status": _enum_value(item.verification_status)})
    await manager.sink.publish(
        {
            "type": "summary_generated",
            "summary_id": str(summary_record.id),
            "document_id": None,
            "total_work_items": summary_record.total_work_items,
            "verified_count": summary_record.verified_count,
            "escalated_legal_count": summary_record.escalated_legal_count,
            "defensibility_score": summary_record.defensibility_score,
        }
    )
    return item


@app.post("/api/v1/work-items/{work_item_id}/undo", response_model=WorkItemResponse)
async def undo_work_item(work_item_id: UUID, request: UndoRequest | None = None) -> WorkItem:
    async with SessionFactory() as session:
        item = await session.get(WorkItem, work_item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Work item not found")
        return await _apply_work_item_undo(
            session,
            item,
            actor=request.actor if request else None,
            note=request.note if request else None,
        )


@app.get("/api/v1/summary", response_model=ExecutiveSummaryResponse)
async def get_summary(
    document_id: str | None = None,
    only_critical: bool = False,
    latest_only: bool = False,
) -> ExecutiveSummaryRecord:
    parsed_doc_id = _parse_optional_uuid(document_id)
    async with SessionFactory() as session:
        record, generated = await _get_or_generate_summary(
            session,
            document_id=parsed_doc_id,
            only_critical=only_critical,
            latest_only=latest_only,
        )
    if generated:
        await manager.sink.publish(
            {
                "type": "summary_generated",
                "summary_id": str(record.id),
                "document_id": str(record.document_id) if record.document_id else None,
                "total_work_items": record.total_work_items,
                "verified_count": record.verified_count,
                "escalated_legal_count": record.escalated_legal_count,
                "defensibility_score": record.defensibility_score,
            }
        )
    return record


@app.post("/api/v1/summary/generate", response_model=ExecutiveSummaryResponse)
async def generate_summary(
    request: SummaryGenerateRequest | None = None,
    document_id: str | None = None,
    only_critical: bool = False,
    latest_only: bool = False,
) -> ExecutiveSummaryRecord:
    raw_doc_id = request.document_id if request and request.document_id is not None else document_id
    parsed_doc_id = _parse_optional_uuid(raw_doc_id)
    crit_flag = request.only_critical if request is not None else only_critical
    latest_flag = request.latest_only if request is not None else latest_only

    async with SessionFactory() as session:
        record, _ = await _get_or_generate_summary(
            session,
            document_id=parsed_doc_id,
            only_critical=crit_flag,
            latest_only=latest_flag,
            force_regenerate=True,
        )
    await manager.sink.publish(
        {
            "type": "summary_generated",
            "summary_id": str(record.id),
            "document_id": str(record.document_id) if record.document_id else None,
            "total_work_items": record.total_work_items,
            "verified_count": record.verified_count,
            "escalated_legal_count": record.escalated_legal_count,
            "defensibility_score": record.defensibility_score,
        }
    )
    return record


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
        return await record(
            SandboxResponse(
                passed=gate.passed,
                status="VERIFIED" if gate.passed else VerificationStatus.INSUFFICIENT_EVIDENCE.value,
                priority_tier="P2_MEDIUM" if gate.passed else PriorityTier.P0_CRITICAL.value,
                message="Citation accepted by the corpus gate." if gate.passed else INSUFFICIENT_EVIDENCE_OUTPUT,
                score=gate.best_citation_score,
            )
        )
    if request.test == "logprob":
        probability = request.probability if request.probability is not None else 0.0
        passed = probability >= 0.92
        return await record(
            SandboxResponse(
                passed=passed,
                status="VERIFIED" if passed else VerificationStatus.NEEDS_HUMAN_VERIFICATION.value,
                priority_tier="P2_MEDIUM" if passed else PriorityTier.P0_CRITICAL.value,
                message="Critical entity confidence clears the gate." if passed else "Critical entity confidence requires human verification.",
                score=probability * 100,
            )
        )
    expected = request.expected_checksum or ""
    actual = request.actual_checksum or ""
    passed = expected == actual and bool(expected)
    return await record(
        SandboxResponse(
            passed=passed,
            status="VERIFIED" if passed else VerificationStatus.INSUFFICIENT_EVIDENCE.value,
            priority_tier="P2_MEDIUM" if passed else PriorityTier.P0_CRITICAL.value,
            message="AST checksum confirms completeness." if passed else "AST checksum mismatch: a source row or paragraph is missing.",
            score=100.0 if passed else 0.0,
        )
    )


@app.get("/api/v1/export/questionnaire.xlsx")
async def export_questionnaire() -> Response:
    from bert.ingestion.xlsx_handler import XLSXHandler

    async with SessionFactory() as session:
        items = list((await session.execute(select(WorkItem).order_by(WorkItem.created_at))).scalars().all())
        xlsx_doc = (
            await session.execute(
                select(Document).where(Document.source_format == SourceFormat.XLSX).order_by(desc(Document.created_at))
            )
        ).scalars().first()
        question_row_map: dict[str, int] = {}
        target_sheet: str | None = None
        if xlsx_doc is not None:
            q_nodes = (
                await session.execute(select(ASTNode).where(ASTNode.document_id == xlsx_doc.id).order_by(ASTNode.node_order))
            ).scalars().all()
            sheets_seen: set[str] = set()
            for node in q_nodes:
                q_text = str((node.structured_payload or {}).get("row_data", {}).get("Question") or "").strip()
                row_idx = (node.locator or {}).get("row") or (node.structured_payload or {}).get("row_index")
                sheet_val = (node.locator or {}).get("sheet") or (node.structured_payload or {}).get("sheet_name")
                if sheet_val:
                    sheets_seen.add(str(sheet_val))
                if q_text and row_idx:
                    question_row_map[q_text] = int(row_idx)
            if len(sheets_seen) == 1:
                target_sheet = next(iter(sheets_seen))

    source: Path | None = None
    if xlsx_doc is not None and xlsx_doc.storage_path and Path(xlsx_doc.storage_path).is_file():
        source = Path(xlsx_doc.storage_path)
    if source is None:
        source = DATA_DIR / "Enterprise_Security_Questionnaire.xlsx"
        if not source.exists():
            await asyncio.to_thread(_write_demo_fixtures)

    questionnaire_items = [item for item in items if item.item_type == "QUESTIONNAIRE_ROW"] or items
    rows_payload: list[dict[str, Any]] = []
    for index, item in enumerate(questionnaire_items):
        matched_row = question_row_map.get(item.prompt_or_question.strip(), index + 2)
        rows_payload.append(
            {
                "row_index": matched_row,
                "fluent_output": item.fluent_output,
                "verification_status": _enum_value(item.verification_status),
                "escalation_assignee": item.escalation_assignee or "",
                "escalation_reason": item.escalation_reason or "",
            }
        )

    xlsx_bytes = await asyncio.to_thread(XLSXHandler.build_export_bytes, source, rows_payload, sheet_name=target_sheet)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="BERT_Completed_Questionnaire.xlsx"'},
    )


@app.get("/api/v1/export/summary.md", response_class=PlainTextResponse)
async def export_summary(
    document_id: str | None = None,
    only_critical: bool = False,
    latest_only: bool = False,
) -> str:
    parsed_doc_id = _parse_optional_uuid(document_id)
    async with SessionFactory() as session:
        record, _ = await _get_or_generate_summary(
            session,
            document_id=parsed_doc_id,
            only_critical=only_critical,
            latest_only=latest_only,
        )
    return record.markdown


def _parse_optional_uuid(value: str | UUID | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        return UUID(cleaned)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Invalid UUID parameter") from error


def _escalation_display_reason(item: WorkItem) -> str:
    if item.escalation_reason:
        return item.escalation_reason
    if _enum_value(item.verification_status) == VerificationStatus.ESCALATED_LEGAL.value:
        return "Flagged for legal counsel review."
    return "Evidence gate failed; source proof is insufficient for an autonomous answer."


def _snapshot_work_item(item: WorkItem) -> dict[str, Any]:
    return {
        "verification_status": _enum_value(item.verification_status),
        "priority_tier": _enum_value(item.priority_tier),
        "priority_score": int(item.priority_score),
        "fluent_output": item.fluent_output,
        "resolved_by_tier": _enum_value(item.resolved_by_tier),
        "escalation_reason": item.escalation_reason,
        "escalation_assignee": item.escalation_assignee,
        "escalated_at": item.escalated_at.isoformat() if item.escalated_at else None,
        "escalated_by": item.escalated_by,
        "original_priority_tier": item.original_priority_tier,
    }


async def _apply_work_item_undo(
    session: AsyncSession,
    item: WorkItem,
    *,
    actor: str | None = None,
    note: str | None = None,
) -> WorkItem:
    snap = item.previous_state_snapshot
    if not snap:
        raise HTTPException(status_code=409, detail="No previous state snapshot available to undo")

    item.verification_status = VerificationStatus(snap["verification_status"])
    item.priority_tier = PriorityTier(snap["priority_tier"])
    item.priority_score = int(snap["priority_score"])
    item.fluent_output = str(snap["fluent_output"])
    restored_tier = snap.get("resolved_by_tier")
    try:
        item.resolved_by_tier = ResolvedByTier(restored_tier)
    except Exception:
        item.resolved_by_tier = restored_tier  # type: ignore[assignment]
    item.escalation_reason = snap.get("escalation_reason")
    item.escalation_assignee = snap.get("escalation_assignee")
    escalated_at_raw = snap.get("escalated_at")
    item.escalated_at = datetime.fromisoformat(escalated_at_raw) if escalated_at_raw else None
    item.escalated_by = snap.get("escalated_by")
    item.original_priority_tier = snap.get("original_priority_tier")
    item.previous_state_snapshot = None

    now = utc_now()
    actor_name = (actor or "").strip() or "Compliance Reviewer"
    session.add(
        AuditLog(
            document_id=item.document_id,
            work_item_id=item.id,
            agent_name="Human Review",
            action="ESCALATION_UNDO",
            input_hash=payload_hash({"work_item_id": str(item.id), "actor": actor_name, "note": note}),
            output_hash=payload_hash(
                {
                    "status": _enum_value(item.verification_status),
                    "priority_tier": _enum_value(item.priority_tier),
                    "output": item.fluent_output,
                }
            ),
            model_name="human-review-console",
            processing_time_ms=1,
            metadata_json={
                "action": "undo",
                "actor": actor_name,
                "when": now.isoformat(),
                "note": note,
                "restored_status": _enum_value(item.verification_status),
                "restored_priority_tier": _enum_value(item.priority_tier),
            },
        )
    )
    summary_record = await _invalidate_and_regenerate_summary(session, workspace_id=item.workspace_id)
    await session.commit()
    await session.refresh(item)

    await manager.sink.publish({"type": "work_item", "id": str(item.id), "status": _enum_value(item.verification_status)})
    await manager.sink.publish(
        {
            "type": "summary_generated",
            "summary_id": str(summary_record.id),
            "document_id": None,
            "total_work_items": summary_record.total_work_items,
            "verified_count": summary_record.verified_count,
            "escalated_legal_count": summary_record.escalated_legal_count,
            "defensibility_score": summary_record.defensibility_score,
        }
    )
    return item


async def _invalidate_and_regenerate_summary(
    session: AsyncSession,
    *,
    workspace_id: UUID | None = None,
) -> ExecutiveSummaryRecord:
    await session.execute(update(ExecutiveSummaryRecord).values(is_stale=True))
    return await persist_executive_summary(
        session,
        workspace_id=workspace_id,
        mark_prior_stale=False,
    )


async def _get_or_generate_summary(
    session: AsyncSession,
    *,
    document_id: UUID | None,
    only_critical: bool,
    latest_only: bool,
    force_regenerate: bool = False,
) -> tuple[ExecutiveSummaryRecord, bool]:
    if not force_regenerate:
        doc_filter = (
            ExecutiveSummaryRecord.document_id.is_(None)
            if document_id is None
            else ExecutiveSummaryRecord.document_id == document_id
        )
        existing = (
            await session.execute(
                select(ExecutiveSummaryRecord)
                .where(
                    doc_filter,
                    ExecutiveSummaryRecord.only_critical == only_critical,
                    ExecutiveSummaryRecord.latest_only == latest_only,
                    ExecutiveSummaryRecord.is_stale == False,  # noqa: E712
                )
                .order_by(desc(ExecutiveSummaryRecord.created_at))
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False

    record = await persist_executive_summary(
        session,
        document_id=document_id,
        only_critical=only_critical,
        latest_only=latest_only,
        mark_prior_stale=False,
    )
    await session.commit()
    await session.refresh(record)
    return record, True


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
    ranked.sort(key=lambda item: (item[0], len(item[1].verbatim_text), -item[1].node_order), reverse=True)
    return ranked


def _insufficient_copilot_response() -> CopilotChatResponse:
    return CopilotChatResponse(
        answer=INSUFFICIENT_EVIDENCE_OUTPUT,
        verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE.value,
        match_score=0.0,
        citations=[],
    )


def _pdf_escape(text_val: str) -> str:
    return text_val.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


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
    json_path.write_text(
        json.dumps(
            {
                "rules": {
                    "production-read": {"effect": "Allow", "action": "s3:GetObject", "resource": "arn:aws:s3:::prod/*"},
                    "wildcard-admin": {"effect": "Allow", "action": "s3:*", "resource": "*"},
                },
                "owner": "Platform Security",
            }
        ),
        encoding="utf-8",
    )
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
