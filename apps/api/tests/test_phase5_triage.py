"""Phase 5 backend HITL triage throughput tests:
1. Vision rescue vs machine-extracted text separation across pipeline + schemas.
2. Strict `approve` 422 rejection when neither `machine_extracted_text` nor `vision_rescue_text` exists,
   plus `ACCEPT_VISION_RESCUE` AuditLog recording when rescue text is adopted.
3. `POST /api/v1/escalations/batch-resolve` per-item validation, partial skips/errors, snapshot undo,
   AuditLog entries, and summary invalidation.
4. Priority-ordered `GET /api/v1/escalations` (`priority_score DESC, created_at ASC`) with
   `?include_resolved=true` and `?document_id=...` filtering.
5. Idempotent `startup()` ALTER TABLE migrations for Phase 5 `work_items` columns.
"""

from __future__ import annotations

import asyncio
import io
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import create_async_engine

import bert.main as main_module
from bert.api.main import app, startup
from bert.models.base import SessionFactory
from bert.models.documents import (
    AuditLog,
    Document,
    ExecutiveSummaryRecord,
    PriorityTier,
    ResolvedByTier,
    SourceFormat,
    VerificationStatus,
    WorkItem,
)
from bert.verification.citation_gate import INSUFFICIENT_EVIDENCE_OUTPUT


def _make_pdf(lines: list[str] | None = None) -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=612.0, height=792.0)
    if lines:
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        font_ref = writer._add_object(font)
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})}
        )
        commands = ["BT", "/F1 14 Tf", "72 720 Td"]
        for idx, line in enumerate(lines):
            if idx:
                commands.append("0 -24 Td")
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.append(f"({escaped}) Tj")
        commands.append("ET")
        stream = DecodedStreamObject()
        stream.set_data("\n".join(commands).encode("latin-1"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    else:
        stream = DecodedStreamObject()
        stream.set_data(b"q 400 0 0 500 100 150 cm Q\n%\xff\xfe")
        page[NameObject("/Contents")] = writer._add_object(stream)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


async def _wait_job(client: httpx.AsyncClient, job_id: str) -> dict[str, object]:
    for _ in range(150):
        state = (await client.get(f"/api/v1/jobs/{job_id}")).json()
        if state["status"] in {"COMPLETED", "FAILED", "CANCELLED"}:
            return state
        await asyncio.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not finish")


@pytest.mark.asyncio
async def test_pipeline_separates_vision_rescue_and_machine_extracted_text() -> None:
    """Scan/low-OCR items get vision_rescue_text + has_vision_rescue=True; missing proof gets neither."""
    await startup()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Scanned PDF -> STAMP_NOTE + PHYSICAL_SCAN + ocr_confidence < 0.90
        up_scan = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("scanned_addendum.pdf", _make_pdf(None), "application/pdf")},
        )
        assert up_scan.status_code == 200
        scan_doc_id = up_scan.json()["id"]

        # 2. Digital PDF with one normal line and one [LOW_CONFIDENCE] stamp line
        up_dig = await client.post(
            "/api/v1/documents/upload",
            files={
                "file": (
                    "mixed_policy.pdf",
                    _make_pdf(
                        [
                            "Access control requires multifactor authentication for privileged accounts.",
                            "[LOW_CONFIDENCE] STAMP NOTE: Signed addendum dated 2026-03-01",
                        ]
                    ),
                    "application/pdf",
                )
            },
        )
        assert up_dig.status_code == 200
        dig_doc_id = up_dig.json()["id"]

        scan_job = await client.post("/api/v1/jobs/start", json={"document_id": scan_doc_id})
        assert (await _wait_job(client, scan_job.json()["job_id"]))["status"] == "COMPLETED"

        dig_job = await client.post("/api/v1/jobs/start", json={"document_id": dig_doc_id})
        assert (await _wait_job(client, dig_job.json()["job_id"]))["status"] == "COMPLETED"

        scan_items = (await client.get(f"/api/v1/work-items?document_id={scan_doc_id}")).json()
        assert len(scan_items) == 1
        assert scan_items[0]["has_vision_rescue"] is True
        assert scan_items[0]["vision_rescue_text"]
        assert scan_items[0]["machine_extracted_text"] is None

        dig_items = (await client.get(f"/api/v1/work-items?document_id={dig_doc_id}")).json()
        assert len(dig_items) == 2
        verified_item = next(i for i in dig_items if i["verification_status"] == "VERIFIED")
        stamp_item = next(i for i in dig_items if i["verification_status"] != "VERIFIED")
        assert verified_item["has_vision_rescue"] is False
        assert verified_item["vision_rescue_text"] is None
        assert verified_item["machine_extracted_text"] == "Access control requires multifactor authentication for privileged accounts."
        assert stamp_item["has_vision_rescue"] is True
        assert "STAMP NOTE" in (stamp_item["vision_rescue_text"] or "")
        assert stamp_item["machine_extracted_text"] is None

        # 3. Demo seed: INSUFFICIENT_EVIDENCE items MUST have neither field populated.
        seed_resp = await client.post("/api/v1/demo/seed")
        assert seed_resp.status_code == 200
        demo_items = (await client.get("/api/v1/work-items")).json()
        insuff = [i for i in demo_items if i["verification_status"] == "INSUFFICIENT_EVIDENCE"]
        ver = [i for i in demo_items if i["verification_status"] == "VERIFIED"]
        assert len(insuff) > 0 and len(ver) > 0
        for item in insuff:
            assert item["has_vision_rescue"] is False
            assert item["vision_rescue_text"] is None
            assert item["machine_extracted_text"] is None
            assert item["machine_extracted_text"] != INSUFFICIENT_EVIDENCE_OUTPUT
        for item in ver:
            assert item["has_vision_rescue"] is False
            assert item["vision_rescue_text"] is None
            assert item["machine_extracted_text"]
            assert item["machine_extracted_text"] != INSUFFICIENT_EVIDENCE_OUTPUT


