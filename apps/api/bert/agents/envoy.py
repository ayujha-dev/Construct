"""Envoy synthesis guarded by an explicit verified-facts-only boundary."""

from __future__ import annotations

from bert.agents.ranger import ExtractedFact
from bert.verification.citation_gate import VerificationResult


def synthesize_verified_output(facts: list[ExtractedFact], gate: VerificationResult) -> str:
    """Synthesize only after a passed gate; raw source chunks are not accepted."""
    if not gate.passed:
        raise ValueError("Envoy requires a passed verification gate")
    if not facts:
        return "No verified facts were found in the uploaded corpus."
    statements = [f"{fact.value} [{fact.fact_type}]" for fact in facts]
    return "Verified corpus evidence indicates " + "; ".join(statements) + "."
