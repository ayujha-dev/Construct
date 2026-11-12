"""Phase 2 integration & regression tests: unified locators, Envoy summary, legal escalation, undo, and non-mutating XLSX export."""

from __future__ import annotations

import asyncio
import io
import json
import uuid
from datetime import UTC, date, datetime
from pathlib import Path

import httpx
import pytest
from openpyxl import Workbook, load_workbook
from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, NameObject, NumberObject
from sqlalchemy import select

from bert.api.main import app, manager, startup
from bert.models.base import SessionFactory
from bert.models.documents import (
    ASTNode,
    Document,
    ExecutiveSummaryRecord,
    PriorityTier,
    SourceFormat,
    VerificationStatus,
)
from bert.agents.pipeline import verify_node_region
from bert.state import DATA_DIR
from bert.verification.citation_gate import verify_region_text


def _build_pdf_bytes(
    *,
    width: float = 612.0,
    height: float = 792.0,
    crop_box: tuple[float, float, float, float] | None = None,
    rotation: int = 0,
    text_lines: list[tuple[float, float, str]] | None = None,
    include_binary_comment: bool = False,
) -> bytes:
    """Create a standards-compliant PDF with arbitrary dimensions, crop box, rotation, and text coordinates."""
    writer = PdfWriter()
    page = writer.add_blank_page(width=width, height=height)
    if crop_box is not None:
        page[NameObject("/CropBox")] = ArrayObject([NumberObject(v) for v in crop_box])
    if rotation:
        page[NameObject("/Rotate")] = NumberObject(rotation)

    if text_lines:
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
        commands = ["BT", "/F1 14 Tf"]
        for x, y, line in text_lines:
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.append(f"1 0 0 1 {x} {y} Tm ({escaped}) Tj")
        commands.append("ET")
        stream = DecodedStreamObject()
        stream.set_data("\n".join(commands).encode("latin-1"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    else:
        # Image/scan-only PDF content stream with zero text operators.
        stream = DecodedStreamObject()
        raw_stream = b"q 400 0 0 500 100 150 cm Q"
        if include_binary_comment:
            raw_stream += b"\n%\xff\xfe\xfd"
        stream.set_data(raw_stream)
        page[NameObject("/Contents")] = writer._add_object(stream)

    buf = io.BytesIO()
    writer.write(buf)
    data = buf.getvalue()
    if include_binary_comment:
        data = data.replace(b"%PDF-1.", b"%PDF-1.", 1)
    return data


async def _wait_for_job(client: httpx.AsyncClient, job_id: str) -> dict[str, object]:
    for _ in range(120):
        state = (await client.get(f"/api/v1/jobs/{job_id}")).json()
        if state["status"] in {"COMPLETED", "FAILED"}:
            return state
        await asyncio.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not finish")


@pytest.mark.asyncio
async def test_rotated_cropped_and_widescreen_pdf_locator_extraction_and_copilot() -> None:
    """Verify real PDF coordinate extraction (`M = cm @ tm`) on 90 deg, 180 deg, cropped, and 960x540 PDFs."""
    await startup()
    rot90_pdf = _build_pdf_bytes(
        width=612.0,
        height=792.0,
        crop_box=(36.0, 36.0, 576.0, 756.0),
        rotation=90,
        text_lines=[
            (84.0, 680.0, "Multifactor authentication is enforced across all SSH bastion hosts."),
            (84.0, 620.0, "Session recordings are archived cleanly for ninety days."),
        ],
    )
    rot180_pitch_pdf = _build_pdf_bytes(
        width=960.0,
        height=540.0,
        rotation=180,
        text_lines=[
            (120.0, 420.0, "Encryption at rest uses AWS KMS AES-256 with annual rotation."),
        ],
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        up_90 = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("bastion_rot90.pdf", rot90_pdf, "application/pdf")},
        )
        up_180 = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("pitch_rot180.pdf", rot180_pitch_pdf, "application/pdf")},
        )
        assert up_90.status_code == 200
        assert up_180.status_code == 200
        doc90 = up_90.json()
        doc180 = up_180.json()
        assert doc90["source_format"] == "DIGITAL_PDF"
        assert doc180["source_format"] == "DIGITAL_PDF"

        nodes90 = (await client.get(f"/api/v1/documents/{doc90['id']}/nodes")).json()
        assert len(nodes90) == 2
        loc0 = nodes90[0]["locator"]
        assert loc0["source_type"] == "pdf"
        assert loc0["coord_system"] == "pdf_user_space_bl_pt"
        assert loc0["page"] == 1
        assert loc0["page_width"] == 612.0
        assert loc0["page_height"] == 792.0
        assert loc0["crop_box"] == [36.0, 36.0, 576.0, 756.0]
        assert loc0["rotation"] == 90
        assert loc0["node_id"] == nodes90[0]["id"]
        assert loc0["checksum"] == doc90["ast_checksum"]
        # Real extracted x0 near 84, y0 near 680 - descender (unrotated user space).
        assert 80.0 <= loc0["bbox"][0] <= 86.0
        assert 670.0 <= loc0["bbox"][1] <= 682.0
        assert loc0["bbox"][2] > 200.0

        nodes180 = (await client.get(f"/api/v1/documents/{doc180['id']}/nodes")).json()
        assert len(nodes180) == 1
        loc180 = nodes180[0]["locator"]
        assert loc180["page_width"] == 960.0
        assert loc180["page_height"] == 540.0
        assert loc180["rotation"] == 180
        assert 116.0 <= loc180["bbox"][0] <= 122.0
        assert 410.0 <= loc180["bbox"][1] <= 422.0

        started = await client.post("/api/v1/jobs/start", json={"document_id": doc90["id"]})
        assert started.status_code == 200
        job_state = await _wait_for_job(client, started.json()["job_id"])
        assert job_state["status"] == "COMPLETED"

        work_items = (await client.get(f"/api/v1/work-items?document_id={doc90['id']}")).json()
        assert len(work_items) == 2
        for item in work_items:
            assert item["verification_status"] == "VERIFIED"
            cit = item["verified_citations"][0]
            assert cit["region_match_score"] >= 97.0
            assert cit["locator"]["source_type"] == "pdf"
            assert cit["locator"]["rotation"] == 90
            assert cit["locator"]["checksum"] == doc90["ast_checksum"]

        chat = await client.post(
            "/api/v1/copilot/chat",
            json={"prompt": "SSH bastion multifactor authentication", "document_id": doc90["id"]},
        )
        assert chat.status_code == 200
        chat_data = chat.json()
        assert chat_data["verification_status"] == "VERIFIED"
        assert chat_data["citations"][0]["region_match_score"] >= 97.0
        assert chat_data["citations"][0]["locator"]["rotation"] == 90
        assert chat_data["citations"][0]["locator"]["checksum"] == doc90["ast_checksum"]

        # Insufficient contract preservation: exact 4 keys.
        miss = await client.post(
            "/api/v1/copilot/chat",
            json={"prompt": "What is the vendor submarine fleet count?", "document_id": doc90["id"]},
        )
        assert miss.status_code == 200
        assert set(miss.json().keys()) == {"answer", "verification_status", "match_score", "citations"}
        assert miss.json()["verification_status"] == "INSUFFICIENT_EVIDENCE"


