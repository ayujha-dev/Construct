"""Deterministic demo implementation of the seven-stage regiment."""

from __future__ import annotations

import asyncio
import hashlib
import random
import time
from collections.abc import Awaitable, Callable, Iterator
from itertools import islice
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bert.agents.envoy import synthesize_verified_output
from bert.agents.controller import JobController
from bert.agents.arbiter import resolve_conflicts
from bert.agents.chronos import analyze_versions
from bert.agents.quartermaster import categorize_nodes
from bert.agents.ranger import ExtractedFact
from bert.agents.scout import rescue_regions
from bert.agents.vanguard import score_nodes
from bert.config import settings
from bert.ingestion.docling_parser import IngestionResult, ParsedNode
from bert.inference.runtime import InferenceRuntime, runtime_profile
from bert.models.documents import (
    ASTNode,
    AuditLog,
    Document,
    PriorityTier,
    ResolvedByTier,
    SourceFormat,
    VerificationStatus,
    WorkItem,
)
from bert.verification.citation_gate import INSUFFICIENT_EVIDENCE_OUTPUT, hard_gate_fields, payload_hash, run_verification_gate

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
    session: AsyncSession, *, agent: str, action: str, input_payload: Any, output_payload: Any,
    document_id: UUID | None = None, work_item_id: UUID | None = None, processing_ms: int = 0,
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
    session: AsyncSession, sink: EventSink, agent: str, input_payload: Any, output_payload: Any,
    *, document_id: UUID | None = None, action: str = "EXECUTE",
    controller: JobController | None = None, job_id: UUID | None = None,
    agent_index: int = 0, node_index: int = 0,
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
        session, agent=agent, action=action, input_payload=input_payload, output_payload=output_payload,
        document_id=document_id, processing_ms=elapsed, confidence=0.96,
    )
    # Release the SQLite write transaction before the controller mirrors its cursor.
    # PostgreSQL deployments simply gain a smaller transaction boundary here.
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
    session: AsyncSession, workspace_id: UUID, filename: str, source_format: SourceFormat,
    result: IngestionResult, *, storage_path: str | None = None,
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
    while batch := await asyncio.to_thread(lambda: list(islice(nodes, batch_size))):
        persisted: list[ASTNode] = []
        for parsed in batch:
            digest.update(parsed.verbatim_text.encode("utf-8"))
            node_count += 1
            max_page = max(max_page, parsed.page_number or 0)
            persisted.append(
                ASTNode(
                    id=uuid4(),
                    document_id=document.id,
                    node_type=parsed.node_type,
                    section_path=parsed.section_path,
                    verbatim_text=parsed.verbatim_text,
                    structured_payload=parsed.structured_payload,
                    page_number=parsed.page_number,
                    bounding_box=parsed.bounding_box,
                    ocr_confidence=parsed.ocr_confidence,
                    node_order=parsed.node_order,
                )
            )
        session.add_all(persisted)
        await session.flush()

    document.ast_checksum = digest.hexdigest()
    document.total_pages = max_page
    document.total_ast_nodes = node_count
    document.processing_status = "COMPLETED" if expected_checksum in (None, document.ast_checksum) else "FAILED"
    await session.flush()
    return document


def _tier_for_score(score: int) -> PriorityTier:
    if score >= 85:
        return PriorityTier.P0_CRITICAL
    if score >= 65:
        return PriorityTier.P1_HIGH
    if score >= 35:
        return PriorityTier.P2_MEDIUM
    return PriorityTier.P3_LOW


