"""Quartermaster's prototype taxonomy classifier."""

from __future__ import annotations

from collections import Counter
from typing import Any

from bert.models.documents import ASTNode


def categorize_nodes(nodes: list[ASTNode]) -> dict[str, Any]:
    """Assign stable categories and tags from source vocabulary."""
    categories: Counter[str] = Counter()
    for node in nodes:
        text = node.verbatim_text.lower()
        category = "Security Operations"
        if "mfa" in text or "password" in text or "access" in text or "iam" in text:
            category = "Access Control"
        elif "encrypt" in text or "key" in text:
            category = "Cryptography"
        elif "retain" in text or "delete" in text:
            category = "Data Retention"
        elif "liabil" in text or "indemn" in text:
            category = "Liability & Indemnification"
        categories[category] += 1
        node_type = getattr(node.node_type, "value", node.node_type)
        node.category_tags = [category, str(node_type)]
    return {"categories": dict(categories), "tagged_nodes": len(nodes)}
