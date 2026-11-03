"""Hard anti-hallucination gate for quotes and critical entity confidence."""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from typing import Any

from rapidfuzz import fuzz

from bert.models.documents import PriorityTier, VerificationStatus

CITATION_THRESHOLD: float = 97.0
LOGPROB_THRESHOLD: float = 0.92
CRITICAL_ENTITY_TYPES: frozenset[str] = frozenset(
    {"DATE", "AMOUNT", "PARTY_NAME", "JURISDICTION", "LIABILITY_CAP"}
)
INSUFFICIENT_EVIDENCE_OUTPUT: str = "Insufficient evidence in uploaded corpus — flagged for manual review."


@dataclass(frozen=True, slots=True)
class VerificationResult:
    passed: bool
    verification_status: VerificationStatus
    failed_citations: list[dict[str, Any]]
    failed_logprobs: list[dict[str, Any]]
    confidence_score: float
    best_citation_score: float
    best_logprob: float
    priority_tier: PriorityTier
    fluent_output: str | None


def verify_citations(
    claimed_quotes: list[str], source_texts: list[str], *, threshold: float = CITATION_THRESHOLD
) -> tuple[bool, list[dict[str, Any]]]:
    """Compare every quote to the best source using the required partial ratio."""
    failed: list[dict[str, Any]] = []
    for quote in claimed_quotes:
        normalized_quote = _normalize_whitespace(quote)
        if not normalized_quote:
            failed.append({"claimed_quote": quote, "best_score": 0.0, "threshold": threshold})
            continue
        scores = [
            (float(fuzz.partial_ratio(normalized_quote, _normalize_whitespace(source))), source)
            for source in source_texts
        ]
        best_score, best_match = max(scores, default=(0.0, ""), key=lambda item: item[0])
        if best_score < threshold:
            failed.append(
                {
                    "claimed_quote": quote,
                    "best_score": best_score,
                    "best_match_preview": best_match[:200],
                    "threshold": threshold,
                }
            )
    return not failed, failed


def _normalize_whitespace(value: str) -> str:
    """Make line wrapping and OCR spacing deterministic without changing words."""
    return re.sub(r"\s+", " ", value).strip()


def _probability(entry: dict[str, Any]) -> float:
    if "probability" in entry:
        return float(entry["probability"])
    return math.exp(float(entry.get("logprob", -10.0)))


def verify_logprobs(
    token_logprobs: list[dict[str, Any]], *, threshold: float = LOGPROB_THRESHOLD,
    critical_entity_types: frozenset[str] = CRITICAL_ENTITY_TYPES,
) -> tuple[bool, list[dict[str, Any]]]:
    """Check probability (or natural-log probability) for critical entities."""
    failed: list[dict[str, Any]] = []
    for entry in token_logprobs:
        entity_type = str(entry.get("entity_type", ""))
        if entity_type not in critical_entity_types:
            continue
        probability = _probability(entry)
        if probability < threshold:
            failed.append(
                {
                    "token": str(entry.get("token", "")),
                    "entity_type": entity_type,
                    "probability": probability,
                    "threshold": threshold,
                }
            )
    return not failed, failed


def run_verification_gate(
    claimed_quotes: list[str], source_texts: list[str], token_logprobs: list[dict[str, Any]] | None = None
) -> VerificationResult:
    """Run both deterministic checks; a single failure blocks prose synthesis."""
    citations_passed, failed_citations = verify_citations(claimed_quotes, source_texts)
    logprob_entries = token_logprobs or []
    logprobs_passed, failed_logprobs = verify_logprobs(logprob_entries)
    citation_scores = [
        max(
            (float(fuzz.partial_ratio(_normalize_whitespace(quote), _normalize_whitespace(source))) for source in source_texts),
            default=0.0,
        )
        for quote in claimed_quotes
        if _normalize_whitespace(quote)
    ]
    probabilities = [_probability(entry) for entry in logprob_entries if str(entry.get("entity_type", "")) in CRITICAL_ENTITY_TYPES]
    passed = citations_passed and logprobs_passed
    return VerificationResult(
        passed=passed,
        verification_status=VerificationStatus.VERIFIED if passed else VerificationStatus.INSUFFICIENT_EVIDENCE,
        failed_citations=failed_citations,
        failed_logprobs=failed_logprobs,
        confidence_score=1.0 if passed else 0.0,
        best_citation_score=min(citation_scores, default=100.0),
        best_logprob=min(probabilities, default=1.0),
        priority_tier=PriorityTier.P2_MEDIUM if passed else PriorityTier.P0_CRITICAL,
        fluent_output=None if passed else INSUFFICIENT_EVIDENCE_OUTPUT,
    )


def hard_gate_fields(result: VerificationResult) -> dict[str, Any]:
    """Return the immutable hard-fail fields used by every work-item writer."""
    if result.passed:
        return {}
    return {
        "verification_status": result.verification_status,
        "priority_tier": result.priority_tier,
        "fluent_output": result.fluent_output or INSUFFICIENT_EVIDENCE_OUTPUT,
    }


def payload_hash(payload: Any) -> str:
    """Create the SHA-256 value stored for audit input/output snapshots."""
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