@pytest.mark.asyncio
async def test_region_text_verification_rejects_wrong_bbox_and_bloated_quotes() -> None:
    """Verify >=97% region_match_score catches wrong PDF bbox coordinates and padded fake quotes."""
    assert verify_region_text("Access control requires MFA.", "Access control requires MFA.") == (True, 100.0)
    assert verify_region_text("Short", "Completely unrelated insurance policy limit") == (False, 20.0) or not verify_region_text(
        "Short", "Completely unrelated insurance policy limit"
    )[0]
    bloated_ok, _ = verify_region_text(
        "MFA " + ("and fabricated liability cap waiver of $999M " * 4),
        "MFA",
    )
    assert bloated_ok is False

    await startup()
    pdf_bytes = _build_pdf_bytes(
        text_lines=[
            (72.0, 720.0, "Access control mandates hardware security keys for admins."),
            (72.0, 620.0, "Retention schedule deletes temporary logs after thirty days."),
        ]
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        up = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("regions.pdf", pdf_bytes, "application/pdf")},
        )
        doc_id = uuid.UUID(up.json()["id"])

    async with SessionFactory() as session:
        doc = await session.get(Document, doc_id)
        node = (
            await session.execute(select(ASTNode).where(ASTNode.document_id == doc_id).order_by(ASTNode.node_order))
        ).scalars().first()
        assert doc is not None and node is not None
        ok_good, score_good = verify_node_region(node, doc, node.verbatim_text)
        assert ok_good is True and score_good >= 97.0

        # Point locator bbox at an empty corner instead of the actual text coordinates.
        bad_locator = dict(node.locator or {})
        bad_locator["bbox"] = [10.0, 10.0, 40.0, 25.0]
        node.locator = bad_locator
        await session.commit()
        ok_bad, score_bad = verify_node_region(node, doc, node.verbatim_text)
        assert ok_bad is False
        assert score_bad < 97.0


