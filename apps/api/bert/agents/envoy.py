"""Envoy synthesis guarded by an explicit verified-facts-only boundary."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from bert.agents.arbiter import resolve_conflicts
from bert.agents.ranger import ExtractedFact
from bert.models.documents import Document, PriorityTier, VerificationStatus, WorkItem
from bert.verification.citation_gate import VerificationResult
from bert.verification.metrics import compute_work_item_metrics


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def _naive_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.min
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


def synthesize_verified_output(facts: list[ExtractedFact], gate: VerificationResult) -> str:
    """Synthesize only after a passed gate; raw source chunks are not accepted."""
    if not gate.passed:
        raise ValueError("Envoy requires a passed verification gate")
    if not facts:
        return "No verified facts were found in the uploaded corpus."
    statements = [f"{fact.value} [{fact.fact_type}]" for fact in facts]
    return "Verified corpus evidence indicates " + "; ".join(statements) + "."


def build_executive_summary(
    *,
    documents: list[Document],
    work_items: list[WorkItem],
    arbiter_resolutions: dict[str, Any] | None = None,
    document_id: UUID | None = None,
    only_critical: bool = False,
    latest_only: bool = False,
    workspace_id: UUID | None = None,
) -> dict[str, Any]:
    """Build a corpus/filtered Envoy executive summary strictly from live DB findings."""
    doc_by_id = {doc.id: doc for doc in documents}
    superseded_doc_ids = {str(doc.id) for doc in documents if not doc.is_latest_version}
    superseded_filenames = {doc.filename for doc in documents if not doc.is_latest_version}

    scoped_docs = [
        doc
        for doc in documents
        if (not latest_only or doc.is_latest_version) and (document_id is None or doc.id == document_id)
    ]

    def matches_document(item: WorkItem, target_id: UUID) -> bool:
        if item.document_id == target_id:
            return True
        target_doc = doc_by_id.get(target_id)
        target_str = str(target_id)
        for citation in item.verified_citations or []:
            loc = citation.get("locator") or {}
            if loc.get("doc_id") == target_str:
                return True
            if target_doc is not None and citation.get("document_filename") == target_doc.filename:
                return True
        for fact in item.structured_facts or []:
            loc = fact.get("locator") or {}
            if loc.get("doc_id") == target_str:
                return True
        tc = item.temporal_conflict or {}
        if tc.get("newer_doc_id") == target_str or tc.get("older_doc_id") == target_str:
            return True
        return False

    def matches_latest(item: WorkItem) -> bool:
        if item.item_type == "TEMPORAL_CONFLICT":
            return True
        if item.document_id and str(item.document_id) in superseded_doc_ids:
            return False
        citations = item.verified_citations or []
        if citations:
            all_superseded = all(
                (cit.get("locator") or {}).get("doc_id") in superseded_doc_ids
                or cit.get("document_filename") in superseded_filenames
                for cit in citations
            )
            if all_superseded:
                return False
        else:
            facts = item.structured_facts or []
            fact_docs = [(f.get("locator") or {}).get("doc_id") for f in facts if (f.get("locator") or {}).get("doc_id")]
            if fact_docs and all(d in superseded_doc_ids for d in fact_docs):
                return False
        return True

    filtered_items = list(work_items)
    if document_id is not None:
        filtered_items = [item for item in filtered_items if matches_document(item, document_id)]
    if latest_only:
        filtered_items = [item for item in filtered_items if matches_latest(item)]
    if only_critical:
        filtered_items = [
            item for item in filtered_items if _enum_value(item.priority_tier) == PriorityTier.P0_CRITICAL.value
        ]

    filtered_items.sort(key=lambda item: (-int(item.priority_score), _naive_utc(item.created_at)))

    metrics = compute_work_item_metrics(filtered_items)
    total = metrics["total"]
    verified_count = metrics["machine_verified"]
    human_override_count = metrics["human_override"]
    escalated_legal_count = metrics["escalated_legal"]
    not_applicable_count = metrics["not_applicable"]
    unresolved_count = metrics["unresolved"]
    critical_count = metrics["critical_total"]
    critical_open_count = metrics["critical_open"]
    high_open_count = metrics["high_open"]
    weak_evidence_count = metrics["weak_evidence_count"]
    defensibility_score = metrics["defensibility_score"]

    arbiter = arbiter_resolutions if arbiter_resolutions is not None else resolve_conflicts(documents)
    latest_docs = list(arbiter.get("latest_documents", []))
    superseded_docs = list(arbiter.get("superseded_documents", []))

    target_doc = doc_by_id.get(document_id) if document_id is not None else None
    scope_parts: list[str] = []
    if target_doc is not None:
        scope_parts.append(f"document {target_doc.filename}")
    elif document_id is not None:
        scope_parts.append(f"document {document_id}")
    else:
        scope_parts.append("active corpus")
    if only_critical:
        scope_parts.append("P0 critical only")
    if latest_only:
        scope_parts.append("latest version only")
    scope_label = ", ".join(scope_parts)

    key_findings: list[dict[str, Any]] = []
    for item in filtered_items[:25]:
        item_doc = doc_by_id.get(item.document_id) if item.document_id else None
        key_findings.append(
            {
                "work_item_id": str(item.id),
                "document_id": str(item.document_id) if item.document_id else None,
                "document_filename": item_doc.filename if item_doc else None,
                "priority_tier": _enum_value(item.priority_tier),
                "verification_status": _enum_value(item.verification_status),
                "category": item.category,
                "prompt_or_question": item.prompt_or_question,
                "fluent_output": item.fluent_output,
            }
        )

    if total == 0:
        summary_text = (
            f"0 findings match the selected scope ({scope_label}). "
            "No verified evidence or open escalations are present for this selection."
        )
        markdown_lines = [
            "# BERT Executive Review Summary",
            "",
            summary_text,
            "",
            "## Metrics",
            f"- Scope: {scope_label}",
            f"- Documents in scope: {len(scoped_docs)}",
            "- Work items processed: 0",
            "- Machine-verified items: 0",
            "- Human overrides (HUMAN_OVERRIDE): 0",
            "- Legal escalations (ESCALATED_LEGAL): 0",
            "- Marked N/A (NOT_APPLICABLE): 0",
            "- Unresolved items: 0",
            "- Critical P0 items (total / open): 0 / 0",
            "- High P1 open items: 0",
            "- Weak-evidence items: 0",
            "- Defensibility score: N/A (no findings)",
            "",
            "## Findings",
            "",
            "0 findings match the current corpus or filter criteria.",
        ]
        return {
            "workspace_id": workspace_id or (documents[0].workspace_id if documents else None),
            "document_id": document_id,
            "only_critical": only_critical,
            "latest_only": latest_only,
            "total_work_items": 0,
            "verified_count": 0,
            "human_override_count": 0,
            "unresolved_count": 0,
            "escalated_legal_count": 0,
            "not_applicable_count": 0,
            "critical_count": 0,
            "critical_open_count": 0,
            "high_open_count": 0,
            "weak_evidence_count": 0,
            "defensibility_score": None,
            "summary_text": summary_text,
            "markdown": "\n".join(markdown_lines) + "\n",
            "key_findings": [],
            "arbiter_resolutions": arbiter,
        }

    score_label = f"{defensibility_score}%" if defensibility_score is not None else "N/A"
    sentences = [
        f"Envoy reviewed {total} finding(s) across {len(scoped_docs)} document(s) ({scope_label}): "
        f"{verified_count} machine-verified ({score_label} defensibility), "
        f"{human_override_count} human-overridden, {not_applicable_count} N/A, "
        f"{escalated_legal_count} legal-escalated, {unresolved_count} unresolved ({critical_open_count}/{critical_count} P0 open)."
    ]
    if human_override_count > 0:
        sentences.append(
            f"{human_override_count} finding(s) carry HUMAN_OVERRIDE attestations and remain excluded from the machine-verified defensibility numerator."
        )
    if escalated_legal_count > 0:
        legal_items = [
            item
            for item in filtered_items
            if _enum_value(item.verification_status) == VerificationStatus.ESCALATED_LEGAL.value
        ]
        assignees = sorted({item.escalation_assignee or "Legal Counsel" for item in legal_items})
        sentences.append(
            f"{escalated_legal_count} finding(s) remain ESCALATED_LEGAL (assigned to {', '.join(assignees)}) "
            "and are excluded from the verified defensibility numerator."
        )
    if arbiter.get("resolved") and superseded_docs:
        sentences.append(
            f"Arbiter enforced temporal precedence in favor of {', '.join(latest_docs) or 'latest sources'} "
            f"over superseded source(s) {', '.join(superseded_docs)}."
        )
    priority_highlights = [
        f"{item.prompt_or_question} [{_enum_value(item.priority_tier)}/{_enum_value(item.verification_status)}]"
        for item in filtered_items[:3]
    ]
    if priority_highlights:
        sentences.append("Top items: " + "; ".join(priority_highlights) + ".")
    summary_text = " ".join(sentences)

    markdown_lines = [
        "# BERT Executive Review Summary",
        "",
        summary_text,
        "",
        "## Metrics",
        f"- Scope: {scope_label}",
        f"- Documents in scope: {len(scoped_docs)}",
        f"- Work items processed: {total}",
        f"- Machine-verified items: {verified_count}",
        f"- Human overrides (HUMAN_OVERRIDE): {human_override_count}",
        f"- Legal escalations (ESCALATED_LEGAL): {escalated_legal_count}",
        f"- Marked N/A (NOT_APPLICABLE): {not_applicable_count}",
        f"- Unresolved items: {unresolved_count}",
        f"- Critical P0 items (total / open): {critical_count} / {critical_open_count}",
        f"- High P1 open items: {high_open_count}",
        f"- Weak-evidence items: {weak_evidence_count}",
        f"- Defensibility score: {score_label}",
        "",
        "## Arbiter Conflict Resolution",
        f"- Authoritative sources: {', '.join(latest_docs) or 'None'}",
        f"- Superseded sources: {', '.join(superseded_docs) or 'None'}",
        f"- Resolution status: {'Resolved' if arbiter.get('resolved') else 'No version conflicts detected'}",
        "",
        "## Findings",
    ]
    for item in filtered_items:
        tier = _enum_value(item.priority_tier)
        status = _enum_value(item.verification_status)
        meta_bits: list[str] = []
        if status == VerificationStatus.ESCALATED_LEGAL.value:
            if item.escalation_assignee:
                meta_bits.append(f"assignee={item.escalation_assignee}")
            if item.escalation_reason:
                meta_bits.append(f"reason={item.escalation_reason}")
        if status == VerificationStatus.HUMAN_OVERRIDE.value and item.human_override_reason_code:
            meta_bits.append(f"reason_code={item.human_override_reason_code}")
        if item.weak_evidence:
            meta_bits.append("weak_evidence=true")
        citations = item.verified_citations or []
        if citations:
            cit = citations[0]
            doc_label = cit.get("document_filename") or "source"
            loc = cit.get("locator") or {}
            if loc.get("source_type") == "pdf":
                meta_bits.append(f"locator={doc_label}:p{loc.get('page')}")
            elif loc.get("source_type") == "json":
                meta_bits.append(f"locator={doc_label}:{loc.get('json_path')}")
            elif loc.get("source_type") == "xlsx":
                meta_bits.append(f"locator={doc_label}:{loc.get('sheet')}!{loc.get('col_range')}")
            elif loc.get("source_type") == "text":
                meta_bits.append(f"locator={doc_label}:p{loc.get('page')}L{loc.get('line_start')}")
            if cit.get("region_match_score") is not None:
                meta_bits.append(f"region_match={cit['region_match_score']}%")
        suffix = f" ({'; '.join(meta_bits)})" if meta_bits else ""
        markdown_lines.append(
            f"- **{tier}** [{status}] · {item.category}: {item.prompt_or_question} — {item.fluent_output}{suffix}"
        )

    return {
        "workspace_id": workspace_id or (documents[0].workspace_id if documents else None),
        "document_id": document_id,
        "only_critical": only_critical,
        "latest_only": latest_only,
        "total_work_items": total,
        "verified_count": verified_count,
        "human_override_count": human_override_count,
        "unresolved_count": unresolved_count,
        "escalated_legal_count": escalated_legal_count,
        "not_applicable_count": not_applicable_count,
        "critical_count": critical_count,
        "critical_open_count": critical_open_count,
        "high_open_count": high_open_count,
        "weak_evidence_count": weak_evidence_count,
        "defensibility_score": defensibility_score,
        "summary_text": summary_text,
        "markdown": "\n".join(markdown_lines) + "\n",
        "key_findings": key_findings,
        "arbiter_resolutions": arbiter,
    }