@pytest.mark.asyncio
async def test_approve_rejects_empty_text_422_and_adopts_vision_rescue_and_machine_text() -> None:
    """`approve` 422s without machine/rescue text, adopts vision_rescue_text with ACCEPT_VISION_RESCUE audit."""
    await startup()
    ws_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    empty_id = uuid.uuid4()
    rescue_id = uuid.uuid4()
    machine_id = uuid.uuid4()

    async with SessionFactory() as session:
        session.add(
            Document(
                id=doc_id,
                workspace_id=ws_id,
                filename="scanned.pdf",
                source_format=SourceFormat.PHYSICAL_SCAN,
                ast_checksum="b" * 64,
                total_pages=1,
                total_ast_nodes=3,
                processing_status="COMPLETED",
            )
        )
        session.add_all(
            [
                WorkItem(
                    id=empty_id,
                    workspace_id=ws_id,
                    batch_id=batch_id,
                    document_id=doc_id,
                    item_type="QUESTIONNAIRE_ROW",
                    category="Access Control",
                    priority_tier=PriorityTier.P0_CRITICAL,
                    priority_score=100,
                    prompt_or_question="What is the cyber insurance coverage limit?",
                    fluent_output=INSUFFICIENT_EVIDENCE_OUTPUT,
                    structured_facts=[],
                    verified_citations=[],
                    verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE,
                    resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                    machine_extracted_text=None,
                    vision_rescue_text=None,
                    has_vision_rescue=False,
                ),
                WorkItem(
                    id=rescue_id,
                    workspace_id=ws_id,
                    batch_id=batch_id,
                    document_id=doc_id,
                    item_type="DOCUMENT_FINDING",
                    category="Security Operations",
                    priority_tier=PriorityTier.P0_CRITICAL,
                    priority_score=95,
                    prompt_or_question="Page 1 (Scanned Region)",
                    fluent_output=INSUFFICIENT_EVIDENCE_OUTPUT,
                    structured_facts=[],
                    verified_citations=[],
                    verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE,
                    resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                    machine_extracted_text=None,
                    vision_rescue_text="STAMP NOTE: Annual disaster recovery test passed 2026-01-19",
                    has_vision_rescue=True,
                ),
                WorkItem(
                    id=machine_id,
                    workspace_id=ws_id,
                    batch_id=batch_id,
                    document_id=doc_id,
                    item_type="DOCUMENT_FINDING",
                    category="Cryptography",
                    priority_tier=PriorityTier.P1_HIGH,
                    priority_score=78,
                    prompt_or_question="Page 1",
                    fluent_output="Weak evidence flagged for human verification.",
                    structured_facts=[],
                    verified_citations=[],
                    verification_status=VerificationStatus.NEEDS_HUMAN_VERIFICATION,
                    resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                    machine_extracted_text="Encryption at rest uses AES-256 with KMS rotation.",
                    vision_rescue_text=None,
                    has_vision_rescue=False,
                ),
            ]
        )
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Empty item -> 422 even if correction text is provided (cannot accept nonexistent machine text)
        reject_resp = await client.post(
            f"/api/v1/escalations/{empty_id}/resolve",
            json={"action": "approve", "correction": "Fabricated approval text"},
        )
        assert reject_resp.status_code == 422

        # 2. Vision rescue item -> 200, adopts vision_rescue_text, records ACCEPT_VISION_RESCUE
        rescue_resp = await client.post(
            f"/api/v1/escalations/{rescue_id}/resolve",
            json={"action": "approve", "actor": "Vision Reviewer"},
        )
        assert rescue_resp.status_code == 200
        r_data = rescue_resp.json()
        assert r_data["verification_status"] == "VERIFIED"
        assert r_data["resolved_by_tier"] == "HUMAN_IN_THE_LOOP"
        assert r_data["fluent_output"] == "STAMP NOTE: Annual disaster recovery test passed 2026-01-19"
        assert r_data["has_vision_rescue"] is True
        assert r_data["can_undo"] is True

        # 3. Machine-extracted item -> 200, adopts machine_extracted_text, records ESCALATION_APPROVE
        machine_resp = await client.post(
            f"/api/v1/escalations/{machine_id}/resolve",
            json={"action": "approve", "actor": "Compliance Reviewer"},
        )
        assert machine_resp.status_code == 200
        m_data = machine_resp.json()
        assert m_data["verification_status"] == "VERIFIED"
        assert m_data["fluent_output"] == "Encryption at rest uses AES-256 with KMS rotation."
        assert m_data["has_vision_rescue"] is False

    async with SessionFactory() as session:
        logs = list((await session.execute(select(AuditLog).order_by(AuditLog.id))).scalars().all())
    rescue_logs = [log for log in logs if log.work_item_id == rescue_id]
    machine_logs = [log for log in logs if log.work_item_id == machine_id]
    assert any(log.action == "ACCEPT_VISION_RESCUE" for log in rescue_logs)
    assert any(log.action == "ESCALATION_APPROVE" for log in machine_logs)
    assert not any(log.action == "ACCEPT_VISION_RESCUE" for log in machine_logs)


