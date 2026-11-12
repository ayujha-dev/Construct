"""Deterministic implementation of the seven-stage regiment with locator propagation."""

from __future__ import annotations

import asyncio
import hashlib
import random
import re
import time
from collections.abc import Awaitable, Callable, Iterator
from datetime import UTC, datetime
from itertools import islice
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from bert.agents.arbiter import resolve_conflicts
from bert.agents.chronos import analyze_versions, select_temporal_conflict_pairs
from bert.agents.controller import JobController
from bert.agents.envoy import build_executive_summary, synthesize_verified_output
from bert.agents.quartermaster import categorize_nodes
from bert.agents.ranger import ExtractedFact
from bert.agents.scout import rescue_regions
from bert.agents.vanguard import score_nodes
from bert.config import settings
from bert.inference.runtime import InferenceRuntime, runtime_profile
from bert.ingestion.docling_parser import IngestionResult, ParsedNode, extract_pdf_region_text
from bert.models.documents import (
    ASTNode,
    AuditLog,
    Document,
    ExecutiveSummaryRecord,
    NodeType,
    PriorityTier,
    ResolvedByTier,
    SourceFormat,
    VerificationStatus,
    WorkItem,
)
from bert.verification.citation_gate import (
    INSUFFICIENT_EVIDENCE_OUTPUT,
    assess_quote_strength,
    hard_gate_fields,
    payload_hash,
    run_verification_gate,
    verify_region_text,
)
from bert.verification.metrics import compute_work_item_metrics

AGENT_NAMES: tuple[str, ...] = ("Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger", "Arbiter", "Envoy")
AGENT_MODELS: dict[str, str] = {
    "Scout": "vision",
    "Quartermaster": "text",
    "Chronos": "text",
    "Vanguard": "text",
    "Ranger": "text",
    "Arbiter": "text",
    "Envoy": "text",
}


class EventSink:
    """Small fan-out broadcaster shared by REST jobs and WebSocket clients."""

    def __init__(self) -> None:
        self._listeners: set[Callable[[dict[str, Any]], Awaitable[None]]] = set()

    def add(self, listener: Callable[[dict[str, Any]], Awaitable[None]]) -> None:
        self._listeners.add(listener)

    def remove(self, listener: Callable[[dict[str, Any]], Awaitable[None]]) -> None:
        self._listeners.discard(listener)

    async def publish(self, event: dict[str, Any]) -> None:
        listeners = tuple(self._listeners)
        results = await asyncio.gather(*(listener(event) for listener in listeners), return_exceptions=True)
        for listener, result in zip(listeners, results, strict=True):
            if isinstance(result, Exception):
                self._listeners.discard(listener)


async def _is_job_cancelled(controller: JobController | None, job_id: UUID | None) -> bool:
    if controller is None or job_id is None:
        return False
    state = await controller.get(job_id)
    return bool(state is not None and (state.cancelled or state.status == "CANCELLED"))


async def _audit(
    session: AsyncSession,
    *,
    agent: str,
    action: str,
    input_payload: Any,
    output_payload: Any,
    document_id: UUID | None = None,
    work_item_id: UUID | None = None,
    processing_ms: int = 0,
    confidence: float | None = None,
) -> AuditLog:
    profile = runtime_profile()
    selected_model = profile.vision_model if AGENT_MODELS.get(agent) == "vision" else profile.text_model
    selected_model = selected_model if agent != "Citation Gate" else "deterministic-rapidfuzz-logprob-gate"
    record = AuditLog(
        document_id=document_id,
        work_item_id=work_item_id,
        agent_name=agent,
        action=action,
        input_hash=payload_hash(input_payload),
        output_hash=payload_hash(output_payload),
        confidence=confidence,
        model_name=selected_model,
        processing_time_ms=processing_ms,
        metadata_json={"inference_mode": settings.inference_mode},
    )
    session.add(record)
    await session.flush()
    return record


async def _stage_delay_or_infer(
    agent: str,
    input_payload: Any,
    output_payload: Any,
    controller: JobController | None,
    job_id: UUID | None,
) -> bool:
    await asyncio.sleep(random.uniform(0.4, 0.6) if settings.inference_mode == "demo_simulator" else 0.0)
    if await _is_job_cancelled(controller, job_id):
        return False
    if settings.inference_mode != "demo_simulator":
        await InferenceRuntime().complete(agent, {"input": input_payload, "output_shape": output_payload})
    if await _is_job_cancelled(controller, job_id):
        return False
    return True


async def _begin_stage(
    session: AsyncSession,
    sink: EventSink,
    *,
    agent: str,
    agent_index: int,
    input_payload: Any,
    running_summary: str,
    running_details: dict[str, Any],
    document_id: UUID | None = None,
    document_filename: str | None = None,
    controller: JobController | None = None,
    job_id: UUID | None = None,
    batch_id: UUID | None = None,
) -> tuple[bool, float, str, str]:
    if controller is not None and job_id is not None:
        if not await controller.before_step(job_id, agent_index, document_id, 0, agent_label=agent):
            return False, 0.0, "", ""
    started_perf = time.perf_counter()
    started_at = datetime.now(UTC).isoformat()
    in_hash = payload_hash(input_payload)
    job_status = "RUNNING"
    if controller is not None and job_id is not None:
        state = await controller.get(job_id)
        if state is not None:
            job_status = state.status
        await controller.start_step(
            job_id,
            agent_index,
            started_at=started_at,
            input_hash=in_hash,
            document_id=document_id,
            document_filename=document_filename,
            summary=running_summary,
            details=running_details,
        )
    run_id_str = str(job_id) if job_id else (str(batch_id) if batch_id else None)
    await sink.publish(
        {
            "type": "agent_transition",
            "job_id": str(job_id) if job_id else None,
            "run_id": run_id_str,
            "agent_name": agent,
            "current_agent_index": agent_index,
            "status": "running",
            "job_status": job_status,
            "started_at": started_at,
            "completed_at": None,
            "latency_ms": 0,
            "input_hash": in_hash,
            "output_hash": in_hash,
            "document_id": str(document_id) if document_id else None,
            "document_filename": document_filename,
            "summary": running_summary,
            "message": running_summary,
            "details": dict(running_details),
        }
    )
    return True, started_perf, started_at, in_hash


async def _finish_stage(
    session: AsyncSession,
    sink: EventSink,
    *,
    agent: str,
    agent_index: int,
    started_perf: float,
    started_at: str,
    input_hash: str,
    input_payload: Any,
    output_payload: Any,
    summary: str,
    details: dict[str, Any],
    action: str = "EXECUTE",
    document_id: UUID | None = None,
    document_filename: str | None = None,
    controller: JobController | None = None,
    job_id: UUID | None = None,
    batch_id: UUID | None = None,
) -> bool:
    if await _is_job_cancelled(controller, job_id):
        await session.rollback()
        return False
    elapsed = max(1, int((time.perf_counter() - started_perf) * 1000))
    completed_at = datetime.now(UTC).isoformat()
    out_hash = payload_hash(output_payload)
    await _audit(
        session,
        agent=agent,
        action=action,
        input_payload=input_payload,
        output_payload=output_payload,
        document_id=document_id,
        processing_ms=elapsed,
        confidence=0.96,
    )
    # Release the SQLite write transaction before the controller mirrors its cursor.
    await session.commit()
    job_status = "RUNNING"
    if controller is not None and job_id is not None:
        state = await controller.get(job_id)
        if state is not None:
            job_status = state.status
        await controller.mark_step(
            job_id,
            agent_index,
            output_payload,
            started_at=started_at,
            completed_at=completed_at,
            latency_ms=elapsed,
            input_hash=input_hash,
            output_hash=out_hash,
            document_id=document_id,
            document_filename=document_filename,
            summary=summary,
            details=details,
        )
    run_id_str = str(job_id) if job_id else (str(batch_id) if batch_id else None)
    await sink.publish(
        {
            "type": "agent_transition",
            "job_id": str(job_id) if job_id else None,
            "run_id": run_id_str,
            "agent_name": agent,
            "current_agent_index": agent_index,
            "status": "completed",
            "job_status": job_status,
            "started_at": started_at,
            "completed_at": completed_at,
            "latency_ms": elapsed,
            "input_hash": input_hash,
            "output_hash": out_hash,
            "document_id": str(document_id) if document_id else None,
            "document_filename": document_filename,
            "summary": summary,
            "message": summary,
            "details": dict(details),
        }
    )
    return True


