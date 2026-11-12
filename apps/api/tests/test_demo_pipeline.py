from __future__ import annotations

import asyncio
import pytest
import httpx
from sqlalchemy import select

from bert.api.main import app, manager, startup
from bert.models.base import SessionFactory
from bert.models.documents import AuditLog, WorkItem


@pytest.mark.asyncio
async def test_demo_seed_runs_all_agents_and_persists_prioritized_items() -> None:
    await startup()
    events: list[dict[str, object]] = []

    async def collect(event: dict[str, object]) -> None:
        events.append(event)

    manager.sink.add(collect)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/demo/seed")
    manager.sink.remove(collect)
    assert response.status_code == 200
    payload = response.json()
    assert payload["document_count"] == 4
    assert payload["work_item_count"] == 13
    async with SessionFactory() as session:
        audit_rows = list((await session.execute(select(AuditLog))).scalars().all())
        items = list((await session.execute(select(WorkItem))).scalars().all())
    agent_names = {row.agent_name for row in audit_rows}
    assert {"Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger", "Arbiter", "Envoy", "Citation Gate"} <= agent_names
    assert len(items) == 13
    assert any(item.priority_tier == "P0_CRITICAL" for item in items)
    assert any(item.category == "Access Control" for item in items)
    assert any(item.verification_status == "INSUFFICIENT_EVIDENCE" for item in items)
    assert all(len(row.input_hash) == 64 and len(row.output_hash) == 64 for row in audit_rows)

    temporal_items = [item for item in items if item.item_type == "TEMPORAL_CONFLICT"]
    assert len(temporal_items) == 1
    tc = temporal_items[0]
    assert tc.category == "Temporal Governance"
    assert tc.priority_tier == "P1_HIGH"
    assert tc.verification_status == "VERIFIED"
    assert len(tc.verified_citations or []) == 2
    assert {cit["document_filename"] for cit in (tc.verified_citations or [])} == {
        "SOC2_Type_II_2026.pdf",
        "Legacy_InfoSec_Policy_2023.pdf",
    }
    assert tc.temporal_conflict is not None
    assert tc.temporal_conflict["newer_filename"] == "SOC2_Type_II_2026.pdf"
    assert tc.temporal_conflict["older_filename"] == "Legacy_InfoSec_Policy_2023.pdf"

    # Q5 / Q7 / Q8 must NOT silently fall back to "SOC 2 Type II 2026" header node.
    for unmatched_fragment in ("effective date", "data retention", "liability and indemnification"):
        matched = [item for item in items if unmatched_fragment in item.prompt_or_question.lower()]
        assert len(matched) == 1
        assert matched[0].verification_status == "INSUFFICIENT_EVIDENCE"
        assert matched[0].evidence_quality == "missing"
        assert matched[0].verified_citations == []


@pytest.mark.asyncio
async def test_demo_job_checkpoint_interrupts_and_resumes_with_instruction() -> None:
    await startup()
    events: list[dict[str, object]] = []

    async def collect(event: dict[str, object]) -> None:
        events.append(event)

    manager.sink.add(collect)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        started = await client.post("/api/v1/jobs/demo")
        job_id = started.json()["job_id"]
        await asyncio.sleep(0.08)
        paused = await client.post(f"/api/v1/jobs/{job_id}/interrupt")
        resumed = await client.post(
            f"/api/v1/jobs/{job_id}/resume",
            json={"user_instruction": "Prioritize termination penalties first."},
        )
        assert paused.status_code == 200
        assert resumed.status_code == 200
        for _ in range(100):
            current = (await client.get(f"/api/v1/jobs/{job_id}")).json()
            if current["status"] in {"COMPLETED", "FAILED"}:
                break
            await asyncio.sleep(0.1)
    manager.sink.remove(collect)
    assert current["status"] == "COMPLETED"
    assert current["user_override_instructions"] == ["Prioritize termination penalties first."]
    paused_events = [event for event in events if event.get("type") == "JOB_PAUSED"]
    assert paused_events
    assert paused_events[0].get("paused_at_agent") in {"Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger", "Arbiter", "Envoy"}