@pytest.mark.asyncio
async def test_batch_resolve_validation_partial_errors_summary_and_undo() -> None:
    """`POST /api/v1/escalations/batch-resolve` applies per-item validation, snapshots, AuditLog, summary, and undo."""
    await startup()
    ws_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    rescue_id = uuid.uuid4()
    machine_id = uuid.uuid4()
    empty_id = uuid.uuid4()
    missing_id = uuid.uuid4()

    async with SessionFactory() as session:
        session.add(
            Document(
                id=doc_id,
                workspace_id=ws_id,
                filename="batch_doc.pdf",
                source_format=SourceFormat.DIGITAL_PDF,
                ast_checksum="c" * 64,
                total_pages=1,
                total_ast_nodes=3,
                processing_status="COMPLETED",
            )
        )
        session.add_all(
            [
                WorkItem(
                    id=rescue_id,
                    workspace_id=ws_id,
                    batch_id=batch_id,
                    document_id=doc_id,
                    item_type="DOCUMENT_FINDING",
                    category="Access Control",
                    priority_tier=PriorityTier.P0_CRITICAL,
                    priority_score=95,
                    prompt_or_question="Q1 rescue",
                    fluent_output=INSUFFICIENT_EVIDENCE_OUTPUT,
                    structured_facts=[],
                    verified_citations=[],
                    verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE,
                    resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                    vision_rescue_text="Rescued MFA attestation from scanned page.",
                    has_vision_rescue=True,
                ),
                WorkItem(
                    id=machine_id,
                    workspace_id=ws_id,
                    batch_id=batch_id,
                    document_id=doc_id,
                    item_type="DOCUMENT_FINDING",
                    category="Cryptography",
                    priority_tier=PriorityTier.P1_HIGH,
                    priority_score=80,
                    prompt_or_question="Q2 machine",
                    fluent_output="Weak evidence flagged for human verification.",
                    structured_facts=[],
                    verified_citations=[],
                    verification_status=VerificationStatus.NEEDS_HUMAN_VERIFICATION,
                    resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                    machine_extracted_text="AES-256 encryption enforced for all production buckets.",
                ),
                WorkItem(
                    id=empty_id,
                    workspace_id=ws_id,
                    batch_id=batch_id,
                    document_id=doc_id,
                    item_type="QUESTIONNAIRE_ROW",
                    category="Security Operations",
                    priority_tier=PriorityTier.P0_CRITICAL,
                    priority_score=100,
                    prompt_or_question="Q3 missing proof",
                    fluent_output=INSUFFICIENT_EVIDENCE_OUTPUT,
                    structured_facts=[],
                    verified_citations=[],
                    verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE,
                    resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                ),
            ]
        )
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Mixed batch approve: 2 valid + 1 empty (422) + 1 nonexistent (404)
        batch_resp = await client.post(
            "/api/v1/escalations/batch-resolve",
            json={
                "work_item_ids": [str(rescue_id), str(empty_id), str(machine_id), str(missing_id), str(rescue_id)],
                "action": "approve",
                "actor": "Batch Reviewer",
            },
        )
        assert batch_resp.status_code == 200
        payload = batch_resp.json()
        assert payload["updated_count"] == 2
        assert {item["id"] for item in payload["items"]} == {str(rescue_id), str(machine_id)}
        assert set(payload["skipped_ids"]) == {str(empty_id), str(missing_id)}
        assert len(payload["errors"]) == 2
        err_by_id = {e["work_item_id"]: e for e in payload["errors"]}
        assert err_by_id[str(empty_id)]["status_code"] == 422
        assert err_by_id[str(missing_id)]["status_code"] == 404
        assert all(item["can_undo"] is True for item in payload["items"])

        # Summary was regenerated after batch
        summary = (await client.get("/api/v1/summary")).json()
        assert summary["verified_count"] == 2
        assert summary["unresolved_count"] == 1

        # 2. Undo one item individually via /work-items/{id}/undo
        undo_one = await client.post(f"/api/v1/work-items/{rescue_id}/undo", json={"actor": "Batch Reviewer"})
        assert undo_one.status_code == 200
        assert undo_one.json()["verification_status"] == "INSUFFICIENT_EVIDENCE"
        assert undo_one.json()["can_undo"] is False

        # 3. Batch undo remaining item (plus already-undone rescue_id -> 409 skip)
        batch_undo = await client.post(
            "/api/v1/escalations/batch-resolve",
            json={
                "work_item_ids": [str(rescue_id), str(machine_id)],
                "action": "undo",
                "actor": "Batch Reviewer",
            },
        )
        assert batch_undo.status_code == 200
        bu = batch_undo.json()
        assert bu["updated_count"] == 1
        assert bu["items"][0]["id"] == str(machine_id)
        assert bu["items"][0]["verification_status"] == "NEEDS_HUMAN_VERIFICATION"
        assert bu["skipped_ids"] == [str(rescue_id)]
        assert bu["errors"][0]["status_code"] == 409

        # 4. Batch N/A validation error when note and reason_code are omitted
        bad_na = await client.post(
            "/api/v1/escalations/batch-resolve",
            json={"work_item_ids": [str(empty_id)], "action": "not_applicable"},
        )
        assert bad_na.status_code == 200
        assert bad_na.json()["updated_count"] == 0
        assert bad_na.json()["errors"][0]["status_code"] == 422

        # 5. Batch counsel succeeds across multiple items
        batch_counsel = await client.post(
            "/api/v1/escalations/batch-resolve",
            json={
                "work_item_ids": [str(rescue_id), str(empty_id)],
                "action": "counsel",
                "assignee": "Legal Team",
                "reason_code": "BULK_LEGAL_REVIEW",
                "note": "Escalate both together",
                "actor": "Triage Lead",
            },
        )
        assert batch_counsel.status_code == 200
        assert batch_counsel.json()["updated_count"] == 2
        assert all(i["verification_status"] == "ESCALATED_LEGAL" for i in batch_counsel.json()["items"])

    async with SessionFactory() as session:
        logs = list((await session.execute(select(AuditLog).order_by(AuditLog.id))).scalars().all())
        sums = list((await session.execute(select(ExecutiveSummaryRecord))).scalars().all())
    assert any(log.action == "ACCEPT_VISION_RESCUE" and log.work_item_id == rescue_id for log in logs)
    assert any(log.action == "ESCALATION_APPROVE" and log.work_item_id == machine_id for log in logs)
    assert sum(1 for log in logs if log.action == "ESCALATION_UNDO") == 2
    assert sum(1 for log in logs if log.action == "ESCALATION_COUNSEL") == 2
    assert any(s.is_stale is True for s in sums)
    assert any(s.is_stale is False for s in sums)


