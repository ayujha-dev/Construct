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
    assert payload["work_item_count"] == 12
    async with SessionFactory() as session:
        audit_rows = list((await session.execute(select(AuditLog))).scalars().all())
        items = list((await session.execute(select(WorkItem))).scalars().all())
    agent_names = {row.agent_name for row in audit_rows}
    assert {"Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger", "Arbiter", "Envoy", "Citation Gate"} <= agent_names
    assert len(items) == 12
    assert any(item.priority_tier == "P0_CRITICAL" for item in items)
    assert any(item.category == "Access Control" for item in items)
    assert any(item.verification_status == "INSUFFICIENT_EVIDENCE" for item in items)
    assert all(len(row.input_hash) == 64 and len(row.output_hash) == 64 for row in audit_rows)


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