@pytest.mark.asyncio
async def test_scanned_pdf_physical_scan_no_utf8_decode_and_chronos_safe() -> None:
    """Image-only %PDF- files classify as PHYSICAL_SCAN, emit STAMP_NOTE, never auto-verify, and coexist with dated docs."""
    await startup()
    scanned_pdf = _build_pdf_bytes(width=612.0, height=792.0, rotation=270, text_lines=None, include_binary_comment=True)

    # Seed an existing dated document in DB so Chronos exercises mixed date vs datetime sorting.
    async with SessionFactory() as session:
        dated_doc = Document(
            id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            filename="Existing_Policy_2025.pdf",
            source_format=SourceFormat.DIGITAL_PDF,
            priority_tier=PriorityTier.P2_MEDIUM,
            priority_score=50,
            effective_date=date(2025, 6, 1),
            is_latest_version=True,
            ast_checksum="0" * 64,
            total_pages=1,
            total_ast_nodes=1,
            processing_status="COMPLETED",
        )
        session.add(dated_doc)
        session.add(
            ASTNode(
                id=uuid.uuid4(),
                document_id=dated_doc.id,
                node_type="CLAUSE",
                section_path="Page 1",
                verbatim_text="Existing policy mandates annual compliance attestation.",
                page_number=1,
                ocr_confidence=1.0,
                node_order=0,
            )
        )
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        up = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("scan_addendum.pdf", scanned_pdf, "application/pdf")},
        )
        assert up.status_code == 200
        doc = up.json()
        assert doc["source_format"] == "PHYSICAL_SCAN"

        nodes = (await client.get(f"/api/v1/documents/{doc['id']}/nodes")).json()
        assert len(nodes) == 1
        scan_node = nodes[0]
        assert scan_node["node_type"] == "STAMP_NOTE"
        assert scan_node["ocr_confidence"] < 0.90
        assert "endstream" not in scan_node["verbatim_text"]
        assert "%PDF-" not in scan_node["verbatim_text"]
        assert scan_node["locator"]["source_type"] == "pdf"
        assert scan_node["locator"]["rotation"] == 270
        assert scan_node["locator"]["checksum"] == doc["ast_checksum"]

        # Run full regiment across both dated_doc and undated scanned_doc (Chronos date/datetime check!).
        started = await client.post("/api/v1/jobs/start")
        assert started.status_code == 200
        state = await _wait_for_job(client, started.json()["job_id"])
        assert state["status"] == "COMPLETED"

        scan_items = (await client.get(f"/api/v1/work-items?document_id={doc['id']}")).json()
        assert len(scan_items) == 1
        assert scan_items[0]["verification_status"] == "INSUFFICIENT_EVIDENCE"
        assert scan_items[0]["priority_tier"] == "P0_CRITICAL"


