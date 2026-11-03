"""Vanguard's deterministic risk scoring for AST nodes."""

from __future__ import annotations

from collections.abc import Iterable

from bert.models.documents import ASTNode, PriorityTier


def score_node(node: ASTNode) -> tuple[int, PriorityTier]:
    """Score wildcard permissions and low-confidence evidence as critical signals."""
    text = node.verbatim_text.lower()
    score = 50
    if "s3:*" in text or "wildcard" in text:
        score = 96
    elif node.ocr_confidence < 0.90:
        score = 88
    elif "mfa" in text or "encrypt" in text:
        score = 70
    tier = PriorityTier.P0_CRITICAL if score >= 85 else PriorityTier.P1_HIGH if score >= 65 else PriorityTier.P2_MEDIUM
    node.priority_score = score
    return score, tier


def score_nodes(nodes: Iterable[ASTNode]) -> dict[str, int]:
    """Score all nodes and return the count of critical findings."""
    scores = [score_node(node)[0] for node in nodes]
    return {"critical_count": sum(score >= 85 for score in scores), "max_score": max(scores, default=0)}
