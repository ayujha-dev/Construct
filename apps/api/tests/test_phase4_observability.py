"""Phase 4 pipeline observability, telemetry contract, progressive WS, and pause/failure tests."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

import httpx
import pytest

import bert.agents.pipeline as pipeline_module
from bert.api.main import app, manager, startup
from bert.main import job_controller


async def _wait_for_terminal_job(client: httpx.AsyncClient, job_id: str) -> dict[str, Any]:
    for _ in range(150):
        resp = await client.get(f"/api/v1/jobs/{job_id}")
        assert resp.status_code == 200
        payload = resp.json()
        if payload["status"] in {"COMPLETED", "FAILED", "CANCELLED"}:
            return payload
        await asyncio.sleep(0.08)
    raise AssertionError(f"Job {job_id} did not reach a terminal status in time")


def _assert_no_raw_dict_repr(text: str | None) -> None:
    assert text is not None and text.strip()
    assert "({" not in text, f"Found raw dict repr in message/summary: {text}"
    assert "': " not in text, f"Found Python dict repr in message/summary: {text}"


@pytest.mark.asyncio
async def test_phase4_demo_job_telemetry_contract_progressive_work_items_and_reload_persistence() -> None:
    await startup()
    events: list[dict[str, Any]] = []

    async def collect(event: dict[str, Any]) -> None:
        events.append(event)

    manager.sink.add(collect)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            started = await client.post("/api/v1/jobs/demo")
            assert started.status_code == 200
            job_id = started.json()["job_id"]

            # Initial snapshot should expose 7 pending steps in step_telemetry.
            initial_telemetry = started.json()["step_telemetry"]
            assert len(initial_telemetry) == 7
            assert [s["agent_name"] for s in initial_telemetry] == [
                "Scout",
                "Quartermaster",
                "Chronos",
                "Vanguard",
                "Ranger",
                "Arbiter",
                "Envoy",
            ]

            final_job = await _wait_for_terminal_job(client, job_id)
            assert final_job["status"] == "COMPLETED"

            work_items = (await client.get("/api/v1/work-items")).json()
            assert len(work_items) == 13
            actual_p0 = sum(1 for item in work_items if item["priority_tier"] == "P0_CRITICAL")
            actual_p1 = sum(1 for item in work_items if item["priority_tier"] == "P1_HIGH")

            # Simulate page reload / backend process state eviction -> must hydrate from SQLite.
            job_controller._states.clear()
            reloaded = (await client.get(f"/api/v1/jobs/{job_id}")).json()
    finally:
        manager.sink.remove(collect)

    transitions = [e for e in events if e.get("type") == "agent_transition"]
    running_events = [e for e in transitions if e.get("status") == "running"]
    completed_events = [e for e in transitions if e.get("status") == "completed"]
    assert len(running_events) == 7
    assert len(completed_events) == 7
    assert [e["agent_name"] for e in completed_events] == [
        "Scout",
        "Quartermaster",
        "Chronos",
        "Vanguard",
        "Ranger",
        "Arbiter",
        "Envoy",
    ]

    for event in transitions:
        assert event["status"] in {"running", "completed"}
        assert event["job_id"] == job_id
        assert event["run_id"] == job_id
        assert isinstance(event["current_agent_index"], int)
        assert 0 <= event["current_agent_index"] <= 6
        assert event["job_status"] in {"RUNNING", "PAUSED", "FAILED", "COMPLETED"}
        datetime.fromisoformat(str(event["started_at"]))
        _assert_no_raw_dict_repr(event.get("summary"))
        _assert_no_raw_dict_repr(event.get("message"))
        assert isinstance(event.get("details"), dict)
        assert "node_index" not in event
        assert event.get("current_node_index") is None

        if event["status"] == "running":
            assert event["completed_at"] is None
            assert event["latency_ms"] == 0
        else:
            datetime.fromisoformat(str(event["completed_at"]))
            assert isinstance(event["latency_ms"], int)
            assert event["latency_ms"] >= 1

    by_agent = {e["agent_name"]: e for e in completed_events}
    assert "scanned" in by_agent["Scout"]["summary"]
    assert "low-confidence" in by_agent["Scout"]["summary"]
    assert "nodes tagged across" in by_agent["Quartermaster"]["summary"]
    assert "4 documents" in by_agent["Quartermaster"]["summary"]
    assert "4 docs sequenced" in by_agent["Chronos"]["summary"]
    assert "1 supersession conflict" in by_agent["Chronos"]["summary"]
    assert f"{actual_p0} critical (P0)" in by_agent["Vanguard"]["summary"]
    assert f"{actual_p1} high (P1)" in by_agent["Vanguard"]["summary"]
    assert by_agent["Vanguard"]["details"]["p0_count"] == actual_p0
    assert by_agent["Vanguard"]["details"]["p1_count"] == actual_p1
    assert "findings extracted" in by_agent["Ranger"]["summary"]
    assert "verified >=97%" in by_agent["Ranger"]["summary"]
    assert "temporal contradiction resolved" in by_agent["Arbiter"]["summary"]
    assert "supersedes" in by_agent["Arbiter"]["summary"]
    assert "Executive synthesis generated" in by_agent["Envoy"]["summary"]
    assert "defensibility" in by_agent["Envoy"]["summary"]

    # Progressive work_item WS events must be emitted before Envoy & JOB_COMPLETED.
    event_types_with_idx = list(enumerate(events))
    work_item_indices = [idx for idx, e in event_types_with_idx if e.get("type") == "work_item"]
    envoy_completed_idx = next(
        idx
        for idx, e in event_types_with_idx
        if e.get("type") == "agent_transition" and e.get("agent_name") == "Envoy" and e.get("status") == "completed"
    )
    job_completed_idx = next(idx for idx, e in event_types_with_idx if e.get("type") == "JOB_COMPLETED")
    assert len(work_item_indices) == 13
    assert all(idx < envoy_completed_idx < job_completed_idx for idx in work_item_indices)

    # Verify step_telemetry persisted on JobExecution and surviving cache eviction.
    for snapshot in (final_job, reloaded):
        steps = snapshot["step_telemetry"]
        assert snapshot["completed_step_outputs"]["step_telemetry"] == steps
        assert len(steps) == 7
        for idx, step in enumerate(steps):
            assert step["index"] == idx
            assert step["status"] == "done"
            assert step["latency_ms"] >= 1
            assert step["run_id"] == job_id
            _assert_no_raw_dict_repr(step["summary"])
            assert isinstance(step["details"], dict)


@pytest.mark.asyncio
async def test_phase4_single_document_upload_observability_and_vanguard_parity() -> None:
    await startup()
    events: list[dict[str, Any]] = []

    async def collect(event: dict[str, Any]) -> None:
        events.append(event)

    manager.sink.add(collect)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            uploaded = await client.post(
                "/api/v1/documents/upload",
                files={
                    "file": (
                        "policy.txt",
                        b"Access control requires multifactor authentication for privileged accounts.\n[LOW_CONFIDENCE] stamp obscures date.",
                        "text/plain",
                    )
                },
            )
            assert uploaded.status_code == 200
            doc = uploaded.json()

            started = await client.post("/api/v1/jobs/start", json={"document_id": doc["id"]})
            assert started.status_code == 200
            job_id = started.json()["job_id"]

            final_job = await _wait_for_terminal_job(client, job_id)
            assert final_job["status"] == "COMPLETED"
            items = (await client.get(f"/api/v1/work-items?document_id={doc['id']}")).json()
            assert len(items) == 2
            actual_p0 = sum(1 for i in items if i["priority_tier"] == "P0_CRITICAL")
            actual_p1 = sum(1 for i in items if i["priority_tier"] == "P1_HIGH")
    finally:
        manager.sink.remove(collect)

    completed = [e for e in events if e.get("type") == "agent_transition" and e.get("status") == "completed"]
    assert len(completed) == 7
    for event in completed:
        assert event["document_id"] == doc["id"]
        assert event["document_filename"] == "policy.txt"
        assert "node_index" not in event

    vanguard = next(e for e in completed if e["agent_name"] == "Vanguard")
    assert vanguard["details"]["p0_count"] == actual_p0
    assert vanguard["details"]["p1_count"] == actual_p1

    work_item_indices = [idx for idx, e in enumerate(events) if e.get("type") == "work_item"]
    job_completed_idx = next(idx for idx, e in enumerate(events) if e.get("type") == "JOB_COMPLETED")
    assert len(work_item_indices) == 2
    assert all(idx < job_completed_idx for idx in work_item_indices)


@pytest.mark.asyncio
async def test_phase4_pause_resume_preserves_checkpoint_and_step_telemetry() -> None:
    await startup()
    events: list[dict[str, Any]] = []

    async def collect(event: dict[str, Any]) -> None:
        events.append(event)

    manager.sink.add(collect)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            started = await client.post("/api/v1/jobs/demo")
            assert started.status_code == 200
            job_id = started.json()["job_id"]

            await asyncio.sleep(0.08)
            paused_resp = await client.post(f"/api/v1/jobs/{job_id}/pause")
            assert paused_resp.status_code == 200

            # Wait until JOB_PAUSED arrives before checking paused snapshot.
            for _ in range(100):
                if any(e.get("type") == "JOB_PAUSED" for e in events):
                    break
                await asyncio.sleep(0.02)
            assert any(e.get("type") == "JOB_PAUSED" for e in events)

            paused_snapshot = (await client.get(f"/api/v1/jobs/{job_id}")).json()
            assert paused_snapshot["status"] == "PAUSED"
            assert any(s["status"] == "done" for s in paused_snapshot["step_telemetry"])
            assert any(s["status"] == "pending" for s in paused_snapshot["step_telemetry"])

            resumed_resp = await client.post(
                f"/api/v1/jobs/{job_id}/resume",
                json={"instruction": "Prioritize access control findings."},
            )
            assert resumed_resp.status_code == 200

            final_job = await _wait_for_terminal_job(client, job_id)
            assert final_job["status"] == "COMPLETED"
            assert final_job["user_override_instructions"] == ["Prioritize access control findings."]
    finally:
        manager.sink.remove(collect)

    lifecycle_types = [
        e.get("type")
        for e in events
        if e.get("type") in {"JOB_PAUSING", "JOB_PAUSED", "JOB_RESUMING", "JOB_RESUMED", "JOB_COMPLETED"}
    ]
    assert lifecycle_types == ["JOB_PAUSING", "JOB_PAUSED", "JOB_RESUMING", "JOB_RESUMED", "JOB_COMPLETED"]
    resumed_event = next(e for e in events if e.get("type") == "JOB_RESUMED")
    assert resumed_event["status"] == "RUNNING"
    assert all(step["status"] == "done" for step in final_job["step_telemetry"])


@pytest.mark.asyncio
async def test_phase4_failure_emits_agent_transition_failed_and_job_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    await startup()
    events: list[dict[str, Any]] = []

    async def collect(event: dict[str, Any]) -> None:
        events.append(event)

    def boom(_documents: Any) -> dict[str, Any]:
        raise RuntimeError("Simulated Arbiter failure")

    monkeypatch.setattr(pipeline_module, "resolve_conflicts", boom)

    manager.sink.add(collect)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            started = await client.post("/api/v1/jobs/demo")
            assert started.status_code == 200
            job_id = started.json()["job_id"]

            final_job = await _wait_for_terminal_job(client, job_id)
            assert final_job["status"] == "FAILED"
            assert final_job["error_message"] == "Simulated Arbiter failure"
    finally:
        manager.sink.remove(collect)

    failed_transitions = [
        e for e in events if e.get("type") == "agent_transition" and e.get("status") == "failed"
    ]
    assert len(failed_transitions) == 1
    arbiter_fail = failed_transitions[0]
    assert arbiter_fail["agent_name"] == "Arbiter"
    assert arbiter_fail["job_id"] == job_id
    assert arbiter_fail["current_agent_index"] == 5
    assert arbiter_fail["job_status"] == "FAILED"
    assert arbiter_fail["latency_ms"] >= 1
    assert "Arbiter failed" in arbiter_fail["summary"]
    assert arbiter_fail["details"]["error"] == "Simulated Arbiter failure"
    assert "node_index" not in arbiter_fail

    job_failed_events = [e for e in events if e.get("type") == "JOB_FAILED"]
    assert len(job_failed_events) == 1
    assert job_failed_events[0]["message"] == "Simulated Arbiter failure"

    steps_by_name = {s["agent_name"]: s for s in final_job["step_telemetry"]}
    for name in ("Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger"):
        assert steps_by_name[name]["status"] == "done"
    assert steps_by_name["Arbiter"]["status"] == "failed"
    assert steps_by_name["Envoy"]["status"] == "pending"
