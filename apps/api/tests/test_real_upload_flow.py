from __future__ import annotations

import asyncio

import httpx

from bert.api.main import app, manager, startup


async def _wait_for_job(client: httpx.AsyncClient, job_id: str) -> dict[str, object]:
    for _ in range(100):
        state = (await client.get(f"/api/v1/jobs/{job_id}")).json()
        if state["status"] in {"COMPLETED", "FAILED"}:
            return state
        await asyncio.sleep(0.1)
    raise AssertionError("job did not finish")


async def test_real_text_upload_runs_ast_regiment_and_citation_stream() -> None:
    await startup()
    events: list[dict[str, object]] = []

    async def collect(event: dict[str, object]) -> None:
        events.append(event)

    manager.sink.add(collect)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            uploaded = await client.post(
                "/api/v1/documents/upload",
                files={"file": ("security.txt", b"MFA is required for privileged accounts.\n[LOW_CONFIDENCE] stamp obscures date.", "text/plain")},
            )
            assert uploaded.status_code == 200
            document = uploaded.json()
            assert len(document["ast_checksum"]) == 64
            nodes = await client.get(f"/api/v1/documents/{document['id']}/nodes")
            assert nodes.status_code == 200
            assert len(nodes.json()) == 2

            started = await client.post("/api/v1/jobs/start", json={"document_id": document["id"]})
            assert started.status_code == 200
            state = await _wait_for_job(client, started.json()["job_id"])
            assert state["status"] == "COMPLETED"
            items = (await client.get("/api/v1/work-items")).json()
            assert any(item["verification_status"] == "INSUFFICIENT_EVIDENCE" for item in items)
    finally:
        manager.sink.remove(collect)

    completed_agents = {event.get("agent_name") for event in events if event.get("type") == "agent_transition" and event.get("status") == "completed"}
    assert completed_agents == {"Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger", "Arbiter", "Envoy"}
