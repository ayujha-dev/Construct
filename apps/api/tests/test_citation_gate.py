from __future__ import annotations

from bert.models.documents import PriorityTier, VerificationStatus
from bert.verification.citation_gate import run_verification_gate, verify_citations, verify_logprobs


def test_exact_quote_passes_the_97_percent_gate() -> None:
    source = "Access control requires multifactor authentication for privileged accounts."
    passed, failed = verify_citations([source], [source])
    assert passed is True
    assert failed == []


def test_whitespace_wrapping_is_normalized_before_matching() -> None:
    passed, failed = verify_citations(
        ["Access control requires\nmultifactor authentication for privileged accounts."],
        ["Access control requires multifactor authentication for privileged accounts."],
    )
    assert passed is True
    assert failed == []


def test_fabricated_quote_is_hard_failed() -> None:
    source = "Access control requires multifactor authentication for privileged accounts."
    result = run_verification_gate(["Access control permits password-only access for privileged accounts."], [source])
    assert result.passed is False
    assert result.verification_status is VerificationStatus.INSUFFICIENT_EVIDENCE
    assert result.failed_citations


def test_low_critical_entity_probability_fails() -> None:
    passed, failed = verify_logprobs([{"token": "2026", "entity_type": "DATE", "probability": 0.91}])
    assert passed is False
    assert failed[0]["probability"] == 0.91


def test_hard_gate_has_p0_insufficient_evidence_fields() -> None:
    result = run_verification_gate(
        ["invented quote"],
        ["source text"],
        [{"token": "$9", "entity_type": "AMOUNT", "probability": 0.5}],
    )
    assert result.verification_status is VerificationStatus.INSUFFICIENT_EVIDENCE
    assert PriorityTier.P0_CRITICAL.value == "P0_CRITICAL"