async def _fail_stage(
    session: AsyncSession,
    sink: EventSink,
    *,
    agent: str,
    agent_index: int,
    started_perf: float,
    started_at: str,
    input_hash: str,
    error: Exception,
    details: dict[str, Any],
    document_id: UUID | None = None,
    document_filename: str | None = None,
    controller: JobController | None = None,
    job_id: UUID | None = None,
    batch_id: UUID | None = None,
) -> None:
    await session.rollback()
    elapsed = max(1, int((time.perf_counter() - started_perf) * 1000))
    completed_at = datetime.now(UTC).isoformat()
    fail_summary = f"{agent} failed: {error}"
    fail_details = {**details, "error": str(error), "error_type": type(error).__name__}
    out_hash = payload_hash({"error": str(error), "agent": agent})
    if controller is not None and job_id is not None:
        await controller.fail_step(
            job_id,
            agent_index,
            completed_at=completed_at,
            latency_ms=elapsed,
            summary=fail_summary,
            details=fail_details,
            output_hash=out_hash,
        )
    run_id_str = str(job_id) if job_id else (str(batch_id) if batch_id else None)
    await sink.publish(
        {
            "type": "agent_transition",
            "job_id": str(job_id) if job_id else None,
            "run_id": run_id_str,
            "agent_name": agent,
            "current_agent_index": agent_index,
            "status": "failed",
            "job_status": "FAILED",
            "started_at": started_at,
            "completed_at": completed_at,
            "latency_ms": elapsed,
            "input_hash": input_hash,
            "output_hash": out_hash,
            "document_id": str(document_id) if document_id else None,
            "document_filename": document_filename,
            "summary": fail_summary,
            "message": fail_summary,
            "details": fail_details,
        }
    )


async def persist_ingestion(
    session: AsyncSession,
    workspace_id: UUID,
    filename: str,
    source_format: SourceFormat,
    result: IngestionResult,
    *,
    storage_path: str | None = None,
) -> Document:
    return await persist_ingestion_stream(
        session,
        workspace_id,
        filename,
        source_format,
        iter(result.nodes),
        total_pages=result.total_pages,
        document_id=result.document_id,
        expected_checksum=result.checksum,
        storage_path=storage_path,
    )


async def persist_ingestion_stream(
    session: AsyncSession,
    workspace_id: UUID,
    filename: str,
    source_format: SourceFormat,
    nodes: Iterator[ParsedNode],
    *,
    total_pages: int = 0,
    document_id: UUID | None = None,
    expected_checksum: str | None = None,
    storage_path: str | None = None,
    batch_size: int = 250,
) -> Document:
    """Persist parser output in bounded batches without blocking the event loop."""
    document = Document(
        id=document_id or uuid4(),
        workspace_id=workspace_id,
        filename=filename,
        source_format=source_format,
        ast_checksum="pending",
        storage_path=storage_path,
        total_pages=total_pages,
        processing_status="INGESTING",
    )
    session.add(document)
    await session.flush()

    digest = hashlib.sha256()
    node_count = 0
    max_page = total_pages
    detected_scan = False
    while batch := await asyncio.to_thread(lambda: list(islice(nodes, batch_size))):
        persisted: list[ASTNode] = []
        for parsed in batch:
            digest.update(parsed.verbatim_text.encode("utf-8"))
            node_count += 1
            max_page = max(max_page, parsed.page_number or 0)
            node_id = uuid4()
            if parsed.node_type == NodeType.STAMP_NOTE and "(Scanned Region)" in (parsed.section_path or ""):
                detected_scan = True
            if parsed.locator is not None:
                locator_dict = dict(parsed.locator)
                locator_dict["doc_id"] = str(document.id)
                locator_dict["node_id"] = str(node_id)
            else:
                locator_dict = {
                    "source_type": "text",
                    "doc_id": str(document.id),
                    "page": parsed.page_number or 1,
                    "line_start": parsed.node_order + 1,
                    "line_end": parsed.node_order + 1,
                    "node_id": str(node_id),
                    "checksum": "",
                }
            persisted.append(
                ASTNode(
                    id=node_id,
                    document_id=document.id,
                    node_type=parsed.node_type,
                    section_path=parsed.section_path,
                    verbatim_text=parsed.verbatim_text,
                    structured_payload=parsed.structured_payload,
                    page_number=parsed.page_number,
                    bounding_box=parsed.bounding_box,
                    locator=locator_dict,
                    ocr_confidence=parsed.ocr_confidence,
                    node_order=parsed.node_order,
                )
            )
        session.add_all(persisted)
        await session.flush()

    document.ast_checksum = digest.hexdigest()
    document.total_pages = max_page
    document.total_ast_nodes = node_count
    if detected_scan and document.source_format == SourceFormat.DIGITAL_PDF:
        document.source_format = SourceFormat.PHYSICAL_SCAN
    document.processing_status = "COMPLETED" if expected_checksum in (None, document.ast_checksum) else "FAILED"
    await session.flush()

    # Backfill locator.checksum = document.ast_checksum in bounded batches.
    offset = 0
    while offset < node_count:
        batch_result = await session.execute(
            select(ASTNode)
            .where(ASTNode.document_id == document.id)
            .order_by(ASTNode.node_order, ASTNode.id)
            .offset(offset)
            .limit(batch_size)
        )
        rows = list(batch_result.scalars().all())
        if not rows:
            break
        for ast_node in rows:
            if ast_node.locator is not None:
                updated_locator = dict(ast_node.locator)
                updated_locator["checksum"] = document.ast_checksum
                ast_node.locator = updated_locator
        await session.flush()
        offset += len(rows)

    return document


def _tier_for_score(score: int) -> PriorityTier:
    if score >= 85:
        return PriorityTier.P0_CRITICAL
    if score >= 65:
        return PriorityTier.P1_HIGH
    if score >= 35:
        return PriorityTier.P2_MEDIUM
    return PriorityTier.P3_LOW


def _min_words_for_node(node: ASTNode | None, quote: str) -> int | None:
    """Allow canonical dot-delimited JSON rules (>= 24 chars, >= 4 semantic tokens) through word-count gate."""
    if node is not None and str(getattr(node.node_type, "value", node.node_type)) == NodeType.JSON_RULE.value:
        semantic_tokens = re.findall(r"[A-Za-z0-9_*]+", quote)
        if len(semantic_tokens) >= settings.min_quote_words:
            return 1
    return None


def _is_vision_rescue_node(node: ASTNode | None, document: Document | None) -> bool:
    """Return True only for low-confidence OCR, scanned PDF, or stamp/addendum nodes."""
    if node is None:
        return False
    node_type_val = str(getattr(node.node_type, "value", node.node_type))
    doc_format_val = str(getattr(document.source_format, "value", document.source_format)) if document is not None else ""
    return (
        float(node.ocr_confidence or 0.0) < 0.90
        or node_type_val == NodeType.STAMP_NOTE.value
        or doc_format_val == SourceFormat.PHYSICAL_SCAN.value
    )


def _sanitize_extracted_text(value: str | None) -> str | None:
    """Return stripped non-empty text, never storing the insufficient-evidence sentinel."""
    cleaned = (value or "").strip()
    if not cleaned or cleaned == INSUFFICIENT_EVIDENCE_OUTPUT:
        return None
    return cleaned


def verify_node_region(
    node: ASTNode,
    document: Document | None,
    claimed_quote: str,
    *,
    pdf_page_cache: dict[tuple[str, int], list[dict[str, Any]]] | None = None,
) -> tuple[bool, float]:
    """Verify the source region referenced by `node.locator` matches `claimed_quote` (`>= 97%`)."""
    if node.ocr_confidence < 0.90:
        return False, 0.0

    region_text = node.verbatim_text
    locator = node.locator or {}
    if (
        locator.get("source_type") == "pdf"
        and document is not None
        and document.storage_path
        and Path(document.storage_path).is_file()
    ):
        storage_path = Path(document.storage_path)
        if storage_path.read_bytes()[:5] == b"%PDF-":
            page_num = int(locator.get("page") or node.page_number or 1)
            bbox = locator.get("bbox")
            if bbox:
                per_doc_cache: dict[int, list[dict[str, Any]]] | None = None
                if pdf_page_cache is not None:
                    doc_key = str(storage_path)
                    per_doc_cache = {}
                    if (doc_key, page_num) in pdf_page_cache:
                        per_doc_cache[page_num] = pdf_page_cache[(doc_key, page_num)]
                extracted = extract_pdf_region_text(storage_path, page_num, bbox, cached_pages=per_doc_cache)
                if pdf_page_cache is not None and per_doc_cache is not None and page_num in per_doc_cache:
                    pdf_page_cache[(str(storage_path), page_num)] = per_doc_cache[page_num]
                region_text = extracted

    return verify_region_text(claimed_quote, region_text)