@pytest.mark.asyncio
async def test_escalations_priority_ordering_include_resolved_and_document_filter() -> None:
    """`GET /api/v1/escalations` orders by priority_score DESC, created_at ASC and supports include_resolved & document_id."""
    await startup()
    ws_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    doc_a = uuid.uuid4()
    doc_b = uuid.uuid4()
    base_time = datetime(2026, 11, 12, 10, 0, 0, tzinfo=UTC)

    items_spec = [
        # (id, doc, status, tier, score, delta_sec, label)
        (uuid.uuid4(), doc_a, VerificationStatus.INSUFFICIENT_EVIDENCE, PriorityTier.P0_CRITICAL, 100, 30, "a-p0-later"),
        (uuid.uuid4(), doc_a, VerificationStatus.NEEDS_HUMAN_VERIFICATION, PriorityTier.P0_CRITICAL, 100, 10, "a-p0-earlier"),
        (uuid.uuid4(), doc_b, VerificationStatus.ESCALATED_LEGAL, PriorityTier.P1_HIGH, 80, 20, "b-p1-legal"),
        (uuid.uuid4(), doc_a, VerificationStatus.HUMAN_OVERRIDE, PriorityTier.P0_CRITICAL, 95, 5, "a-p0-override"),
        (uuid.uuid4(), doc_b, VerificationStatus.NOT_APPLICABLE, PriorityTier.P2_MEDIUM, 50, 15, "b-p2-na"),
        (uuid.uuid4(), doc_a, VerificationStatus.VERIFIED, PriorityTier.P3_LOW, 25, 40, "a-p3-verified"),
    ]

    async with SessionFactory() as session:
        session.add_all(
            [
                Document(
                    id=doc_a,
                    workspace_id=ws_id,
                    filename="doc_a.pdf",
                    source_format=SourceFormat.DIGITAL_PDF,
                    ast_checksum="d" * 64,
                    total_pages=1,
                    total_ast_nodes=1,
                    processing_status="COMPLETED",
                ),
                Document(
                    id=doc_b,
                    workspace_id=ws_id,
                    filename="doc_b.pdf",
                    source_format=SourceFormat.DIGITAL_PDF,
                    ast_checksum="e" * 64,
                    total_pages=1,
                    total_ast_nodes=1,
                    processing_status="COMPLETED",
                ),
            ]
        )
        for item_id, doc_id, status, tier, score, delta_sec, label in items_spec:
            session.add(
                WorkItem(
                    id=item_id,
                    workspace_id=ws_id,
                    batch_id=batch_id,
                    document_id=doc_id,
                    item_type="DOCUMENT_FINDING",
                    category="Access Control",
                    priority_tier=tier,
                    priority_score=score,
                    prompt_or_question=label,
                    fluent_output=label,
                    structured_facts=[],
                    verified_citations=[],
                    verification_status=status,
                    resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                    created_at=base_time + timedelta(seconds=delta_sec),
                )
            )
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Default unresolved only, ordered by priority_score DESC, created_at ASC
        default_resp = await client.get("/api/v1/escalations")
        assert default_resp.status_code == 200
        default_labels = [row["prompt_or_question"] for row in default_resp.json()]
        assert default_labels == ["a-p0-earlier", "a-p0-later", "b-p1-legal"]

        # 2. include_resolved=true returns all 6 statuses in priority_score DESC, created_at ASC order
        all_resp = await client.get("/api/v1/escalations?include_resolved=true")
        assert all_resp.status_code == 200
        all_rows = all_resp.json()
        assert [row["prompt_or_question"] for row in all_rows] == [
            "a-p0-earlier",
            "a-p0-later",
            "a-p0-override",
            "b-p1-legal",
            "b-p2-na",
            "a-p3-verified",
        ]
        assert {row["verification_status"] for row in all_rows} == {
            "INSUFFICIENT_EVIDENCE",
            "NEEDS_HUMAN_VERIFICATION",
            "ESCALATED_LEGAL",
            "HUMAN_OVERRIDE",
            "NOT_APPLICABLE",
            "VERIFIED",
        }

        # 3. document_id filtering works both with and without include_resolved
        doc_a_open = await client.get(f"/api/v1/escalations?document_id={doc_a}")
        assert doc_a_open.status_code == 200
        assert [row["prompt_or_question"] for row in doc_a_open.json()] == ["a-p0-earlier", "a-p0-later"]

        doc_a_all = await client.get(f"/api/v1/escalations?include_resolved=true&document_id={doc_a}")
        assert doc_a_all.status_code == 200
        assert [row["prompt_or_question"] for row in doc_a_all.json()] == [
            "a-p0-earlier",
            "a-p0-later",
            "a-p0-override",
            "a-p3-verified",
        ]

        # 4. Invalid document_id returns 422
        bad_doc = await client.get("/api/v1/escalations?document_id=not-a-uuid")
        assert bad_doc.status_code == 422


