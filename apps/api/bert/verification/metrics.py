"""Canonical work-item metrics, mutually exclusive buckets, and defensibility scoring."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any


def _enum_str(value: Any) -> str:
    return str(getattr(value, "value", value))


def _attr(item: Any, key: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def compute_work_item_metrics(items: Iterable[Any]) -> dict[str, Any]:
    """Compute mutually exclusive work-item buckets and defensibility score.

    Buckets sum strictly to ``total``:
        ``machine_verified + human_override + escalated_legal + not_applicable + unresolved == total``

    ``defensibility_score`` counts machine-verified items only (``VERIFIED``):
        - ``None`` when ``total == 0``
        - ``round(machine_verified / total * 100)`` when ``total > 0``
        - Capped ``<= 99`` whenever any ``P0_CRITICAL`` or ``P1_HIGH`` item is not ``VERIFIED``.
    """
    item_list = list(items)
    total = len(item_list)
    machine_verified = 0
    human_override = 0
    escalated_legal = 0
    not_applicable = 0
    unresolved = 0

    critical_total = 0
    critical_open = 0
    high_open = 0
    weak_evidence_count = 0
    has_unverified_p0_or_p1 = False

    for item in item_list:
        status = _enum_str(_attr(item, "verification_status", ""))
        tier = _enum_str(_attr(item, "priority_tier", ""))
        is_weak = bool(_attr(item, "weak_evidence", False))

        if is_weak:
            weak_evidence_count += 1

        if status == "VERIFIED":
            machine_verified += 1
        elif status == "HUMAN_OVERRIDE":
            human_override += 1
        elif status == "ESCALATED_LEGAL":
            escalated_legal += 1
        elif status == "NOT_APPLICABLE":
            not_applicable += 1
        else:
            unresolved += 1

        is_open = status not in {"VERIFIED", "HUMAN_OVERRIDE", "NOT_APPLICABLE"}
        if tier == "P0_CRITICAL":
            critical_total += 1
            if is_open:
                critical_open += 1
            if status != "VERIFIED":
                has_unverified_p0_or_p1 = True
        elif tier == "P1_HIGH":
            if is_open:
                high_open += 1
            if status != "VERIFIED":
                has_unverified_p0_or_p1 = True

    needs_triage = unresolved + escalated_legal

    if total == 0:
        defensibility_score: int | None = None
    else:
        raw_score = int(round((machine_verified / total) * 100))
        if has_unverified_p0_or_p1 and raw_score >= 100:
            raw_score = 99
        defensibility_score = raw_score

    return {
        "total": total,
        "machine_verified": machine_verified,
        "human_override": human_override,
        "escalated_legal": escalated_legal,
        "not_applicable": not_applicable,
        "unresolved": unresolved,
        "critical_total": critical_total,
        "critical_open": critical_open,
        "high_open": high_open,
        "needs_triage": needs_triage,
        "weak_evidence_count": weak_evidence_count,
        "defensibility_score": defensibility_score,
        "export_warnings": {
            "has_unresolved": unresolved > 0,
            "has_escalated": escalated_legal > 0,
            "has_overrides": human_override > 0,
            "has_not_applicable": not_applicable > 0,
            "has_weak_evidence": weak_evidence_count > 0,
        },
    }