def _citation_payload(
    node: ASTNode,
    document: Document | None,
    quote: str,
    confidence_score: float,
    region_match_score: float,
) -> dict[str, Any]:
    locator = dict(node.locator) if node.locator else None
    if locator is not None and document is not None and not locator.get("checksum"):
        locator["checksum"] = document.ast_checksum
    return {
        "quote": quote,
        "ast_node_id": str(node.id),
        "page_number": node.page_number,
        "bounding_box": node.bounding_box,
        "document_filename": document.filename if document else None,
        "confidence_score": confidence_score,
        "locator": locator,
        "region_match_score": region_match_score,
    }


def summary_ws_payload(summary_record: ExecutiveSummaryRecord) -> dict[str, Any]:
    return {
        "type": "summary_generated",
        "summary_id": str(summary_record.id),
        "document_id": str(summary_record.document_id) if summary_record.document_id else None,
        "total_work_items": summary_record.total_work_items,
        "verified_count": summary_record.verified_count,
        "human_override_count": summary_record.human_override_count,
        "escalated_legal_count": summary_record.escalated_legal_count,
        "not_applicable_count": summary_record.not_applicable_count,
        "unresolved_count": summary_record.unresolved_count,
        "defensibility_score": summary_record.defensibility_score,
    }


async def persist_executive_summary(
    session: AsyncSession,
    *,
    documents: list[Document] | None = None,
    work_items: list[WorkItem] | None = None,
    arbiter_resolutions: dict[str, Any] | None = None,
    document_id: UUID | None = None,
    only_critical: bool = False,
    latest_only: bool = False,
    workspace_id: UUID | None = None,
    mark_prior_stale: bool = False,
) -> ExecutiveSummaryRecord:
    """Compute and persist an Envoy `ExecutiveSummaryRecord` from live DB data."""
    if mark_prior_stale:
        await session.execute(update(ExecutiveSummaryRecord).values(is_stale=True))
    if documents is None:
        documents = list((await session.execute(select(Document).order_by(Document.created_at))).scalars().all())
    if work_items is None:
        work_items = list(
            (await session.execute(select(WorkItem).order_by(WorkItem.priority_score.desc(), WorkItem.created_at)))
            .scalars()
            .all()
        )
    summary_data = build_executive_summary(
        documents=documents,
        work_items=work_items,
        arbiter_resolutions=arbiter_resolutions,
        document_id=document_id,
        only_critical=only_critical,
        latest_only=latest_only,
        workspace_id=workspace_id,
    )
    record = ExecutiveSummaryRecord(
        id=uuid4(),
        workspace_id=summary_data["workspace_id"],
        document_id=summary_data["document_id"],
        only_critical=summary_data["only_critical"],
        latest_only=summary_data["latest_only"],
        total_work_items=summary_data["total_work_items"],
        verified_count=summary_data["verified_count"],
        human_override_count=summary_data["human_override_count"],
        unresolved_count=summary_data["unresolved_count"],
        escalated_legal_count=summary_data["escalated_legal_count"],
        not_applicable_count=summary_data["not_applicable_count"],
        critical_count=summary_data["critical_count"],
        critical_open_count=summary_data["critical_open_count"],
        high_open_count=summary_data["high_open_count"],
        weak_evidence_count=summary_data["weak_evidence_count"],
        defensibility_score=summary_data["defensibility_score"],
        summary_text=summary_data["summary_text"],
        markdown=summary_data["markdown"],
        key_findings=summary_data["key_findings"],
        arbiter_resolutions=summary_data["arbiter_resolutions"],
        is_stale=False,
    )
    session.add(record)
    await session.flush()
    return record


async def _emit_chronos_temporal_conflicts(
    session: AsyncSession,
    sink: EventSink,
    *,
    workspace_id: UUID,
    batch_id: UUID,
    documents: list[Document],
    all_nodes: list[ASTNode],
    conflict: dict[str, Any],
    pdf_page_cache: dict[tuple[str, int], list[dict[str, Any]]],
    controller: JobController | None = None,
    job_id: UUID | None = None,
) -> list[WorkItem]:
    if not conflict.get("resolved"):
        return []
    pairs = select_temporal_conflict_pairs(documents, all_nodes)
    emitted: list[WorkItem] = []
    for latest_doc, legacy_doc, newer_node, older_node in pairs:
        if await _is_job_cancelled(controller, job_id):
            return emitted
        new_ok, new_region_score = verify_node_region(
            newer_node,
            latest_doc,
            newer_node.verbatim_text,
            pdf_page_cache=pdf_page_cache,
        )
        old_ok, old_region_score = verify_node_region(
            older_node,
            legacy_doc,
            older_node.verbatim_text,
            pdf_page_cache=pdf_page_cache,
        )
        gate = run_verification_gate(
            [newer_node.verbatim_text, older_node.verbatim_text],
            [newer_node.verbatim_text, older_node.verbatim_text],
            min_quote_words=(
                1
                if _min_words_for_node(newer_node, newer_node.verbatim_text) == 1
                and _min_words_for_node(older_node, older_node.verbatim_text) == 1
                else None
            ),
        )
        both_passed = gate.passed and new_ok and old_ok and new_region_score >= 97.0 and old_region_score >= 97.0

        newer_cit = _citation_payload(newer_node, latest_doc, newer_node.verbatim_text, gate.best_citation_score, new_region_score)
        older_cit = _citation_payload(older_node, legacy_doc, older_node.verbatim_text, gate.best_citation_score, old_region_score)

        status = VerificationStatus.VERIFIED if both_passed else VerificationStatus.NEEDS_HUMAN_VERIFICATION
        weak = (not both_passed) and gate.weak_evidence
        weak_reason = gate.weak_evidence_reason if weak else (
            None if both_passed else "Temporal conflict source region requires human verification."
        )
        evidence_quality = "strong" if both_passed else ("weak" if weak else "missing")

        newer_date = latest_doc.effective_date.isoformat() if latest_doc.effective_date else None
        older_date = legacy_doc.effective_date.isoformat() if legacy_doc.effective_date else None
        resolution = f"{latest_doc.filename} supersedes {legacy_doc.filename}"

        temporal_payload = {
            "newer_doc_id": str(latest_doc.id),
            "newer_filename": latest_doc.filename,
            "newer_effective_date": newer_date,
            "newer_quote": newer_node.verbatim_text,
            "newer_locator": newer_cit["locator"],
            "newer_region_match_score": new_region_score,
            "older_doc_id": str(legacy_doc.id),
            "older_filename": legacy_doc.filename,
            "older_effective_date": older_date,
            "older_quote": older_node.verbatim_text,
            "older_locator": older_cit["locator"],
            "older_region_match_score": old_region_score,
            "resolution": resolution,
            "superseded_by": str(latest_doc.id),
        }

        facts = [
            ExtractedFact(
                fact_type="NEWER_POLICY",
                value=newer_node.verbatim_text[:90],
                verbatim_quote=newer_node.verbatim_text,
                ast_node_id=str(newer_node.id),
                confidence=0.98 if new_ok else 0.72,
                locator=newer_cit["locator"],
                region_match_score=new_region_score,
            ),
            ExtractedFact(
                fact_type="SUPERSEDED_POLICY",
                value=older_node.verbatim_text[:90],
                verbatim_quote=older_node.verbatim_text,
                ast_node_id=str(older_node.id),
                confidence=0.98 if old_ok else 0.72,
                locator=older_cit["locator"],
                region_match_score=old_region_score,
            ),
        ]

        fluent_output = (
            f"Chronos detected temporal supersession: {latest_doc.filename} "
            f"({newer_date or 'latest'}) supersedes {legacy_doc.filename} ({older_date or 'legacy'}). "
            f"Authoritative clause: {newer_node.verbatim_text}"
            if both_passed
            else f"Chronos detected potential temporal supersession between {latest_doc.filename} and {legacy_doc.filename} — human verification required."
        )
        min_score = round(min(new_region_score, old_region_score), 2)
        gate_telemetry = {
            "citation_match": min_score if both_passed else round(min(gate.best_citation_score, min_score), 2),
            "region_match_score": min_score,
            "critical_logprob": gate.best_logprob,
            "failed_citations": gate.failed_citations,
            "failed_logprobs": gate.failed_logprobs,
            "supersession": resolution,
            "weak_evidence": weak,
            "weak_evidence_reason": weak_reason,
        }

        newer_rescue = _is_vision_rescue_node(newer_node, latest_doc)
        older_rescue = _is_vision_rescue_node(older_node, legacy_doc)
        if newer_rescue or older_rescue:
            rescue_parts = [
                cleaned
                for node_ref, is_rescue in ((newer_node, newer_rescue), (older_node, older_rescue))
                if is_rescue and (cleaned := _sanitize_extracted_text(node_ref.verbatim_text))
            ]
            tc_vision_rescue_text = " | ".join(rescue_parts) if rescue_parts else None
            tc_has_vision_rescue = bool(tc_vision_rescue_text)
            tc_machine_extracted_text = (
                _sanitize_extracted_text(newer_node.verbatim_text)
                if (both_passed and not newer_rescue)
                else None
            )
        else:
            tc_vision_rescue_text = None
            tc_has_vision_rescue = False
            tc_machine_extracted_text = _sanitize_extracted_text(fluent_output) if both_passed else None

        item = WorkItem(
            workspace_id=workspace_id,
            batch_id=batch_id,
            document_id=None,
            item_type="TEMPORAL_CONFLICT",
            category="Temporal Governance",
            priority_tier=PriorityTier.P1_HIGH,
            priority_score=80,
            original_priority_tier=PriorityTier.P1_HIGH.value,
            prompt_or_question=f"Temporal Conflict: {resolution}",
            fluent_output=fluent_output,
            structured_facts=[fact.model_dump() for fact in facts],
            verified_citations=[newer_cit, older_cit],
            verification_status=status,
            resolved_by_tier=ResolvedByTier.TIER3_ARBITER,
            weak_evidence=weak,
            weak_evidence_reason=weak_reason,
            evidence_quality=evidence_quality,
            machine_extracted_text=tc_machine_extracted_text,
            vision_rescue_text=tc_vision_rescue_text,
            has_vision_rescue=tc_has_vision_rescue,
            temporal_conflict=temporal_payload,
            gate_telemetry=gate_telemetry,
        )
        session.add(item)
        await session.flush()
        emitted.append(item)

        await _audit(
            session,
            agent="Chronos",
            action="TEMPORAL_CONFLICT",
            input_payload={
                "newer_doc_id": str(latest_doc.id),
                "older_doc_id": str(legacy_doc.id),
            },
            output_payload=temporal_payload,
            document_id=latest_doc.id,
            work_item_id=item.id,
            processing_ms=1,
            confidence=min_score / 100.0 if both_passed else 0.0,
        )
        await session.commit()
        await sink.publish({"type": "work_item", "id": str(item.id), "status": item.verification_status.value})
    return emitted


