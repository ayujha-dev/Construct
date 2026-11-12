"""Ranger's strict atomic extraction schema; it cannot contain prose fields."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ExtractedFact(BaseModel):
    """One source-grounded fact passed to the gate and then Envoy."""

    model_config = ConfigDict(extra="forbid")
    fact_type: str = Field(min_length=1)
    value: str = Field(min_length=1)
    verbatim_quote: str = Field(min_length=1)
    ast_node_id: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    locator: dict[str, Any] | None = None
    region_match_score: float | None = None


class RangerOutput(BaseModel):
    """The only output contract Ranger may return."""

    model_config = ConfigDict(extra="forbid")
    facts: list[ExtractedFact]
    extraction_complete: bool