@pytest.mark.asyncio
async def test_xlsx_and_json_locators_persisted_with_checksums_and_copilot() -> None:
    """Verify XLSXLocator (`sheet`, `row`, `col_range`) and canonical JSONLocator (`$.path`) end-to-end."""
    await startup()
    config_bytes = json.dumps({"rules": {"wildcard-admin": {"effect": "Allow", "action": "s3:*"}}}).encode("utf-8")

    wb = Workbook()
    ws = wb.active
    ws.title = "VendorControls"
    ws.append(["Question", "Owner"])
    ws.append(["Does AWS contain a wildcard S3 action?", "CloudSec"])
    xlsx_buf = io.BytesIO()
    wb.save(xlsx_buf)
    wb.close()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        up_json = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("iam_rules.json", config_bytes, "application/json")},
        )
        up_xlsx = await client.post(
            "/api/v1/documents/upload",
            files={
                "file": (
                    "vendor_q.xlsx",
                    xlsx_buf.getvalue(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert up_json.status_code == 200
        assert up_xlsx.status_code == 200
        json_doc = up_json.json()
        xlsx_doc = up_xlsx.json()

        json_nodes = (await client.get(f"/api/v1/documents/{json_doc['id']}/nodes")).json()
        action_node = next(n for n in json_nodes if "s3:*" in n["verbatim_text"])
        assert action_node["section_path"] == "rules.wildcard-admin.action"
        assert action_node["locator"] == {
            "source_type": "json",
            "doc_id": json_doc["id"],
            "json_path": "$.rules.wildcard-admin.action",
            "node_id": action_node["id"],
            "checksum": json_doc["ast_checksum"],
        }

        xlsx_nodes = (await client.get(f"/api/v1/documents/{xlsx_doc['id']}/nodes")).json()
        assert len(xlsx_nodes) == 1
        assert xlsx_nodes[0]["locator"] == {
            "source_type": "xlsx",
            "doc_id": xlsx_doc["id"],
            "sheet": "VendorControls",
            "row": 2,
            "col_range": "A2:B2",
            "node_id": xlsx_nodes[0]["id"],
            "checksum": xlsx_doc["ast_checksum"],
        }

        started = await client.post("/api/v1/jobs/start")
        assert started.status_code == 200
        state = await _wait_for_job(client, started.json()["job_id"])
        assert state["status"] == "COMPLETED"

        items = (await client.get("/api/v1/work-items")).json()
        assert len(items) == 1
        assert items[0]["verification_status"] == "VERIFIED"
        cit = items[0]["verified_citations"][0]
        assert cit["region_match_score"] == 100.0
        assert cit["locator"]["source_type"] == "json"
        assert cit["locator"]["json_path"] == "$.rules.wildcard-admin.action"

        chat_json = await client.post(
            "/api/v1/copilot/chat",
            json={"prompt": "wildcard s3 action", "document_id": json_doc["id"]},
        )
        assert chat_json.status_code == 200
        assert "[iam_rules.json:$.rules.wildcard-admin.action]" in chat_json.json()["answer"]
        assert chat_json.json()["citations"][0]["locator"]["json_path"] == "$.rules.wildcard-admin.action"


@pytest.mark.asyncio
async def test_envoy_summary_persistence_filters_empty_state_md_parity_and_legal_invalidation() -> None:
    """Verify Envoy ExecutiveSummaryRecord lifecycle, filters, empty state, .md parity, and legal escalation updates."""
    await startup()
    events: list[dict[str, object]] = []

    async def collect(event: dict[str, object]) -> None:
        events.append(event)

    manager.sink.add(collect)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # Empty state before seeding.
            empty_sum = await client.get("/api/v1/summary")
            empty_md = await client.get("/api/v1/export/summary.md")
            assert empty_sum.status_code == 200
            assert empty_md.status_code == 200
            assert "0 findings" in empty_sum.json()["summary_text"]
            assert empty_sum.json()["markdown"] == empty_md.text

            seeded = await client.post("/api/v1/demo/seed")
            assert seeded.status_code == 200
            assert any(evt.get("type") == "summary_generated" for evt in events)

            full_sum = (await client.get("/api/v1/summary?document_id=&only_critical=false&latest_only=false")).json()
            full_md = (await client.get("/api/v1/export/summary.md?document_id=&only_critical=false&latest_only=false")).text
            assert full_sum["total_work_items"] == 13
            assert full_sum["verified_count"] > 0
            assert full_sum["unresolved_count"] == 13 - full_sum["verified_count"]
            assert full_sum["escalated_legal_count"] == 0
            assert full_sum["markdown"] == full_md
            assert full_sum["arbiter_resolutions"]["resolved"] is True

            # Critical-only filter & .md parity.
            crit_sum = (await client.get("/api/v1/summary?only_critical=true")).json()
            crit_md = (await client.get("/api/v1/export/summary.md?only_critical=true")).text
            assert crit_sum["only_critical"] is True
            assert crit_sum["total_work_items"] == crit_sum["critical_count"]
            assert 0 < crit_sum["total_work_items"] < 13
            assert all(f["priority_tier"] == "P0_CRITICAL" for f in crit_sum["key_findings"])
            assert crit_sum["markdown"] == crit_md

            # Document filter with zero matching items -> explicit empty state in both JSON and .md.
            unknown_doc_id = str(uuid.uuid4())
            none_sum = (await client.get(f"/api/v1/summary?document_id={unknown_doc_id}")).json()
            none_md = (await client.get(f"/api/v1/export/summary.md?document_id={unknown_doc_id}")).text
            assert none_sum["total_work_items"] == 0
            assert "0 findings" in none_sum["summary_text"]
            assert none_sum["markdown"] == none_md

            # Explicit POST /api/v1/summary/generate.
            gen_resp = await client.post("/api/v1/summary/generate", json={"latest_only": True})
            assert gen_resp.status_code == 200
            assert gen_resp.json()["latest_only"] is True
            assert gen_resp.json()["is_stale"] is False

            # Flag one unresolved item for legal counsel and check summary regeneration.
            work_items = (await client.get("/api/v1/work-items?verification_status=INSUFFICIENT_EVIDENCE")).json()
            target_id = work_items[0]["id"]
            counsel_resp = await client.post(
                f"/api/v1/escalations/{target_id}/resolve",
                json={"action": "counsel", "assignee": "Samira Patel, GC", "reason_code": "AUDIT_SCOPE"},
            )
            assert counsel_resp.status_code == 200

            post_counsel_sum = (await client.get("/api/v1/summary")).json()
            post_counsel_md = (await client.get("/api/v1/export/summary.md")).text
            assert post_counsel_sum["escalated_legal_count"] == 1
            # Mutually exclusive buckets: ESCALATED_LEGAL moves out of unresolved into escalated_legal_count.
            assert post_counsel_sum["verified_count"] == full_sum["verified_count"]
            assert post_counsel_sum["unresolved_count"] == full_sum["unresolved_count"] - 1
            assert (
                post_counsel_sum["verified_count"]
                + post_counsel_sum["human_override_count"]
                + post_counsel_sum["escalated_legal_count"]
                + post_counsel_sum["not_applicable_count"]
                + post_counsel_sum["unresolved_count"]
            ) == post_counsel_sum["total_work_items"]
            assert "ESCALATED_LEGAL" in post_counsel_sum["summary_text"]
            assert post_counsel_sum["markdown"] == post_counsel_md

            # Undo restores escalated_legal_count to 0 and regenerates summary.
            undo_resp = await client.post(f"/api/v1/work-items/{target_id}/undo", json={"actor": "Reviewer"})
            assert undo_resp.status_code == 200
            post_undo_sum = (await client.get("/api/v1/summary")).json()
            assert post_undo_sum["escalated_legal_count"] == 0
            assert post_undo_sum["verified_count"] == full_sum["verified_count"]
    finally:
        manager.sink.remove(collect)

    async with SessionFactory() as session:
        records = list((await session.execute(select(ExecutiveSummaryRecord))).scalars().all())
    assert any(rec.is_stale is True for rec in records)
    assert any(rec.is_stale is False for rec in records)


@pytest.mark.asyncio
async def test_xlsx_export_does_not_mutate_disk_template_and_reports_escalated_legal() -> None:
    """Ensure GET /api/v1/export/questionnaire.xlsx writes to BytesIO only and exposes ESCALATED_LEGAL."""
    await startup()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        seeded = await client.post("/api/v1/demo/seed")
        assert seeded.status_code == 200

        source_file = DATA_DIR / "Enterprise_Security_Questionnaire.xlsx"
        assert source_file.is_file()
        before_bytes = source_file.read_bytes()

        unresolved = (await client.get("/api/v1/work-items?verification_status=INSUFFICIENT_EVIDENCE")).json()
        assert len(unresolved) >= 2
        legal_target = unresolved[0]

        resolve = await client.post(
            f"/api/v1/escalations/{legal_target['id']}/resolve",
            json={
                "action": "counsel",
                "assignee": "Rachel Kim, GC",
                "reason_code": "INSURANCE_GAP",
                "actor": "Reviewer",
            },
        )
        assert resolve.status_code == 200

        export_resp = await client.get("/api/v1/export/questionnaire.xlsx")
        assert export_resp.status_code == 200
        assert "BERT_Completed_Questionnaire.xlsx" in export_resp.headers["content-disposition"]

        # Original template file on disk MUST remain byte-for-byte unmutated.
        after_bytes = source_file.read_bytes()
        assert after_bytes == before_bytes

        # Inspect exported workbook bytes in memory.
        exported_wb = load_workbook(io.BytesIO(export_resp.content), read_only=True, data_only=True)
        try:
            rows = list(exported_wb.active.iter_rows(values_only=True))
        finally:
            exported_wb.close()

        header = rows[0]
        assert "AI_Response" in header
        assert "AI_Status" in header
        assert "Escalation_Assignee" in header
        assert "Escalation_Reason" in header

        status_col = header.index("AI_Status")
        assignee_col = header.index("Escalation_Assignee")
        reason_col = header.index("Escalation_Reason")

        statuses = {row[status_col] for row in rows[1:] if len(row) > status_col}
        assert {"VERIFIED", "INSUFFICIENT_EVIDENCE", "ESCALATED_LEGAL"} <= statuses

        legal_rows = [row for row in rows[1:] if len(row) > status_col and row[status_col] == "ESCALATED_LEGAL"]
        assert len(legal_rows) == 1
        assert legal_rows[0][assignee_col] == "Rachel Kim, GC"
        assert legal_rows[0][reason_col] == "INSURANCE_GAP"