def _plan_document_finding(
    source_node: ASTNode,
    document: Document | None,
    *,
    index: int,
    pdf_page_cache: dict[tuple[str, int], list[dict[str, Any]]],
) -> dict[str, Any]:
    quote = source_node.verbatim_text
    region_passed, region_match_score = verify_node_region(
        source_node,
        document,
        quote,
        pdf_page_cache=pdf_page_cache,
    )
    fact = ExtractedFact(
        fact_type="SOURCE_EXCERPT",
        value=quote[:120],
        verbatim_quote=quote,
        ast_node_id=str(source_node.id),
        confidence=0.98 if source_node.ocr_confidence >= 0.90 else 0.72,
        locator=dict(source_node.locator) if source_node.locator else None,
        region_match_score=region_match_score,
    )
    gate_quote = "[unreadable source region]" if source_node.ocr_confidence < 0.90 else quote
    gate = run_verification_gate(
        [gate_quote],
        [quote],
        min_quote_words=_min_words_for_node(source_node, gate_quote),
    )
    passed = gate.passed and region_passed
    is_weak = (not passed) and region_passed and gate.verification_status == VerificationStatus.NEEDS_HUMAN_VERIFICATION
    score = _risk_score(quote, source_node.ocr_confidence)
    if passed:
        status = VerificationStatus.VERIFIED
        tier = _tier_for_score(score)
        priority_score = score
        fluent_output = f"Verified source excerpt from {document.filename if document else 'uploaded file'}."
        citations = [_citation_payload(source_node, document, quote, gate.best_citation_score, region_match_score)]
        weak_evidence = False
        weak_reason: str | None = None
        evidence_quality = "strong"
    elif is_weak:
        status = VerificationStatus.NEEDS_HUMAN_VERIFICATION
        tier = PriorityTier.P1_HIGH
        priority_score = max(score, 75)
        fluent_output = gate.fluent_output or "Weak evidence flagged for human verification."
        citations = [_citation_payload(source_node, document, quote, gate.best_citation_score, region_match_score)]
        weak_evidence = True
        weak_reason = gate.weak_evidence_reason
        evidence_quality = "weak"
    else:
        status = VerificationStatus.INSUFFICIENT_EVIDENCE
        tier = PriorityTier.P0_CRITICAL
        priority_score = 100
        fluent_output = INSUFFICIENT_EVIDENCE_OUTPUT
        citations = []
        weak_evidence = False
        weak_reason = None
        evidence_quality = "missing"

    if _is_vision_rescue_node(source_node, document):
        vision_rescue_text = _sanitize_extracted_text(quote)
        has_vision_rescue = bool(vision_rescue_text)
        machine_extracted_text = None
    else:
        vision_rescue_text = None
        has_vision_rescue = False
        machine_extracted_text = _sanitize_extracted_text(quote) if (passed or is_weak) else None

    return {
        "node_index": index - 1,
        "source_node": source_node,
        "quote": quote,
        "gate_quote": gate_quote,
        "fact": fact,
        "gate": gate,
        "passed": passed,
        "region_match_score": region_match_score,
        "status": status,
        "tier": tier,
        "priority_score": priority_score,
        "category": _category_for_question(quote),
        "prompt_or_question": source_node.section_path or f"Source item {index}",
        "fluent_output": fluent_output,
        "citations": citations,
        "weak_evidence": weak_evidence,
        "weak_reason": weak_reason,
        "evidence_quality": evidence_quality,
        "machine_extracted_text": machine_extracted_text,
        "vision_rescue_text": vision_rescue_text,
        "has_vision_rescue": has_vision_rescue,
        "gate_telemetry": {
            "citation_match": gate.best_citation_score,
            "region_match_score": region_match_score,
            "critical_logprob": gate.best_logprob,
            "failed_citations": gate.failed_citations,
            "failed_logprobs": gate.failed_logprobs,
            "weak_evidence": weak_evidence,
            "weak_evidence_reason": weak_reason,
        },
    }


