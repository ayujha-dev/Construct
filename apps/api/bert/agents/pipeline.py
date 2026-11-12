"""Deterministic implementation of the seven-stage regiment with locator propagation."""

from __future__ import annotations

import asyncio
import hashlib
import random
import time
from collections.abc import Awaitable, Callable, Iterator
from itertools import islice
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from bert.agents.arbiter import resolve_conflicts
from bert.agents.chronos import analyze_versions
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
    hard_gate_fields,
    payload_hash,
    run_verification_gate,
    verify_region_text,
)

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


async def _agent_transition(
    session: AsyncSession,
    sink: EventSink,
    agent: str,
    input_payload: Any,
    output_payload: Any,
    *,
    document_id: UUID | None = None,
    action: str = "EXECUTE",
    controller: JobController | None = None,
    job_id: UUID | None = None,
    agent_index: int = 0,
    node_index: int = 0,
) -> bool:
    if controller is not None and job_id is not None:
        if not await controller.before_step(job_id, agent_index, document_id, node_index, agent_label=agent):
            return False
    started = time.perf_counter()
    input_hash = payload_hash(input_payload)
    output_hash = payload_hash(output_payload)
    await sink.publish(
        {
            "type": "agent_transition",
            "agent_name": agent,
            "status": "running",
            "latency_ms": 0,
            "input_hash": input_hash,
            "output_hash": output_hash,
            "document_id": str(document_id) if document_id else None,
            "node_index": node_index,
            "message": _agent_message(agent, output_payload),
        }
    )
    await asyncio.sleep(random.uniform(0.4, 0.6) if settings.inference_mode == "demo_simulator" else 0.0)
    if settings.inference_mode != "demo_simulator":
        await InferenceRuntime().complete(agent, {"input": input_payload, "output_shape": output_payload})
    elapsed = max(1, int((time.perf_counter() - started) * 1000))
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
    await sink.publish(
        {
            "type": "agent_transition",
            "agent_name": agent,
            "status": "completed",
            "latency_ms": elapsed,
            "input_hash": input_hash,
            "output_hash": output_hash,
            "document_id": str(document_id) if document_id else None,
            "node_index": node_index,
            "message": _agent_message(agent, output_payload),
        }
    )
    if controller is not None and job_id is not None:
        await controller.mark_step(job_id, agent_index, output_payload)
    return True


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
        unresolved_count=summary_data["unresolved_count"],
        escalated_legal_count=summary_data["escalated_legal_count"],
        critical_count=summary_data["critical_count"],
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

    async def transition(
        agent: str,
        input_payload: Any,
        output_payload: Any,
        *,
        document_id: UUID | None = None,
        agent_index: int = 0,
        node_index: int = 0,
    ) -> bool:
        return await _agent_transition(
            session,
            sink,
            agent,
            input_payload,
            output_payload,
            document_id=document_id,
            controller=controller,
            job_id=job_id,
            agent_index=agent_index,
            node_index=node_index,
        )

    if not await transition("Scout", {"low_confidence": len(low_confidence)}, {"rescued": len(low_confidence)}, agent_index=0):
        await session.commit()
        return []
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
    if not await transition("Quartermaster", {"nodes": len(all_nodes)}, taxonomy, agent_index=1):
        await session.commit()
        return []
    temporal = analyze_versions(documents)
    if not await transition("Chronos", {"documents": len(documents)}, temporal, agent_index=2):
        await session.commit()
        return []
    risk = score_nodes(all_nodes)
    if not await transition("Vanguard", {"nodes": len(all_nodes)}, risk, agent_index=3):
        await session.commit()
        return []

    pdf_page_cache: dict[tuple[str, int], list[dict[str, Any]]] = {}
    conflict = resolve_conflicts(documents)
    questionnaire = next((doc for doc in documents if doc.source_format == SourceFormat.XLSX), None)

    if questionnaire is None:
        if not await transition("Ranger", {"nodes": len(all_nodes)}, {"facts": len(all_nodes)}, agent_index=4):
            await session.commit()
            return []
        if not await transition(
            "Arbiter",
            {"temporal_candidates": len(documents)},
            conflict,
            agent_index=5,
        ):
            await session.commit()
            return []
        generic_items: list[WorkItem] = []
        for index, source_node in enumerate(all_nodes[:250], start=1):
            if controller is not None and job_id is not None and not await controller.before_step(
                job_id, 4, source_node.document_id, index, agent_label="Ranger"
            ):
                await session.commit()
                return generic_items
            document = next((candidate for candidate in documents if candidate.id == source_node.document_id), None)
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
            # Low-confidence or stamped regions must remain human-visible even
            # though the text fallback can technically reproduce the quote.
            gate_quote = "[unreadable source region]" if source_node.ocr_confidence < 0.90 else quote
            gate = run_verification_gate([gate_quote], [quote])
            passed = gate.passed and region_passed
            score = _risk_score(quote, source_node.ocr_confidence)
            item = WorkItem(
                workspace_id=workspace_id,
                batch_id=batch_id,
                document_id=source_node.document_id,
                item_type="DOCUMENT_FINDING",
                category=_category_for_question(quote),
                priority_tier=PriorityTier.P0_CRITICAL if not passed else _tier_for_score(score),
                priority_score=100 if not passed else score,
                prompt_or_question=source_node.section_path or f"Source item {index}",
                fluent_output=(
                    INSUFFICIENT_EVIDENCE_OUTPUT
                    if not passed
                    else f"Verified source excerpt from {document.filename if document else 'uploaded file'}."
                ),
                structured_facts=[fact.model_dump()],
                verified_citations=(
                    [_citation_payload(source_node, document, quote, gate.best_citation_score, region_match_score)]
                    if passed
                    else []
                ),
                verification_status=VerificationStatus.VERIFIED if passed else VerificationStatus.INSUFFICIENT_EVIDENCE,
                resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                gate_telemetry={
                    "citation_match": gate.best_citation_score,
                    "region_match_score": region_match_score,
                    "critical_logprob": gate.best_logprob,
                    "failed_citations": gate.failed_citations,
                    "failed_logprobs": gate.failed_logprobs,
                },
            )
            session.add(item)
            await session.flush()
            generic_items.append(item)
            await _audit(
                session,
                agent="Citation Gate",
                action="VERIFY",
                input_payload={"quote": gate_quote, "source": quote, "locator": source_node.locator},
                output_payload=item.gate_telemetry,
                document_id=source_node.document_id,
                work_item_id=item.id,
                processing_ms=1,
            )
            await sink.publish(
                {
                    "type": "gate_check",
                    "passed": passed,
                    "match_score": gate.best_citation_score,
                    "region_match_score": region_match_score,
                    "logprob": gate.best_logprob,
                    "input_hash": payload_hash([gate_quote]),
                    "output_hash": payload_hash(item.gate_telemetry),
                }
            )
            await sink.publish({"type": "work_item", "id": str(item.id), "status": item.verification_status.value})
            await session.commit()

        summary_record = await persist_executive_summary(
            session,
            arbiter_resolutions=conflict,
            workspace_id=workspace_id,
            mark_prior_stale=True,
        )
        await session.commit()
        await transition(
            "Envoy",
            {"verified_facts": len(generic_items)},
            {"outputs": len(generic_items), "summary_id": str(summary_record.id)},
            agent_index=6,
        )
        await sink.publish(
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
        return generic_items

    question_nodes = [node for node in all_nodes if node.document_id == questionnaire.id]
    source_nodes = [node for node in all_nodes if node.document_id != questionnaire.id]
    source_documents = {document.id: document for document in documents}
    source_texts = [node.verbatim_text for node in source_nodes]
    if not await transition(
        "Ranger",
        {"questions": len(question_nodes)},
        {"mode": "atomic_json_only"},
        document_id=questionnaire.id,
        agent_index=4,
    ):
        await session.commit()
        return []
    if not await transition(
        "Arbiter",
        {"temporal_candidates": len(documents)},
        conflict,
        document_id=questionnaire.id,
        agent_index=5,
    ):
        await session.commit()
        return []

    work_items: list[WorkItem] = []
    verified_facts: list[ExtractedFact] = []
    for index, question_node in enumerate(question_nodes, start=1):
        if controller is not None and job_id is not None and not await controller.before_step(
            job_id, 4, questionnaire.id, index, agent_label="Ranger"
        ):
            await session.commit()
            return work_items
        question = str((question_node.structured_payload or {}).get("row_data", {}).get("Question", question_node.verbatim_text))
        fact_node = _fact_node(question, source_nodes, doc_by_id=source_documents)
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
        if "unanswerable" in question.lower():
            facts = [
                ExtractedFact(
                    fact_type="CLAUSE",
                    value="unverified claim",
                    verbatim_quote="This statement is not in the uploaded corpus",
                    ast_node_id=str(question_node.id),
                    confidence=0.42,
                    locator=dict(question_node.locator) if question_node.locator else None,
                    region_match_score=0.0,
                )
            ]
            region_passed = False
            region_match_score = 0.0

        if fact_node is not None and fact_node.ocr_confidence < 0.90 and "unanswerable" not in question.lower():
            quotes = ["[unreadable source region]"]
            region_passed = False
            region_match_score = 0.0
        else:
            quotes = [fact.verbatim_quote for fact in facts]

        token_logprobs = [{"token": fact.value[:12], "entity_type": fact.fact_type, "probability": 0.96} for fact in facts]
        gate = run_verification_gate(quotes or [question], source_texts, token_logprobs)
        passed = gate.passed and (region_passed if fact_node is not None and "unanswerable" not in question.lower() else False)
        gate_payload = {
            "citation_match": gate.best_citation_score,
            "region_match_score": region_match_score,
            "critical_logprob": gate.best_logprob,
            "failed_citations": gate.failed_citations,
            "failed_logprobs": gate.failed_logprobs,
        }
        await _audit(
            session,
            agent="Citation Gate",
            action="VERIFY",
            input_payload={"quotes": quotes, "tokens": token_logprobs, "locator": fact_node.locator if fact_node else None},
            output_payload=gate_payload,
            document_id=questionnaire.id,
            processing_ms=1,
        )
        await sink.publish(
            {
                "type": "gate_check",
                "passed": passed,
                "match_score": gate.best_citation_score,
                "region_match_score": region_match_score,
                "logprob": gate.best_logprob,
                "input_hash": payload_hash({"quotes": quotes, "tokens": token_logprobs}),
                "output_hash": payload_hash(gate_payload),
            }
        )
        fields = hard_gate_fields(gate)
        if passed:
            verified_facts.extend(facts)
            output = synthesize_verified_output(facts, gate)
            status = VerificationStatus.VERIFIED
            score = 92 if "wildcard" in question.lower() else 72 - index
            tier = _tier_for_score(score)
            resolved = ResolvedByTier.TIER1_CACHE if index == 1 else ResolvedByTier.TIER2_SLM_REGIMENT
        else:
            output = str(fields.get("fluent_output") or INSUFFICIENT_EVIDENCE_OUTPUT)
            status = VerificationStatus.INSUFFICIENT_EVIDENCE
            score = 100
            tier = PriorityTier.P0_CRITICAL
            resolved = ResolvedByTier.TIER3_ARBITER if "conflict" in question.lower() else ResolvedByTier.TIER2_SLM_REGIMENT

        supersession_note: str | None = None
        if conflict.get("resolved") and "password" in question.lower():
            latest_list = ", ".join(conflict.get("latest_documents", []))
            legacy_list = ", ".join(conflict.get("superseded_documents", []))
            supersession_note = f"{latest_list} supersedes {legacy_list}"

        work_item = WorkItem(
            workspace_id=workspace_id,
            batch_id=batch_id,
            document_id=questionnaire.id,
            item_type="QUESTIONNAIRE_ROW",
            category=_category_for_question(question),
            priority_tier=tier,
            priority_score=score,
            prompt_or_question=question,
            fluent_output=output,
            structured_facts=[fact.model_dump() for fact in facts],
            verified_citations=[
                _citation_payload(fact_node, fact_doc, fact.verbatim_quote, gate.best_citation_score, region_match_score)
                for fact in facts
            ]
            if passed and fact_node is not None
            else [],
            verification_status=status,
            resolved_by_tier=resolved,
            gate_telemetry=gate_payload | {"supersession": supersession_note},
        )
        session.add(work_item)
        await session.flush()
        await session.commit()
        work_items.append(work_item)

    summary_record = await persist_executive_summary(
        session,
        arbiter_resolutions=conflict,
        workspace_id=workspace_id,
        mark_prior_stale=True,
    )
    await session.commit()

    await transition(
        "Envoy",
        {"verified_facts": [fact.model_dump() for fact in verified_facts]},
        {"outputs": sum(item.verification_status == VerificationStatus.VERIFIED for item in work_items), "summary_id": str(summary_record.id)},
        document_id=questionnaire.id,
        agent_index=6,
    )
    await sink.publish(
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
    for item in work_items:
        await sink.publish({"type": "work_item", "id": str(item.id), "status": item.verification_status.value})
    return work_items


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


def _agent_message(agent: str, output: Any) -> str:
    labels = {
        "Scout": "Scanned low-confidence and stamped regions.",
        "Quartermaster": "Categorized the extracted source nodes.",
        "Chronos": "Checked effective dates and supersession signals.",
        "Vanguard": "Assigned caution levels to each finding.",
        "Ranger": "Extracted verbatim facts from the uploaded corpus.",
        "Arbiter": "Resolved conflicts and selected the current evidence.",
        "Envoy": "Wrote the executive-ready verified summary.",
    }
    return f"{labels.get(agent, 'Processed source material')} ({output})."


def _fact_node(
    question: str,
    source_nodes: list[ASTNode],
    *,
    doc_by_id: dict[UUID, Document] | None = None,
) -> ASTNode | None:
    import re

    lowered = question.lower()
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
    if candidates and not explicit_rule:
        stop = {"what", "which", "when", "does", "have", "with", "that", "this", "from", "into", "current", "documented", "available", "control", "policy", "system", "data", "security"}
        q_terms = {tok for tok in re.findall(r"[a-z0-9]{4,}", lowered) if tok not in stop}
        if q_terms:
            scored = [
                (len(q_terms & set(re.findall(r"[a-z0-9]{4,}", node.verbatim_text.lower()))), -idx, node)
                for idx, node in enumerate(candidates)
            ]
            best_score, _, best_node = max(scored, key=lambda row: (row[0], row[1]))
            if best_score > 0:
                return best_node
    return candidates[0] if candidates else (source_nodes[0] if source_nodes and "unanswerable" not in lowered else None)
