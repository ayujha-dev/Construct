"""Adversarial stress-test suite for EscalationActionRequest schema and resolution endpoint."""

from __future__ import annotations

import uuid
from typing import Any

import httpx
import pytest
from pydantic import ValidationError

from sqlalchemy import select

from bert.api.main import app, startup
from bert.api.schemas import EscalationActionRequest
from bert.models.base import SessionFactory
from bert.models.documents import AuditLog, Document, PriorityTier, VerificationStatus, WorkItem


# ==============================================================================
# Helper to Seed an Isolated WorkItem without starting asynchronous background agents
# ==============================================================================

async def _seed_one_work_item() -> tuple[str, str]:
    """Helper to insert an isolated document and work item for resolution tests."""
    doc_id = uuid.uuid4()
    item_id = uuid.uuid4()
    async with SessionFactory() as session:
        doc = Document(
            id=doc_id,
            workspace_id=uuid.uuid4(),
            filename="policy.pdf",
            source_format="pdf",
            category="Security",
            priority_tier=PriorityTier.P2_MEDIUM,
            priority_score=50,
            is_latest_version=True,
            ast_checksum="abcd1234efgh5678",
            storage_path="/tmp/test.pdf",
            file_size_bytes=1024,
            total_pages=1,
            total_ast_nodes=1,
            processing_status="completed",
        )
        session.add(doc)
        item = WorkItem(
            id=item_id,
            workspace_id=doc.workspace_id,
            batch_id=uuid.uuid4(),
            document_id=doc_id,
            item_type="QUESTIONNAIRE_ROW",
            category="Security",
            priority_tier=PriorityTier.P0_CRITICAL,
            priority_score=95,
            prompt_or_question="Does the system enforce MFA for privileged access?",
            fluent_output="Needs human verification.",
            structured_facts=[],
            verified_citations=[],
            verification_status=VerificationStatus.NEEDS_HUMAN_VERIFICATION,
            resolved_by_tier="HUMAN_IN_THE_LOOP",
        )
        session.add(item)
        await session.commit()
    return str(doc_id), str(item_id)


# ==============================================================================
# 1. Pydantic Model Unit Validation Tests
# ==============================================================================

@pytest.mark.parametrize("action", ["manual_correction", "retry", "skip", "approve", "counsel", "undo"])
def test_schema_accepts_all_valid_actions(action: str) -> None:
    """Verify that all 6 specified escalation actions instantiate cleanly without ValidationError."""
    req = EscalationActionRequest(action=action)  # type: ignore[arg-type]
    assert req.action == action
    assert req.note is None
    assert req.correction is None
    assert req.manual_payload is None
    assert req.assignee is None
    assert req.actor is None
    assert req.reason_code is None


@pytest.mark.parametrize(
    "payload",
    [
        {"action": "approve", "note": "Approved by senior compliance officer", "manual_payload": {"approver_id": "usr_99"}},
        {"action": "counsel", "note": "Referred to outside legal counsel", "manual_payload": {"matter": "IP-2026", "firm": "Baker"}},
        {"action": "skip", "note": "Section non-binding preamble"},
        {"action": "retry", "note": "Rerun with higher OCR DPI"},
        {"action": "manual_correction", "correction": "Corrected policy excerpt", "note": "Fixed typo", "manual_payload": {"char_offset": 42}},
        {
            "action": "approve",
            "note": "X" * 10000,  # Stress test: 10KB string
            "correction": "Y" * 10000,
            "manual_payload": {"deep": {"nested": {"array": [1, 2, 3, {"k": "v"}]}}},
        },
        {"action": "skip", "note": "", "correction": "", "manual_payload": {}},
    ],
)
def test_schema_valid_optional_fields_permutations(payload: dict[str, Any]) -> None:
    """Verify various field permutations and payload shapes are parsed correctly."""
    req = EscalationActionRequest.model_validate(payload)
    assert req.action == payload["action"]
    if "note" in payload:
        assert req.note == payload["note"]
    if "correction" in payload:
        assert req.correction == payload["correction"]
    if "manual_payload" in payload:
        assert req.manual_payload == payload["manual_payload"]