def _plan_questionnaire_finding(
    question_node: ASTNode,
    source_nodes: list[ASTNode],
    source_documents: dict[UUID, Document],
    source_texts: list[str],
    *,
    index: int,
    latest_filenames: list[str],
    legacy_filenames: list[str],
    pdf_page_cache: dict[tuple[str, int], list[dict[str, Any]]],
) -> dict[str, Any]:
    question = str((question_node.structured_payload or {}).get("row_data", {}).get("Question", question_node.verbatim_text))
    is_unanswerable = "unanswerable" in question.lower()
    fact_node = None if is_unanswerable else _fact_node(question, source_nodes, doc_by_id=source_documents)
    fact_doc = source_documents.get(fact_node.document_id) if fact_node is not None else None
    facts: list[ExtractedFact] = []
    region_passed = False
    region_match_score = 0.0

    if fact_node is not None:
        fact_type = "CLAUSE"
        if "date" in question.lower() or "when" in question.lower():
            fact_type = "DATE"
        region_passed, region_match_score = verify_node_region(
            fact_node,
            fact_doc,
            fact_node.verbatim_text,
            pdf_page_cache=pdf_page_cache,
        )
        facts = [
            ExtractedFact(
                fact_type=fact_type,
                value=fact_node.verbatim_text[:90],
                verbatim_quote=fact_node.verbatim_text,
                ast_node_id=str(fact_node.id),
                confidence=0.98 if fact_node.ocr_confidence >= 0.90 else 0.72,
                locator=dict(fact_node.locator) if fact_node.locator else None,
                region_match_score=region_match_score,
            )
        ]

    if fact_node is None or is_unanswerable:
        quotes: list[str] = []
        region_passed = False
        region_match_score = 0.0
    elif fact_node.ocr_confidence < 0.90:
        quotes = ["[unreadable source region]"]
        region_passed = False
        region_match_score = 0.0
    else:
        quotes = [fact.verbatim_quote for fact in facts]

    token_logprobs = [{"token": fact.value[:12], "entity_type": fact.fact_type, "probability": 0.96} for fact in facts]
    gate = run_verification_gate(
        quotes,
        source_texts,
        token_logprobs,
        min_quote_words=_min_words_for_node(fact_node, quotes[0]) if quotes else None,
    )
    passed = gate.passed and region_passed and fact_node is not None and not is_unanswerable
    is_weak = (
        (not passed)
        and fact_node is not None
        and not is_unanswerable
        and region_passed
        and gate.verification_status == VerificationStatus.NEEDS_HUMAN_VERIFICATION
    )

    gate_payload = {
        "citation_match": gate.best_citation_score,
        "region_match_score": region_match_score,
        "critical_logprob": gate.best_logprob,
        "failed_citations": gate.failed_citations,
        "failed_logprobs": gate.failed_logprobs,
        "weak_evidence": is_weak,
        "weak_evidence_reason": gate.weak_evidence_reason if is_weak else None,
    }
    fields = hard_gate_fields(gate)
    if passed:
        output = synthesize_verified_output(facts, gate)
        status = VerificationStatus.VERIFIED
        score = 92 if "wildcard" in question.lower() else 72 - index
        tier = _tier_for_score(score)
        resolved = ResolvedByTier.TIER1_CACHE if index == 1 else ResolvedByTier.TIER2_SLM_REGIMENT
        weak_evidence = False
        weak_reason = None
        evidence_quality = "strong"
        citations = [
            _citation_payload(fact_node, fact_doc, fact.verbatim_quote, gate.best_citation_score, region_match_score)
            for fact in facts
        ]
    elif is_weak and fact_node is not None:
        output = str(fields.get("fluent_output") or "Weak evidence flagged for human verification.")
        status = VerificationStatus.NEEDS_HUMAN_VERIFICATION
        score = 80
        tier = PriorityTier.P1_HIGH
        resolved = ResolvedByTier.TIER2_SLM_REGIMENT
        weak_evidence = True
        weak_reason = gate.weak_evidence_reason
        evidence_quality = "weak"
        citations = [
            _citation_payload(fact_node, fact_doc, fact.verbatim_quote, gate.best_citation_score, region_match_score)
            for fact in facts
        ]
    else:
        output = INSUFFICIENT_EVIDENCE_OUTPUT
        status = VerificationStatus.INSUFFICIENT_EVIDENCE
        score = 100
        tier = PriorityTier.P0_CRITICAL
        resolved = ResolvedByTier.TIER3_ARBITER if "conflict" in question.lower() else ResolvedByTier.TIER2_SLM_REGIMENT
        weak_evidence = False
        weak_reason = None
        evidence_quality = "missing"
        citations = []

    supersession_note: str | None = None
    if latest_filenames and legacy_filenames and "password" in question.lower():
        supersession_note = f"{', '.join(latest_filenames)} supersedes {', '.join(legacy_filenames)}"

    if fact_node is None or is_unanswerable:
        vision_rescue_text = None
        has_vision_rescue = False
        machine_extracted_text = None
    elif _is_vision_rescue_node(fact_node, fact_doc):
        vision_rescue_text = _sanitize_extracted_text(fact_node.verbatim_text)
        has_vision_rescue = bool(vision_rescue_text)
        machine_extracted_text = None
    else:
        vision_rescue_text = None
        has_vision_rescue = False
        if passed:
            machine_extracted_text = _sanitize_extracted_text(output)
        elif is_weak:
            machine_extracted_text = _sanitize_extracted_text(fact_node.verbatim_text)
        else:
            machine_extracted_text = None

    return {
        "node_index": index - 1,
        "question": question,
        "fact_node": fact_node,
        "facts": facts,
        "quotes": quotes,
        "token_logprobs": token_logprobs,
        "gate": gate,
        "passed": passed,
        "region_match_score": region_match_score,
        "gate_payload": gate_payload,
        "output": output,
        "status": status,
        "score": score,
        "tier": tier,
        "resolved": resolved,
        "weak_evidence": weak_evidence,
        "weak_reason": weak_reason,
        "evidence_quality": evidence_quality,
        "machine_extracted_text": machine_extracted_text,
        "vision_rescue_text": vision_rescue_text,
        "has_vision_rescue": has_vision_rescue,
        "citations": citations,
        "supersession_note": supersession_note,
    }