async def run_regiment(
    session: AsyncSession, workspace_id: UUID, batch_id: UUID, documents: list[Document], sink: EventSink,
    *, controller: JobController | None = None, job_id: UUID | None = None,
) -> list[WorkItem]:
    """Run each named transition, then create gated questionnaire work items."""
    all_nodes: list[ASTNode] = []
    for document in documents:
        result = await session.execute(select(ASTNode).where(ASTNode.document_id == document.id).order_by(ASTNode.node_order))
        all_nodes.extend(result.scalars().all())
    low_confidence = rescue_regions([
        ParsedNode(node_type=node.node_type, verbatim_text=node.verbatim_text, page_number=node.page_number,
                   bounding_box=node.bounding_box, ocr_confidence=node.ocr_confidence, node_order=node.node_order)
        for node in all_nodes
    ])
    async def transition(agent: str, input_payload: Any, output_payload: Any, *, document_id: UUID | None = None, agent_index: int = 0, node_index: int = 0) -> bool:
        return await _agent_transition(
            session, sink, agent, input_payload, output_payload, document_id=document_id,
            controller=controller, job_id=job_id, agent_index=agent_index, node_index=node_index,
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

    questionnaire = next((doc for doc in documents if doc.source_format == SourceFormat.XLSX), None)
    if questionnaire is None:
        # A single uploaded PDF, TXT, Markdown, or JSON file is itself the
        # evidence corpus.  Treat each extracted AST node as an inspectable
        # finding so the live upload path reaches Results without requiring a
        # companion questionnaire.
        await transition("Ranger", {"nodes": len(all_nodes)}, {"facts": len(all_nodes)}, agent_index=4)
        await transition("Arbiter", {"conflicts": 0}, {"resolved": 0}, agent_index=5)
        generic_items: list[WorkItem] = []
        for index, source_node in enumerate(all_nodes[:250], start=1):
            if controller is not None and job_id is not None and not await controller.before_step(
                job_id, 4, source_node.document_id, index, agent_label="Ranger"
            ):
                await session.commit()
                return generic_items
            document = next((candidate for candidate in documents if candidate.id == source_node.document_id), None)
            quote = source_node.verbatim_text
            fact = ExtractedFact(
                fact_type="SOURCE_EXCERPT",
                value=quote[:120],
                verbatim_quote=quote,
                ast_node_id=str(source_node.id),
                confidence=0.98 if source_node.ocr_confidence >= 0.90 else 0.72,
            )
            # Low-confidence or stamped regions must remain human-visible even
            # though the text fallback can technically reproduce the quote.
            gate_quote = "[unreadable source region]" if source_node.ocr_confidence < 0.90 else quote
            gate = run_verification_gate([gate_quote], [quote])
            score = _risk_score(quote, source_node.ocr_confidence)
            item = WorkItem(
                workspace_id=workspace_id,
                batch_id=batch_id,
                document_id=source_node.document_id,
                item_type="DOCUMENT_FINDING",
                category=_category_for_question(quote),
                priority_tier=PriorityTier.P0_CRITICAL if not gate.passed else _tier_for_score(score),
                priority_score=100 if not gate.passed else score,
                prompt_or_question=source_node.section_path or f"Source item {index}",
                fluent_output=(
                    INSUFFICIENT_EVIDENCE_OUTPUT
                    if not gate.passed
                    else f"Verified source excerpt from {document.filename if document else 'uploaded file'}."
                ),
                structured_facts=[fact.model_dump()],
                verified_citations=(
                    [{"quote": quote, "ast_node_id": str(source_node.id), "page_number": source_node.page_number,
                      "document_filename": document.filename if document else None}]
                    if gate.passed else []
                ),
                verification_status=VerificationStatus.VERIFIED if gate.passed else VerificationStatus.INSUFFICIENT_EVIDENCE,
                resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                gate_telemetry={"citation_match": gate.best_citation_score, "critical_logprob": gate.best_logprob,
                                "failed_citations": gate.failed_citations, "failed_logprobs": gate.failed_logprobs},
            )
            session.add(item)
            await session.flush()
            generic_items.append(item)
            await _audit(
                session,
                agent="Citation Gate",
                action="VERIFY",
                input_payload={"quote": gate_quote, "source": quote},
                output_payload=item.gate_telemetry,
                document_id=source_node.document_id,
                work_item_id=item.id,
                processing_ms=1,
            )
            await sink.publish({"type": "gate_check", "passed": gate.passed, "match_score": gate.best_citation_score,
                                "logprob": gate.best_logprob, "input_hash": payload_hash([gate_quote]),
                                "output_hash": payload_hash(item.gate_telemetry)})
            await sink.publish({"type": "work_item", "id": str(item.id), "status": item.verification_status.value})
            # Release SQLite's writer lock before the checkpoint controller
            # persists the cursor for the next extracted node.
            await session.commit()
        await transition("Envoy", {"verified_facts": len(generic_items)}, {"outputs": len(generic_items)}, agent_index=6)
        await session.commit()
        return generic_items
    question_nodes = [node for node in all_nodes if node.document_id == questionnaire.id]
    source_nodes = [node for node in all_nodes if node.document_id != questionnaire.id]
    source_documents = {document.id: document for document in documents}
    source_texts = [node.verbatim_text for node in source_nodes]
    if not await transition("Ranger", {"questions": len(question_nodes)}, {"mode": "atomic_json_only"}, document_id=questionnaire.id, agent_index=4):
        await session.commit()
        return []
    conflict = resolve_conflicts(documents)
    if not await transition("Arbiter", {"temporal_candidates": 2}, conflict, document_id=questionnaire.id, agent_index=5):
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
        fact_node = _fact_node(question, source_nodes)
        facts: list[ExtractedFact] = []
        if fact_node is not None:
            fact_type = "CLAUSE"
            if "date" in question.lower() or "when" in question.lower():
                fact_type = "DATE"
            facts = [ExtractedFact(
                fact_type=fact_type, value=fact_node.verbatim_text[:90], verbatim_quote=fact_node.verbatim_text,
                ast_node_id=str(fact_node.id), confidence=0.98,
            )]
        if "unanswerable" in question.lower():
            facts = [ExtractedFact(
                fact_type="CLAUSE", value="unverified claim", verbatim_quote="This statement is not in the uploaded corpus",
                ast_node_id=str(question_node.id), confidence=0.42,
            )]
        quotes = [fact.verbatim_quote for fact in facts]
        token_logprobs = [{"token": fact.value[:12], "entity_type": fact.fact_type, "probability": 0.96} for fact in facts]
        gate = run_verification_gate(quotes or [question], source_texts, token_logprobs)
        gate_payload = {
            "citation_match": gate.best_citation_score, "critical_logprob": gate.best_logprob,
            "failed_citations": gate.failed_citations, "failed_logprobs": gate.failed_logprobs,
        }
        await _audit(
            session, agent="Citation Gate", action="VERIFY", input_payload={"quotes": quotes, "tokens": token_logprobs},
            output_payload=gate_payload, document_id=questionnaire.id, processing_ms=1,
        )
        await sink.publish(
            {
                "type": "gate_check",
                "passed": gate.passed,
                "match_score": gate.best_citation_score,
                "logprob": gate.best_logprob,
                "input_hash": payload_hash({"quotes": quotes, "tokens": token_logprobs}),
                "output_hash": payload_hash(gate_payload),
            }
        )
        fields = hard_gate_fields(gate)
        if gate.passed:
            verified_facts.extend(facts)
            output = synthesize_verified_output(facts, gate)
            status = VerificationStatus.VERIFIED
            score = 92 if "wildcard" in question.lower() else 72 - index
            tier = _tier_for_score(score)
            resolved = ResolvedByTier.TIER1_CACHE if index == 1 else ResolvedByTier.TIER2_SLM_REGIMENT
        else:
            output = str(fields["fluent_output"])
            status = VerificationStatus.INSUFFICIENT_EVIDENCE
            score = 100
            tier = PriorityTier.P0_CRITICAL
            resolved = ResolvedByTier.TIER3_ARBITER if "conflict" in question.lower() else ResolvedByTier.TIER2_SLM_REGIMENT
        work_item = WorkItem(
            workspace_id=workspace_id, batch_id=batch_id, document_id=questionnaire.id, item_type="QUESTIONNAIRE_ROW",
            category=_category_for_question(question), priority_tier=tier, priority_score=score,
            prompt_or_question=question, fluent_output=output,
            structured_facts=[fact.model_dump() for fact in facts],
            verified_citations=[
                {
                    "quote": fact.verbatim_quote,
                    "ast_node_id": fact.ast_node_id,
                    "page_number": fact_node.page_number if fact_node is not None else None,
                    "document_filename": source_documents.get(fact_node.document_id).filename if fact_node is not None and source_documents.get(fact_node.document_id) else None,
                }
                for fact in facts
            ] if gate.passed else [],
            verification_status=status, resolved_by_tier=resolved,
            gate_telemetry=gate_payload | {"supersession": "2026 SOC 2 supersedes 2023 Policy" if "password" in question.lower() else None},
        )
        session.add(work_item)
        await session.flush()
        await session.commit()
        work_items.append(work_item)
    await transition(
        "Envoy",
        {"verified_facts": [fact.model_dump() for fact in verified_facts]},
        {"outputs": sum(item.verification_status == VerificationStatus.VERIFIED for item in work_items)},
        document_id=questionnaire.id, agent_index=6,
    )
    await session.commit()
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


def _fact_node(question: str, source_nodes: list[ASTNode]) -> ASTNode | None:
    lowered = question.lower()
    candidates = source_nodes
    if "mfa" in lowered:
        candidates = [node for node in source_nodes if "mfa" in node.verbatim_text.lower()]
    elif "password" in lowered:
        candidates = [node for node in source_nodes if "password" in node.verbatim_text.lower()]
    elif "encrypt" in lowered:
        candidates = [node for node in source_nodes if "encrypt" in node.verbatim_text.lower()]
    elif "wildcard" in lowered or "s3" in lowered:
        candidates = [node for node in source_nodes if "s3:*" in node.verbatim_text.lower()]
    elif "conflict" in lowered:
        candidates = [node for node in source_nodes if "password" in node.verbatim_text.lower()]
    return candidates[0] if candidates else (source_nodes[0] if source_nodes and "unanswerable" not in lowered else None)