@pytest.mark.parametrize(
    "invalid_action",
    [
        "reject",
        "deny",
        "auto",
        "APPROVE",
        "Approve",
        "COUNSEL",
        "Counsel",
        "RETRY",
        "SKIP",
        "MANUAL_CORRECTION",
        "manual-correction",
        "",
        " ",
        "unknown_action",
        123,
        True,
        False,
        None,
    ],
)
def test_schema_rejects_invalid_actions(invalid_action: Any) -> None:
    """Adversarially assert that unauthorized action strings and non-string types raise ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        EscalationActionRequest.model_validate({"action": invalid_action})
    errors = exc_info.value.errors()
    assert any(err["loc"] == ("action",) for err in errors), f"Expected validation error on 'action', got {errors}"


def test_schema_rejects_missing_action() -> None:
    """Assert that payload omitting 'action' raises ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        EscalationActionRequest.model_validate({"note": "No action provided"})
    errors = exc_info.value.errors()
    assert any(err["loc"] == ("action",) for err in errors)


@pytest.mark.parametrize(
    "invalid_payload",
    [
        {"action": "approve", "manual_payload": "not-a-dict"},
        {"action": "approve", "manual_payload": [1, 2, 3]},
        {"action": "approve", "manual_payload": 12345},
    ],
)
def test_schema_rejects_invalid_manual_payload_type(invalid_payload: dict[str, Any]) -> None:
    """Assert that manual_payload must be a dict when present."""
    with pytest.raises(ValidationError) as exc_info:
        EscalationActionRequest.model_validate(invalid_payload)
    errors = exc_info.value.errors()
    assert any(err["loc"] == ("manual_payload",) for err in errors)