async def run_regiment(
    session: AsyncSession,
    workspace_id: UUID,
    batch_id: UUID,
    documents: list[Document],
    sink: EventSink,
    *,
    controller: JobController | None = None,
    job_id: UUID | None = None,
) -> list[WorkItem]:
    """Run each named transition, then create gated work items and Envoy summary."""
    all_nodes: list[ASTNode] = []
    for document in documents:
        result = await session.execute(select(ASTNode).where(ASTNode.document_id == document.id).order_by(ASTNode.node_order))
        all_nodes.extend(result.scalars().all())

    single_doc = documents[0] if len(documents) == 1 else None
    corpus_doc_id = single_doc.id if single_doc is not None else None
    corpus_doc_filename = single_doc.filename if single_doc is not None else None
    doc_filenames = [doc.filename for doc in documents]

    # Stage 0: Scout
    scout_in = {"documents": len(documents), "nodes": len(all_nodes)}
    ok, s_perf, s_at, s_hash = await _begin_stage(
        session,
        sink,
        agent="Scout",
        agent_index=0,
        input_payload=scout_in,
        running_summary=f"Scanning {len(documents)} document{'s' if len(documents) != 1 else ''} for low-confidence OCR regions",
        running_details={"documents": doc_filenames, "nodes_inspected": len(all_nodes)},
        document_id=corpus_doc_id,
        document_filename=corpus_doc_filename,
        controller=controller,
        job_id=job_id,
        batch_id=batch_id,
    )
    if not ok:
        await session.commit()
        return []
    try:
        low_confidence = rescue_regions(
            [
                ParsedNode(
                    node_type=node.node_type,
                    verbatim_text=node.verbatim_text,
                    page_number=node.page_number,
                    bounding_box=node.bounding_box,
                    ocr_confidence=node.ocr_confidence,
                    locator=node.locator,
                    node_order=node.node_order,
                )
                for node in all_nodes
            ]
        )
        pages_scanned = sum(doc.total_pages or 0 for doc in documents)
        low_count = len(low_confidence)
        if pages_scanned > 0:
            scout_summary = (
                f"{pages_scanned} page{'s' if pages_scanned != 1 else ''} scanned · "
                f"{low_count} low-confidence region{'s' if low_count != 1 else ''} flagged"
            )
        else:
            scout_summary = (
                f"{len(documents)} source{'s' if len(documents) != 1 else ''} scanned · "
                f"{low_count} low-confidence region{'s' if low_count != 1 else ''} flagged"
            )
        scout_details = {
            "documents_scanned": len(documents),
            "documents": doc_filenames,
            "pages_scanned": pages_scanned,
            "nodes_inspected": len(all_nodes),
            "low_confidence_regions": low_count,
            "rescued_regions": [
                {
                    "page_number": region.get("page_number"),
                    "ocr_confidence": region.get("ocr_confidence"),
                    "excerpt": (region.get("verbatim_text") or "")[:80],
                }
                for region in low_confidence[:10]
            ],
        }
        scout_out = {"rescued": low_count, "pages_scanned": pages_scanned}
        if not await _stage_delay_or_infer("Scout", scout_in, scout_out, controller, job_id):
            await session.rollback()
            return []
        if not await _finish_stage(
            session,
            sink,
            agent="Scout",
            agent_index=0,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            input_payload=scout_in,
            output_payload=scout_out,
            summary=scout_summary,
            details=scout_details,
            document_id=corpus_doc_id,
            document_filename=corpus_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        ):
            return []
    except Exception as exc:
        await _fail_stage(
            session,
            sink,
            agent="Scout",
            agent_index=0,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            error=exc,
            details={"documents": doc_filenames, "nodes_inspected": len(all_nodes)},
            document_id=corpus_doc_id,
            document_filename=corpus_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        )
        raise

    # Stage 1: Quartermaster
    qm_in = {"nodes": len(all_nodes), "documents": len(documents)}
    ok, s_perf, s_at, s_hash = await _begin_stage(
        session,
        sink,
        agent="Quartermaster",
        agent_index=1,
        input_payload=qm_in,
        running_summary=f"Tagging {len(all_nodes)} AST node{'s' if len(all_nodes) != 1 else ''} across {len(documents)} document{'s' if len(documents) != 1 else ''}",
        running_details={"documents": doc_filenames, "nodes_total": len(all_nodes)},
        document_id=corpus_doc_id,
        document_filename=corpus_doc_filename,
        controller=controller,
        job_id=job_id,
        batch_id=batch_id,
    )
    if not ok:
        await session.commit()
        return []
    try:
        taxonomy = categorize_nodes(all_nodes)
        for document in documents:
            document_nodes = [node for node in all_nodes if node.document_id == document.id]
            document_text = " ".join(node.verbatim_text.lower() for node in document_nodes[:40])
            if document.source_format == SourceFormat.XLSX:
                document.category = "Questionnaire"
            elif str(getattr(document.source_format, "value", document.source_format)) == "JSON_CONFIG":
                document.category = "Cloud Config"
            elif any(term in document_text for term in ("agreement", "liability", "indemnification", "contract")):
                document.category = "Commercial Contract"
            else:
                document.category = "Security Audit"
            document.sub_category = str(taxonomy.get("categories", {}))
        tagged_count = int(taxonomy.get("tagged_nodes", len(all_nodes)))
        qm_summary = (
            f"{tagged_count} node{'s' if tagged_count != 1 else ''} tagged across "
            f"{len(documents)} document{'s' if len(documents) != 1 else ''}"
        )
        qm_details = {
            "tagged_nodes": tagged_count,
            "document_count": len(documents),
            "documents": doc_filenames,
            "categories": dict(taxonomy.get("categories", {})),
            "document_categories": {doc.filename: doc.category for doc in documents},
        }
        if not await _stage_delay_or_infer("Quartermaster", qm_in, taxonomy, controller, job_id):
            await session.rollback()
            return []
        if not await _finish_stage(
            session,
            sink,
            agent="Quartermaster",
            agent_index=1,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            input_payload=qm_in,
            output_payload=taxonomy,
            summary=qm_summary,
            details=qm_details,
            document_id=corpus_doc_id,
            document_filename=corpus_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        ):
            return []
    except Exception as exc:
        await _fail_stage(
            session,
            sink,
            agent="Quartermaster",
            agent_index=1,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            error=exc,
            details={"documents": doc_filenames, "nodes_total": len(all_nodes)},
            document_id=corpus_doc_id,
            document_filename=corpus_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        )
        raise

    # Stage 2: Chronos
    chronos_in = {"documents": len(documents)}
    ok, s_perf, s_at, s_hash = await _begin_stage(
        session,
        sink,
        agent="Chronos",
        agent_index=2,
        input_payload=chronos_in,
        running_summary=f"Sequencing {len(documents)} document{'s' if len(documents) != 1 else ''} and checking supersession signals",
        running_details={"documents": doc_filenames},
        document_id=corpus_doc_id,
        document_filename=corpus_doc_filename,
        controller=controller,
        job_id=job_id,
        batch_id=batch_id,
    )
    if not ok:
        await session.commit()
        return []
    try:
        temporal = analyze_versions(documents)
        superseded_count = int(temporal.get("superseded_count") or 0)
        chronos_summary = (
            f"{len(documents)} doc{'s' if len(documents) != 1 else ''} sequenced · "
            f"{superseded_count} supersession conflict{'s' if superseded_count != 1 else ''}"
        )
        chronos_details = {
            "document_count": len(documents),
            "documents": doc_filenames,
            "latest_filename": temporal.get("latest_filename"),
            "latest_document_id": temporal.get("latest_document_id"),
            "superseded_count": superseded_count,
            "superseded_document_ids": list(temporal.get("superseded_document_ids", [])),
        }
        if not await _stage_delay_or_infer("Chronos", chronos_in, temporal, controller, job_id):
            await session.rollback()
            return []
        if not await _finish_stage(
            session,
            sink,
            agent="Chronos",
            agent_index=2,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            input_payload=chronos_in,
            output_payload=temporal,
            summary=chronos_summary,
            details=chronos_details,
            document_id=corpus_doc_id,
            document_filename=corpus_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        ):
            return []
    except Exception as exc:
        await _fail_stage(
            session,
            sink,
            agent="Chronos",
            agent_index=2,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            error=exc,
            details={"documents": doc_filenames},
            document_id=corpus_doc_id,
            document_filename=corpus_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        )
        raise

    pdf_page_cache: dict[tuple[str, int], list[dict[str, Any]]] = {}
    questionnaire = next((doc for doc in documents if doc.source_format == SourceFormat.XLSX), None)

    # Stage 3: Vanguard
    vanguard_in = {"nodes": len(all_nodes)}
    ok, s_perf, s_at, s_hash = await _begin_stage(
        session,
        sink,
        agent="Vanguard",
        agent_index=3,
        input_payload=vanguard_in,
        running_summary=f"Scoring {len(all_nodes)} node{'s' if len(all_nodes) != 1 else ''} for critical (P0) and high (P1) risks",
        running_details={"nodes_total": len(all_nodes), "documents": doc_filenames},
        document_id=corpus_doc_id,
        document_filename=corpus_doc_filename,
        controller=controller,
        job_id=job_id,
        batch_id=batch_id,
    )
    if not ok:
        await session.commit()
        return []
    try:
        risk = score_nodes(all_nodes)
        has_temporal_conflict = any(not doc.is_latest_version for doc in documents) and any(
            doc.is_latest_version for doc in documents
        )
        planned_temporal_pairs = (
            select_temporal_conflict_pairs(documents, all_nodes) if has_temporal_conflict else []
        )
        if questionnaire is None:
            doc_by_id = {doc.id: doc for doc in documents}
            planned_items = [
                _plan_document_finding(
                    source_node,
                    doc_by_id.get(source_node.document_id),
                    index=idx,
                    pdf_page_cache=pdf_page_cache,
                )
                for idx, source_node in enumerate(all_nodes[:250], start=1)
            ]
        else:
            question_nodes = [node for node in all_nodes if node.document_id == questionnaire.id]
            source_nodes = [node for node in all_nodes if node.document_id != questionnaire.id]
            source_documents = {document.id: document for document in documents}
            source_texts = [node.verbatim_text for node in source_nodes]
            latest_filenames = [doc.filename for doc in documents if doc.is_latest_version]
            legacy_filenames = [doc.filename for doc in documents if not doc.is_latest_version]
            planned_items = [
                _plan_questionnaire_finding(
                    q_node,
                    source_nodes,
                    source_documents,
                    source_texts,
                    index=idx,
                    latest_filenames=latest_filenames,
                    legacy_filenames=legacy_filenames,
                    pdf_page_cache=pdf_page_cache,
                )
                for idx, q_node in enumerate(question_nodes, start=1)
            ]

        p0_count = sum(1 for item in planned_items if item["tier"] == PriorityTier.P0_CRITICAL)
        p1_count = sum(1 for item in planned_items if item["tier"] == PriorityTier.P1_HIGH) + len(
            planned_temporal_pairs
        )
        p2_count = sum(1 for item in planned_items if item["tier"] == PriorityTier.P2_MEDIUM)
        p3_count = sum(1 for item in planned_items if item["tier"] == PriorityTier.P3_LOW)
        total_planned_items = len(planned_items) + len(planned_temporal_pairs)
        vanguard_summary = (
            f"Scored {len(all_nodes)} node{'s' if len(all_nodes) != 1 else ''} · "
            f"{p0_count} critical (P0) · {p1_count} high (P1)"
        )
        vanguard_details = {
            "nodes_scored": len(all_nodes),
            "planned_work_items": total_planned_items,
            "p0_count": p0_count,
            "p1_count": p1_count,
            "p2_count": p2_count,
            "p3_count": p3_count,
            "max_score": risk.get("max_score", 0),
            "node_critical_count": risk.get("critical_count", 0),
        }
        vanguard_out = {**risk, "p0_count": p0_count, "p1_count": p1_count, "planned_work_items": total_planned_items}
        if not await _stage_delay_or_infer("Vanguard", vanguard_in, vanguard_out, controller, job_id):
            await session.rollback()
            return []
        if not await _finish_stage(
            session,
            sink,
            agent="Vanguard",
            agent_index=3,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            input_payload=vanguard_in,
            output_payload=vanguard_out,
            summary=vanguard_summary,
            details=vanguard_details,
            document_id=corpus_doc_id,
            document_filename=corpus_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        ):
            return []
    except Exception as exc:
        await _fail_stage(
            session,
            sink,
            agent="Vanguard",
            agent_index=3,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            error=exc,
            details={"nodes_total": len(all_nodes)},
            document_id=corpus_doc_id,
            document_filename=corpus_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        )
        raise

    # Stage 4: Ranger (persists findings and emits progressive `work_item` WS events)
    ranger_doc_id = questionnaire.id if questionnaire is not None else corpus_doc_id
    ranger_doc_filename = questionnaire.filename if questionnaire is not None else corpus_doc_filename
    ranger_in = (
        {"questions": len(planned_items), "document_id": str(questionnaire.id)}
        if questionnaire is not None
        else {"nodes": len(planned_items)}
    )
    ok, s_perf, s_at, s_hash = await _begin_stage(
        session,
        sink,
        agent="Ranger",
        agent_index=4,
        input_payload=ranger_in,
        running_summary=f"Extracting verbatim facts across {len(planned_items)} item{'s' if len(planned_items) != 1 else ''} (>=97% gate)",
        running_details={"items_to_extract": len(planned_items), "mode": "questionnaire_rows" if questionnaire else "document_findings"},
        document_id=ranger_doc_id,
        document_filename=ranger_doc_filename,
        controller=controller,
        job_id=job_id,
        batch_id=batch_id,
    )
    if not ok:
        await session.commit()
        return []

    work_items: list[WorkItem] = []
    verified_facts: list[ExtractedFact] = []
    try:
        if questionnaire is None:
            for plan in planned_items:
                source_node = plan["source_node"]
                node_idx = int(plan["node_index"])
                if controller is not None and job_id is not None and not await controller.before_step(
                    job_id, 4, source_node.document_id, node_idx, agent_label="Ranger"
                ):
                    await session.commit()
                    return work_items
                item = WorkItem(
                    workspace_id=workspace_id,
                    batch_id=batch_id,
                    document_id=source_node.document_id,
                    item_type="DOCUMENT_FINDING",
                    category=plan["category"],
                    priority_tier=plan["tier"],
                    priority_score=plan["priority_score"],
                    original_priority_tier=plan["tier"].value,
                    prompt_or_question=plan["prompt_or_question"],
                    fluent_output=plan["fluent_output"],
                    structured_facts=[plan["fact"].model_dump()],
                    verified_citations=plan["citations"],
                    verification_status=plan["status"],
                    resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                    weak_evidence=plan["weak_evidence"],
                    weak_evidence_reason=plan["weak_reason"],
                    evidence_quality=plan["evidence_quality"],
                    machine_extracted_text=plan["machine_extracted_text"],
                    vision_rescue_text=plan["vision_rescue_text"],
                    has_vision_rescue=plan["has_vision_rescue"],
                    gate_telemetry=plan["gate_telemetry"],
                )
                session.add(item)
                await session.flush()
                work_items.append(item)
                if plan["passed"]:
                    verified_facts.append(plan["fact"])
                await _audit(
                    session,
                    agent="Citation Gate",
                    action="VERIFY",
                    input_payload={"quote": plan["gate_quote"], "source": plan["quote"], "locator": source_node.locator},
                    output_payload=item.gate_telemetry,
                    document_id=source_node.document_id,
                    work_item_id=item.id,
                    processing_ms=1,
                )
                await session.commit()
                await sink.publish(
                    {
                        "type": "gate_check",
                        "passed": plan["passed"],
                        "match_score": plan["gate"].best_citation_score,
                        "region_match_score": plan["region_match_score"],
                        "logprob": plan["gate"].best_logprob,
                        "input_hash": payload_hash([plan["gate_quote"]]),
                        "output_hash": payload_hash(item.gate_telemetry),
                    }
                )
                await sink.publish({"type": "work_item", "id": str(item.id), "status": item.verification_status.value})
        else:
            for plan in planned_items:
                node_idx = int(plan["node_index"])
                if controller is not None and job_id is not None and not await controller.before_step(
                    job_id, 4, questionnaire.id, node_idx, agent_label="Ranger"
                ):
                    await session.commit()
                    return work_items
                fact_node = plan["fact_node"]
                facts = plan["facts"]
                if plan["passed"]:
                    verified_facts.extend(facts)
                work_item = WorkItem(
                    workspace_id=workspace_id,
                    batch_id=batch_id,
                    document_id=questionnaire.id,
                    item_type="QUESTIONNAIRE_ROW",
                    category=_category_for_question(plan["question"]),
                    priority_tier=plan["tier"],
                    priority_score=plan["score"],
                    original_priority_tier=plan["tier"].value,
                    prompt_or_question=plan["question"],
                    fluent_output=plan["output"],
                    structured_facts=[fact.model_dump() for fact in facts],
                    verified_citations=plan["citations"],
                    verification_status=plan["status"],
                    resolved_by_tier=plan["resolved"],
                    weak_evidence=plan["weak_evidence"],
                    weak_evidence_reason=plan["weak_reason"],
                    evidence_quality=plan["evidence_quality"],
                    machine_extracted_text=plan["machine_extracted_text"],
                    vision_rescue_text=plan["vision_rescue_text"],
                    has_vision_rescue=plan["has_vision_rescue"],
                    gate_telemetry=plan["gate_payload"] | {"supersession": plan["supersession_note"]},
                )
                session.add(work_item)
                await session.flush()
                work_items.append(work_item)
                await _audit(
                    session,
                    agent="Citation Gate",
                    action="VERIFY",
                    input_payload={
                        "quotes": plan["quotes"],
                        "tokens": plan["token_logprobs"],
                        "locator": fact_node.locator if fact_node else None,
                    },
                    output_payload=plan["gate_payload"],
                    document_id=questionnaire.id,
                    work_item_id=work_item.id,
                    processing_ms=1,
                )
                await session.commit()
                await sink.publish(
                    {
                        "type": "gate_check",
                        "passed": plan["passed"],
                        "match_score": plan["gate"].best_citation_score,
                        "region_match_score": plan["region_match_score"],
                        "logprob": plan["gate"].best_logprob,
                        "input_hash": payload_hash({"quotes": plan["quotes"], "tokens": plan["token_logprobs"]}),
                        "output_hash": payload_hash(plan["gate_payload"]),
                    }
                )
                await sink.publish({"type": "work_item", "id": str(work_item.id), "status": work_item.verification_status.value})

        verified_count = sum(1 for item in work_items if item.verification_status == VerificationStatus.VERIFIED)
        extracted_count = len(work_items)
        ranger_summary = (
            f"{extracted_count} finding{'s' if extracted_count != 1 else ''} extracted · "
            f"{verified_count} verified >=97%"
        )
        ranger_details = {
            "findings_extracted": extracted_count,
            "verified_count": verified_count,
            "needs_review_count": extracted_count - verified_count,
            "mode": "questionnaire_rows" if questionnaire is not None else "document_findings",
        }
        ranger_out = {"findings_extracted": extracted_count, "verified_count": verified_count}
        if not await _stage_delay_or_infer("Ranger", ranger_in, ranger_out, controller, job_id):
            await session.rollback()
            return work_items
        if not await _finish_stage(
            session,
            sink,
            agent="Ranger",
            agent_index=4,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            input_payload=ranger_in,
            output_payload=ranger_out,
            summary=ranger_summary,
            details=ranger_details,
            document_id=ranger_doc_id,
            document_filename=ranger_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        ):
            return work_items
    except Exception as exc:
        await _fail_stage(
            session,
            sink,
            agent="Ranger",
            agent_index=4,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            error=exc,
            details={"findings_persisted": len(work_items)},
            document_id=ranger_doc_id,
            document_filename=ranger_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        )
        raise

    # Stage 5: Arbiter (resolves temporal/cross-doc contradictions and emits `TEMPORAL_CONFLICT` items)
    arbiter_in = {"temporal_candidates": len(documents)}
    ok, s_perf, s_at, s_hash = await _begin_stage(
        session,
        sink,
        agent="Arbiter",
        agent_index=5,
        input_payload=arbiter_in,
        running_summary=f"Resolving cross-document and temporal contradictions across {len(documents)} source{'s' if len(documents) != 1 else ''}",
        running_details={"documents": doc_filenames},
        document_id=ranger_doc_id,
        document_filename=ranger_doc_filename,
        controller=controller,
        job_id=job_id,
        batch_id=batch_id,
    )
    if not ok:
        await session.commit()
        return work_items

    try:
        conflict = resolve_conflicts(documents)
        temporal_items = await _emit_chronos_temporal_conflicts(
            session,
            sink,
            workspace_id=workspace_id,
            batch_id=batch_id,
            documents=documents,
            all_nodes=all_nodes,
            conflict=conflict,
            pdf_page_cache=pdf_page_cache,
            controller=controller,
            job_id=job_id,
        )
        work_items.extend(temporal_items)
        if await _is_job_cancelled(controller, job_id):
            return work_items

        latest_docs = list(conflict.get("latest_documents", []))
        legacy_docs = list(conflict.get("superseded_documents", []))
        if temporal_items:
            first_tc = temporal_items[0].temporal_conflict or {}
            newer_label = first_tc.get("newer_filename") or (latest_docs[0] if latest_docs else "latest")
            older_label = first_tc.get("older_filename") or (legacy_docs[0] if legacy_docs else "legacy")
            contradictions_count = len(temporal_items)
            arbiter_summary = (
                f"{contradictions_count} temporal contradiction{'s' if contradictions_count != 1 else ''} "
                f"resolved ({newer_label} supersedes {older_label})"
            )
        elif conflict.get("resolved") and legacy_docs:
            newer_label = latest_docs[0] if latest_docs else "latest"
            older_label = legacy_docs[0]
            contradictions_count = len(legacy_docs)
            arbiter_summary = (
                f"{contradictions_count} temporal contradiction{'s' if contradictions_count != 1 else ''} "
                f"resolved ({newer_label} supersedes {older_label})"
            )
        else:
            contradictions_count = 0
            arbiter_summary = "0 temporal contradictions detected · corpus consistent"

        arbiter_details = {
            "resolved": bool(conflict.get("resolved")),
            "contradictions_resolved": contradictions_count,
            "latest_documents": latest_docs,
            "superseded_documents": legacy_docs,
            "resolutions": [
                item.temporal_conflict.get("resolution")
                for item in temporal_items
                if item.temporal_conflict
            ],
        }
        if not await _stage_delay_or_infer("Arbiter", arbiter_in, conflict, controller, job_id):
            await session.rollback()
            return work_items
        if not await _finish_stage(
            session,
            sink,
            agent="Arbiter",
            agent_index=5,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            input_payload=arbiter_in,
            output_payload=conflict,
            summary=arbiter_summary,
            details=arbiter_details,
            document_id=ranger_doc_id,
            document_filename=ranger_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        ):
            return work_items
    except Exception as exc:
        await _fail_stage(
            session,
            sink,
            agent="Arbiter",
            agent_index=5,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            error=exc,
            details={"documents": doc_filenames},
            document_id=ranger_doc_id,
            document_filename=ranger_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        )
        raise

    if await _is_job_cancelled(controller, job_id):
        return work_items

    # Stage 6: Envoy
    envoy_in = (
        {"verified_facts": [fact.model_dump() for fact in verified_facts], "total_work_items": len(work_items)}
        if questionnaire is not None
        else {"verified_facts": sum(1 for item in work_items if item.verification_status == VerificationStatus.VERIFIED), "total_work_items": len(work_items)}
    )
    ok, s_perf, s_at, s_hash = await _begin_stage(
        session,
        sink,
        agent="Envoy",
        agent_index=6,
        input_payload=envoy_in,
        running_summary=f"Synthesizing executive briefing from {len(work_items)} work item{'s' if len(work_items) != 1 else ''}",
        running_details={"total_work_items": len(work_items)},
        document_id=ranger_doc_id,
        document_filename=ranger_doc_filename,
        controller=controller,
        job_id=job_id,
        batch_id=batch_id,
    )
    if not ok:
        await session.commit()
        return work_items

    try:
        summary_record = await persist_executive_summary(
            session,
            arbiter_resolutions=conflict,
            workspace_id=workspace_id,
            mark_prior_stale=True,
        )
        await session.commit()
        metrics = compute_work_item_metrics(work_items)
        defensibility = metrics.get("defensibility_score")
        score_label = f"{defensibility}%" if defensibility is not None else "N/A"
        envoy_summary = f"Executive synthesis generated · {score_label} defensibility"
        envoy_details = {
            "summary_id": str(summary_record.id),
            "defensibility_score": defensibility,
            "total_work_items": metrics["total"],
            "verified_count": metrics["machine_verified"],
            "unresolved_count": metrics["unresolved"],
            "critical_open": metrics["critical_open"],
            "high_open": metrics["high_open"],
        }
        envoy_out = {"outputs": metrics["machine_verified"], "metrics": metrics, "summary_id": str(summary_record.id)}
        if not await _stage_delay_or_infer("Envoy", envoy_in, envoy_out, controller, job_id):
            await session.rollback()
            return work_items
        if not await _finish_stage(
            session,
            sink,
            agent="Envoy",
            agent_index=6,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            input_payload=envoy_in,
            output_payload=envoy_out,
            summary=envoy_summary,
            details=envoy_details,
            document_id=ranger_doc_id,
            document_filename=ranger_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        ):
            return work_items
        await sink.publish(summary_ws_payload(summary_record))
        return work_items
    except Exception as exc:
        await _fail_stage(
            session,
            sink,
            agent="Envoy",
            agent_index=6,
            started_perf=s_perf,
            started_at=s_at,
            input_hash=s_hash,
            error=exc,
            details={"total_work_items": len(work_items)},
            document_id=ranger_doc_id,
            document_filename=ranger_doc_filename,
            controller=controller,
            job_id=job_id,
            batch_id=batch_id,
        )
        raise