@pytest.mark.asyncio
async def test_startup_migrates_phase5_work_item_columns_idempotently(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify `startup()` safely adds Phase 5 rescue/machine text columns to existing SQLite tables."""
    legacy_db = tmp_path / "legacy_phase4.db"
    temp_engine = create_async_engine(f"sqlite+aiosqlite:///{legacy_db}", future=True)
    monkeypatch.setattr(main_module, "engine", temp_engine)

    try:
        async with temp_engine.begin() as conn:
            await conn.execute(text("CREATE TABLE documents (id VARCHAR(36) PRIMARY KEY, filename TEXT)"))
            await conn.execute(text("CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_name TEXT)"))
            await conn.execute(text("CREATE TABLE ast_nodes (id VARCHAR(36) PRIMARY KEY, document_id VARCHAR(36))"))
            await conn.execute(text("CREATE TABLE work_items (id VARCHAR(36) PRIMARY KEY, prompt_or_question TEXT)"))
            await conn.execute(
                text(
                    "CREATE TABLE executive_summaries (id VARCHAR(36) PRIMARY KEY, total_work_items INTEGER NOT NULL DEFAULT 0, defensibility_score FLOAT)"
                )
            )

        await startup()
        await startup()

        async with temp_engine.connect() as conn:
            work_cols = await conn.run_sync(lambda sc: {c["name"] for c in inspect(sc).get_columns("work_items")})

        assert {
            "machine_extracted_text",
            "vision_rescue_text",
            "has_vision_rescue",
        } <= work_cols
    finally:
        await temp_engine.dispose()