# ==============================================================================
# 2. Live HTTP Endpoint Integration Tests
# ==============================================================================

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "action_payload, expected_status",
    [
        (
            {"action": "approve", "note": "Approved after review", "manual_payload": {"officer": "compliance"}},
            "VERIFIED",
        ),
        (
            {
                "action": "counsel",
                "note": "Referral to external legal counsel",
                "assignee": "Jane Doe, General Counsel",
                "actor": "Alice Reviewer",
                "reason_code": "UNCAPPED_INDEMNITY",
                "manual_payload": {"firm": "Cooley"},
            },
            "ESCALATED_LEGAL",
        ),
        (
            {"action": "skip", "note": "Non-applicable finding"},
            "VERIFIED",
        ),
        (
            {"action": "retry", "note": "Re-run deep vision crop"},
            "NEEDS_HUMAN_VERIFICATION",
        ),
        (
            {"action": "manual_correction", "correction": "Audit logs are retained for 365 days in WORM storage."},
            "VERIFIED",
        ),
    ],
)
async def test_endpoint_resolves_all_five_actions_without_422(
    action_payload: dict[str, Any],
    expected_status: str,
) -> None:
    """Verify that all 5 resolution actions update status and audit fields accurately."""
    await startup()
    _, work_item_id = await _seed_one_work_item()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/escalations/{work_item_id}/resolve",
            json=action_payload,
        )

        assert resp.status_code == 200, f"Expected 200 for action {action_payload}, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["id"] == work_item_id
        assert data["verification_status"] == expected_status
        assert data["can_undo"] is True

        if action_payload["action"] == "counsel":
            # Critical requirement: Flag for Legal preserves original priority_tier & score.
            assert data["priority_tier"] == "P0_CRITICAL"
            assert data["priority_score"] == 95
            assert data["original_priority_tier"] == "P0_CRITICAL"
            assert data["escalation_assignee"] == "Jane Doe, General Counsel"
            assert data["escalated_by"] == "Alice Reviewer"
            assert "UNCAPPED_INDEMNITY" in (data["escalation_reason"] or "")
            assert data["escalated_at"] is not None

            # ESCALATED_LEGAL stays visible in the unresolved escalations queue.
            queue_resp = await client.get("/api/v1/escalations")
            assert queue_resp.status_code == 200
            queued = [row for row in queue_resp.json() if row["work_item_id"] == work_item_id]
            assert len(queued) == 1
            assert queued[0]["verification_status"] == "ESCALATED_LEGAL"
            assert queued[0]["can_undo"] is True

        if action_payload["action"] == "approve":
            assert data["fluent_output"] != "Marked not applicable by reviewer."


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_payload",
    [
        {"action": "reject"},
        {"action": "deny"},
        {"action": "APPROVE"},
        {"action": "Counsel"},
        {"action": ""},
        {"action": 999},
        {"action": False},
        {"note": "Missing action field entirely"},
        {"action": "manual_correction", "correction": ""},  # empty correction should 422
        {"action": "manual_correction", "correction": "   "},  # whitespace correction should 422
        {"action": "manual_correction"},  # missing correction should 422
        {"action": "approve", "manual_payload": "string_not_dict"},
    ],
)
async def test_endpoint_rejects_invalid_payloads_with_422(bad_payload: dict[str, Any]) -> None:
    """Adversarially assert that improper actions, types, or missing mandatory corrections return HTTP 422."""
    await startup()
    _, work_item_id = await _seed_one_work_item()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/escalations/{work_item_id}/resolve",
            json=bad_payload,
        )

        assert resp.status_code == 422, f"Expected 422 for payload {bad_payload}, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_counsel_escalation_and_undo_round_trip() -> None:
    """Verify Flag for Legal sets ESCALATED_LEGAL, logs AuditLog with who/when/reason/assignee, and undoes cleanly."""
    await startup()
    _, work_item_id = await _seed_one_work_item()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Cannot undo before any resolution has occurred.
        no_undo = await client.post(f"/api/v1/work-items/{work_item_id}/undo", json={"actor": "Alice"})
        assert no_undo.status_code == 409

        escalate_resp = await client.post(
            f"/api/v1/escalations/{work_item_id}/resolve",
            json={
                "action": "counsel",
                "assignee": "Morgan Lee, AGC",
                "actor": "Bob Compliance",
                "reason_code": "STATUTORY_AMBIGUITY",
                "note": "Need counsel opinion on GDPR retention carve-out",
            },
        )
        assert escalate_resp.status_code == 200
        escalated = escalate_resp.json()
        assert escalated["verification_status"] == "ESCALATED_LEGAL"
        assert escalated["priority_tier"] == "P0_CRITICAL"
        assert escalated["priority_score"] == 95
        assert escalated["original_priority_tier"] == "P0_CRITICAL"
        assert escalated["escalation_assignee"] == "Morgan Lee, AGC"
        assert escalated["escalated_by"] == "Bob Compliance"
        assert "STATUTORY_AMBIGUITY" in escalated["escalation_reason"]
        assert "GDPR retention carve-out" in escalated["escalation_reason"]
        assert escalated["can_undo"] is True

        # Undo via POST /api/v1/work-items/{id}/undo
        undo_resp = await client.post(
            f"/api/v1/work-items/{work_item_id}/undo",
            json={"actor": "Bob Compliance", "note": "Reverting accidental legal flag"},
        )
        assert undo_resp.status_code == 200
        restored = undo_resp.json()
        assert restored["verification_status"] == "NEEDS_HUMAN_VERIFICATION"
        assert restored["priority_tier"] == "P0_CRITICAL"
        assert restored["priority_score"] == 95
        assert restored["fluent_output"] == "Needs human verification."
        assert restored["escalation_assignee"] is None
        assert restored["escalation_reason"] is None
        assert restored["can_undo"] is False

        # Re-escalate and undo via /resolve action="undo"
        re_escalate = await client.post(
            f"/api/v1/escalations/{work_item_id}/resolve",
            json={"action": "counsel", "assignee": "Legal Team", "actor": "Bob"},
        )
        assert re_escalate.status_code == 200
        assert re_escalate.json()["verification_status"] == "ESCALATED_LEGAL"

        resolve_undo = await client.post(
            f"/api/v1/escalations/{work_item_id}/resolve",
            json={"action": "undo", "actor": "Bob"},
        )
        assert resolve_undo.status_code == 200
        assert resolve_undo.json()["verification_status"] == "NEEDS_HUMAN_VERIFICATION"
        assert resolve_undo.json()["can_undo"] is False

    async with SessionFactory() as session:
        logs = list(
            (await session.execute(select(AuditLog).where(AuditLog.agent_name == "Human Review").order_by(AuditLog.id)))
            .scalars()
            .all()
        )
    actions = [log.action for log in logs]
    assert "ESCALATION_COUNSEL" in actions
    assert "ESCALATION_UNDO" in actions
    counsel_log = next(log for log in logs if log.action == "ESCALATION_COUNSEL")
    assert counsel_log.metadata_json["actor"] == "Bob Compliance"
    assert counsel_log.metadata_json["assignee"] == "Morgan Lee, AGC"
    assert counsel_log.metadata_json["when"]
    assert counsel_log.metadata_json["reason"]