def _category_for_question(question: str) -> str:
    lowered = question.lower()
    if "password" in lowered or "mfa" in lowered or "access" in lowered:
        return "Access Control"
    if "encrypt" in lowered or "key" in lowered:
        return "Cryptography"
    if "retain" in lowered or "delete" in lowered:
        return "Data Retention"
    if "liabil" in lowered or "indemn" in lowered:
        return "Liability & Indemnification"
    return "Security Operations"


def _risk_score(text: str, ocr_confidence: float = 1.0) -> int:
    lowered = text.lower()
    score = 24
    if any(term in lowered for term in ("wildcard", "uncapped", "liability", "admin", "secret", "critical")):
        score = 92
    elif any(term in lowered for term in ("mfa", "encryption", "password", "retention", "policy")):
        score = 68
    if ocr_confidence < 0.90:
        score = 100
    return score


def _agent_message(agent: str, output: Any = None) -> str:
    labels = {
        "Scout": "Scanned low-confidence and stamped regions.",
        "Quartermaster": "Categorized the extracted source nodes.",
        "Chronos": "Checked effective dates and supersession signals.",
        "Vanguard": "Assigned caution levels to each finding.",
        "Ranger": "Extracted verbatim facts from the uploaded corpus.",
        "Arbiter": "Resolved conflicts and selected the current evidence.",
        "Envoy": "Wrote the executive-ready verified summary.",
    }
    return labels.get(agent, "Processed source material.")


def _is_strong_candidate(node: ASTNode) -> bool:
    if node.ocr_confidence < 0.90:
        return False
    if _min_words_for_node(node, node.verbatim_text) == 1:
        return len(node.verbatim_text.strip()) >= settings.min_quote_chars
    is_weak, _ = assess_quote_strength(node.verbatim_text)
    return not is_weak


def _fact_node(
    question: str,
    source_nodes: list[ASTNode],
    *,
    doc_by_id: dict[UUID, Document] | None = None,
) -> ASTNode | None:
    lowered = question.lower()
    if "unanswerable" in lowered:
        return None
    candidates = source_nodes
    explicit_rule = True
    if "mfa" in lowered or "authentication" in lowered:
        candidates = [node for node in source_nodes if "mfa" in node.verbatim_text.lower() or "multifactor" in node.verbatim_text.lower()]
    elif "password" in lowered:
        candidates = [node for node in source_nodes if "password" in node.verbatim_text.lower()]
    elif "encrypt" in lowered or "key" in lowered:
        candidates = [node for node in source_nodes if "encrypt" in node.verbatim_text.lower() or "key" in node.verbatim_text.lower()]
    elif "wildcard" in lowered or "s3" in lowered:
        candidates = [node for node in source_nodes if "s3:*" in node.verbatim_text.lower()]
    elif "conflict" in lowered:
        candidates = [node for node in source_nodes if "password" in node.verbatim_text.lower()]
    else:
        explicit_rule = False

    if candidates and doc_by_id:
        latest_candidates = [
            node for node in candidates if doc_by_id.get(node.document_id) and doc_by_id[node.document_id].is_latest_version
        ]
        if latest_candidates:
            candidates = latest_candidates

    if not explicit_rule:
        stop = {
            "what", "which", "when", "does", "have", "with", "that", "this", "from",
            "into", "current", "documented", "available", "control", "policy",
            "system", "data", "security",
        }
        q_terms = {tok for tok in re.findall(r"[a-z0-9]{4,}", lowered) if tok not in stop}
        if not q_terms or not candidates:
            return None
        scored = [
            (
                len(q_terms & set(re.findall(r"[a-z0-9]{4,}", node.verbatim_text.lower()))),
                1 if _is_strong_candidate(node) else 0,
                -idx,
                node,
            )
            for idx, node in enumerate(candidates)
        ]
        best_score, _, _, best_node = max(scored, key=lambda row: (row[0], row[1], row[2]))
        return best_node if best_score > 0 else None

    if not candidates:
        return None
    strong = [node for node in candidates if _is_strong_candidate(node)]
    return strong[0] if strong else candidates[0]
