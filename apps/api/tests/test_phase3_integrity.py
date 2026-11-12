"""Phase 3 integrity & verification test suite.

Covers:
1. Configurable weak-quote gate (min chars, min words, header/title-only rejection).
2. Removal of `_fact_node` `source_nodes[0]` header fallback for unmatched questions.
3. Strict state separation for `HUMAN_OVERRIDE` (`manual_correction`), `NOT_APPLICABLE` (`skip`/`not_applicable`),
   priority preservation, zero telemetry inflation, validation 422s, AuditLog & Undo.
4. Canonical `compute_work_item_metrics`, mutually exclusive buckets, `defensibility_score` cap, `GET /api/v1/metrics`,
   and parity across `ExecutiveSummaryRecord` and `summary.md`.
5. Chronos `TEMPORAL_CONFLICT` finding with dual locators (verified vs human verification when scanned).
6. XLSX export Phase 3 audit columns & review warnings without mutating the disk template.
7. Synchronous document creation on `POST /api/v1/jobs/demo`, `POST /api/v1/corpus/reset`, and SQLite migration compatibility.
"""

from __future__ import annotations

import asyncio
import io
import uuid
from datetime import date
from pathlib import Path

import httpx
import pytest
from openpyxl import Workbook, load_workbook
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import create_async_engine

import bert.main as main_module
from bert.agents.pipeline import _fact_node
from bert.api.main import app, manager, startup
from bert.models.base import SessionFactory
from bert.models.documents import (
    ASTNode,
    AuditLog,
    Document,
    NodeType,
    PriorityTier,
    ResolvedByTier,
    SourceFormat,
    VerificationStatus,
    WorkItem,
)
from bert.state import DATA_DIR
from bert.verification.citation_gate import run_verification_gate, verify_citations
from bert.verification.metrics import compute_work_item_metrics


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
        data = (await client.get(f"/api/v1/jobs/{job_id}")).json()
        if data["status"] in {"COMPLETED", "FAILED", "CANCELLED"}:
            return data
        await asyncio.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not finish")


def test_weak_quote_gate_flags_short_and_header_only_citations_and_honors_thresholds() -> None:
    """Short quotes, few words, and bare titles must gate to NEEDS_HUMAN_VERIFICATION, not VERIFIED."""
    short_quote = "MFA is required."
    short_gate = run_verification_gate([short_quote], [short_quote])
    assert short_gate.passed is False
    assert short_gate.weak_evidence is True
    assert short_gate.evidence_quality == "weak"
    assert short_gate.weak_evidence_reason is not None
    assert short_gate.verification_status is VerificationStatus.NEEDS_HUMAN_VERIFICATION

    few_words = "Multifactorauthentication policyenabled."
    few_gate = run_verification_gate([few_words], [few_words])
    assert few_gate.passed is False
    assert few_gate.weak_evidence is True
    assert few_gate.verification_status is VerificationStatus.NEEDS_HUMAN_VERIFICATION

    # Even with >= 4 words, bare title/header lines must NOT auto-verify.
    for title in ("SOC 2 Type II 2026", "Legacy Information Security Policy 2023", "Section 4.1 Overview"):
        title_gate = run_verification_gate([title], [title])
        assert title_gate.passed is False, f"Title '{title}' should be gated as weak evidence"
        assert title_gate.weak_evidence is True
        assert title_gate.evidence_quality == "weak"
        assert title_gate.verification_status is VerificationStatus.NEEDS_HUMAN_VERIFICATION

    # Custom relaxed thresholds allow shorter valid quotes to pass cleanly.
    ok, failed = verify_citations([short_quote], [short_quote], min_quote_chars=12, min_quote_words=3)
    assert ok is True
    assert failed == []

    # Empty citation list cleanly fails as missing rather than passing.
    empty_gate = run_verification_gate([], ["Some source sentence with plenty of words and detail."])
    assert empty_gate.passed is False
    assert empty_gate.verification_status is VerificationStatus.INSUFFICIENT_EVIDENCE
    assert empty_gate.evidence_quality == "missing"
    assert empty_gate.weak_evidence is False


@pytest.mark.asyncio
async def test_weak_quotes_gated_in_job_and_copilot_and_fact_node_never_falls_back_to_title() -> None:
    """Short lines become NEEDS_HUMAN_VERIFICATION (`weak_evidence=True`) and unmatched questions get `None`."""
    await startup()

    doc_id = uuid.uuid4()
    header_node = ASTNode(
        id=uuid.uuid4(),
        document_id=doc_id,
        node_type=NodeType.HEADING,
        section_path="Page 1",
        verbatim_text="SOC 2 Type II 2026",
        page_number=1,
        ocr_confidence=1.0,
        node_order=0,
    )
    strong_node = ASTNode(
        id=uuid.uuid4(),
        document_id=doc_id,
        node_type=NodeType.CLAUSE,
        section_path="Page 1",
        verbatim_text="Access control requires multifactor authentication for privileged accounts.",
        page_number=1,
        ocr_confidence=1.0,
        node_order=1,
    )
    nodes = [header_node, strong_node]
    for q in (
        "What is the effective date of the current control policy?",
        "Which data retention control is documented?",
        "Which liability and indemnification cap is documented?",
        "Which marine hull insurance deductible applies?",
    ):
        assert _fact_node(q, nodes) is None

    # Upload a text file with a short weak line + strong substantive line + an unrelated XLSX row.
    wb = Workbook()
    ws = wb.active
    ws.title = "Controls"
    ws.append(["Question", "Owner"])
    ws.append(["Does the vendor enforce MFA for privileged accounts?", "IAM"])
    ws.append(["What is the vendor submarine fleet retention period?", "Legal"])
    xlsx_buf = io.BytesIO()
    wb.save(xlsx_buf)
    wb.close()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        up_txt = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("short_policy.txt", b"SOC 2 Type II 2026\nShort MFA line\nAccess control requires multifactor authentication for privileged accounts.", "text/plain")},
        )
        assert up_txt.status_code == 200
        txt_id = up_txt.json()["id"]

        # Copilot must refuse the bare header/short quote query instead of verifying "SOC 2 Type II 2026".
        weak_chat = await client.post(
            "/api/v1/copilot/chat",
            json={"prompt": "Short MFA line", "document_id": txt_id},
        )
        assert weak_chat.status_code == 200
        assert weak_chat.json()["verification_status"] == "INSUFFICIENT_EVIDENCE"

        # Single-doc run produces DOCUMENT_FINDING items where weak lines are gated to NEEDS_HUMAN_VERIFICATION.
        start_txt = await client.post("/api/v1/jobs/start", json={"document_id": txt_id})
        assert start_txt.status_code == 200
        state_txt = await _wait_job(client, start_txt.json()["job_id"])
        assert state_txt["status"] == "COMPLETED"

        txt_items = (await client.get(f"/api/v1/work-items?document_id={txt_id}")).json()
        assert len(txt_items) == 3
        by_text = {item["structured_facts"][0]["verbatim_quote"]: item for item in txt_items}
        assert by_text["SOC 2 Type II 2026"]["verification_status"] == "NEEDS_HUMAN_VERIFICATION"
        assert by_text["SOC 2 Type II 2026"]["weak_evidence"] is True
        assert by_text["SOC 2 Type II 2026"]["evidence_quality"] == "weak"
        assert by_text["Short MFA line"]["verification_status"] == "NEEDS_HUMAN_VERIFICATION"
        assert by_text["Short MFA line"]["weak_evidence"] is True
        assert by_text["Access control requires multifactor authentication for privileged accounts."]["verification_status"] == "VERIFIED"
        assert by_text["Access control requires multifactor authentication for privileged accounts."]["weak_evidence"] is False
        assert by_text["Access control requires multifactor authentication for privileged accounts."]["evidence_quality"] == "strong"

        # Add XLSX questionnaire and run across corpus -> unmatched row cleanly fails to INSUFFICIENT_EVIDENCE.
        await client.post("/api/v1/corpus/reset")
        up_pdf = await client.post(
            "/api/v1/documents/upload",
            files={
                "file": (
                    "controls_2026.pdf",
                    _make_pdf(
                        [
                            "SOC 2 Type II 2026",
                            "Access control requires multifactor authentication for privileged accounts.",
                        ]
                    ),
                    "application/pdf",
                )
            },
        )
        assert up_pdf.status_code == 200
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
        assert up_xlsx.status_code == 200

        started = await client.post("/api/v1/jobs/start")
        assert started.status_code == 200
        state = await _wait_job(client, started.json()["job_id"])
        assert state["status"] == "COMPLETED"

        q_items = (await client.get("/api/v1/work-items")).json()
        assert len(q_items) == 2
        mfa_item = next(i for i in q_items if "MFA" in i["prompt_or_question"])
        miss_item = next(i for i in q_items if "submarine" in i["prompt_or_question"])
        assert mfa_item["verification_status"] == "VERIFIED"
        assert miss_item["verification_status"] == "INSUFFICIENT_EVIDENCE"
        assert miss_item["evidence_quality"] == "missing"
        assert miss_item["verified_citations"] == []
        assert miss_item["structured_facts"] == []


@pytest.mark.asyncio
async def test_manual_override_and_na_separation_telemetry_priority_and_undo() -> None:
    """Test HUMAN_OVERRIDE non-inflation of telemetry, NOT_APPLICABLE priority preservation, and Undo."""
    await startup()
    doc_id = uuid.uuid4()
    item_id = uuid.uuid4()
    na_item_id = uuid.uuid4()
    node_id = uuid.uuid4()
    ws_id = uuid.uuid4()

    async with SessionFactory() as session:
        session.add(
            Document(
                id=doc_id,
                workspace_id=ws_id,
                filename="sec_policy.txt",
                source_format=SourceFormat.TEXT,
                ast_checksum="a" * 64,
                total_pages=1,
                total_ast_nodes=1,
                processing_status="COMPLETED",
            )
        )
        session.add(
            WorkItem(
                id=item_id,
                workspace_id=ws_id,
                batch_id=uuid.uuid4(),
                document_id=doc_id,
                item_type="QUESTIONNAIRE_ROW",
                category="Access Control",
                priority_tier=PriorityTier.P0_CRITICAL,
                priority_score=96,
                original_priority_tier=PriorityTier.P0_CRITICAL.value,
                prompt_or_question="Are hardware tokens mandated for production root SSH?",
                fluent_output="Insufficient evidence in uploaded corpus — flagged for manual review.",
                structured_facts=[],
                verified_citations=[],
                verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE,
                resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                evidence_quality="missing",
                gate_telemetry={
                    "citation_match": 41.2,
                    "match_score": 41.2,
                    "critical_logprob": 0.77,
                    "logprob": 0.77,
                    "confidence": 0.45,
                    "failed_citations": [{"quote": "partial", "score": 41.2}],
                    "failed_logprobs": [],
                },
            )
        )
        session.add(
            WorkItem(
                id=na_item_id,
                workspace_id=ws_id,
                batch_id=uuid.uuid4(),
                document_id=doc_id,
                item_type="QUESTIONNAIRE_ROW",
                category="Data Retention",
                priority_tier=PriorityTier.P0_CRITICAL,
                priority_score=99,
                original_priority_tier=PriorityTier.P0_CRITICAL.value,
                prompt_or_question="Legacy mainframe tape encryption requirement?",
                fluent_output="Insufficient evidence in uploaded corpus — flagged for manual review.",
                structured_facts=[],
                verified_citations=[],
                verification_status=VerificationStatus.INSUFFICIENT_EVIDENCE,
                resolved_by_tier=ResolvedByTier.TIER2_SLM_REGIMENT,
                evidence_quality="missing",
            )
        )
        await session.commit()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Reject "Hello", short/2-word corrections, missing reason_code, and missing evidence support.
        for payload in (
            {"action": "manual_correction", "reason_code": "OVERRIDE", "correction": "Hello", "no_evidence_attestation": True},
            {"action": "manual_correction", "reason_code": "OVERRIDE", "correction": "Too short", "no_evidence_attestation": True},
            {"action": "manual_correction", "reason_code": "OVERRIDE", "correction": "TwoWordsOnly ValidLengthCheck", "no_evidence_attestation": True},
            {"action": "manual_correction", "correction": "Hardware YubiKey FIDO2 tokens are mandatory for SSH bastion access.", "no_evidence_attestation": True},
            {"action": "manual_correction", "reason_code": "VERIFIED_EXTERNAL", "correction": "Hardware YubiKey FIDO2 tokens are mandatory for SSH bastion access."},
            {"action": "skip"},
            {"action": "not_applicable", "note": "   "},
        ):
            r422 = await client.post(f"/api/v1/escalations/{item_id}/resolve", json=payload)
            assert r422.status_code == 422, f"Expected 422 for {payload}, got {r422.status_code}: {r422.text}"

        # Accept manual_correction with valid override_locator.
        locator_payload = {
            "source_type": "text",
            "doc_id": str(doc_id),
            "page": 1,
            "line_start": 1,
            "line_end": 1,
            "node_id": str(node_id),
            "checksum": "a" * 64,
        }
        override_resp = await client.post(
            f"/api/v1/escalations/{item_id}/resolve",
            json={
                "action": "manual_correction",
                "reason_code": "RUNBOOK_ATTESTATION",
                "correction": "Hardware YubiKey FIDO2 tokens are mandatory for all SSH bastion access.",
                "override_locator": locator_payload,
                "actor": "SecOps Lead",
                "note": "Verified in bastion runbook v4",
            },
        )
        assert override_resp.status_code == 200
        ov = override_resp.json()
        assert ov["verification_status"] == "HUMAN_OVERRIDE"
        assert ov["resolved_by_tier"] == "HUMAN_IN_THE_LOOP"
        assert ov["priority_tier"] == "P0_CRITICAL"
        assert ov["priority_score"] == 96
        assert ov["original_priority_tier"] == "P0_CRITICAL"
        assert ov["human_override_reason_code"] == "RUNBOOK_ATTESTATION"
        assert ov["no_evidence_attestation"] is False
        assert ov["override_locator"] == locator_payload
        # Telemetry scores MUST NEVER be bumped by human override!
        assert ov["gate_telemetry"]["citation_match"] == 41.2
        assert ov["gate_telemetry"]["match_score"] == 41.2
        assert ov["gate_telemetry"]["critical_logprob"] == 0.77
        assert ov["gate_telemetry"]["logprob"] == 0.77
        assert ov["gate_telemetry"]["confidence"] == 0.45

        # Accept N/A via `not_applicable`, preserving P0_CRITICAL priority_tier and score=99.
        na_resp = await client.post(
            f"/api/v1/escalations/{na_item_id}/resolve",
            json={"action": "not_applicable", "reason_code": "NO_MAINFRAME", "note": "Environment is cloud-native only.", "actor": "CISO"},
        )
        assert na_resp.status_code == 200
        na = na_resp.json()
        assert na["verification_status"] == "NOT_APPLICABLE"
        assert na["resolved_by_tier"] == "HUMAN_IN_THE_LOOP"
        assert na["priority_tier"] == "P0_CRITICAL"
        assert na["priority_score"] == 99
        assert na["original_priority_tier"] == "P0_CRITICAL"
        assert na["human_override_reason_code"] == "NO_MAINFRAME"

        # Neither HUMAN_OVERRIDE nor NOT_APPLICABLE stays in the open escalation queue.
        queue_ids = {row["work_item_id"] for row in (await client.get("/api/v1/escalations")).json()}
        assert str(item_id) not in queue_ids
        assert str(na_item_id) not in queue_ids

        # Undo restores item cleanly.
        undo_resp = await client.post(f"/api/v1/work-items/{item_id}/undo", json={"actor": "SecOps Lead"})
        assert undo_resp.status_code == 200
        restored = undo_resp.json()
        assert restored["verification_status"] == "INSUFFICIENT_EVIDENCE"
        assert restored["human_override_reason_code"] is None
        assert restored["override_locator"] is None
        assert restored["gate_telemetry"]["citation_match"] == 41.2

    async with SessionFactory() as session:
        logs = list((await session.execute(select(AuditLog).order_by(AuditLog.id))).scalars().all())
    manual_log = next(log for log in logs if log.action == "ESCALATION_MANUAL_CORRECTION")
    assert manual_log.confidence is None
    assert manual_log.metadata_json["reason_code"] == "RUNBOOK_ATTESTATION"
    assert manual_log.metadata_json["override_locator"] == locator_payload


def test_compute_work_item_metrics_exclusivity_and_defensibility_cap() -> None:
    """Unit-verify mutually exclusive metric buckets and <=99 cap whenever any P0/P1 != VERIFIED."""
    empty = compute_work_item_metrics([])
    assert empty["total"] == 0
    assert empty["defensibility_score"] is None

    # 199 verified + 1 P0_CRITICAL HUMAN_OVERRIDE -> raw ratio rounds to 100, cap MUST force 99!
    almost_perfect = [
        {"verification_status": "VERIFIED", "priority_tier": "P2_MEDIUM", "weak_evidence": False}
        for _ in range(199)
    ] + [{"verification_status": "HUMAN_OVERRIDE", "priority_tier": "P0_CRITICAL", "weak_evidence": False}]
    capped = compute_work_item_metrics(almost_perfect)
    assert capped["total"] == 200
    assert capped["machine_verified"] == 199
    assert capped["human_override"] == 1
    assert capped["defensibility_score"] == 99

    # Same with P1_HIGH NOT_APPLICABLE: still <= 99.
    na_p1 = [
        {"verification_status": "VERIFIED", "priority_tier": "P2_MEDIUM", "weak_evidence": False}
        for _ in range(199)
    ] + [{"verification_status": "NOT_APPLICABLE", "priority_tier": "P1_HIGH", "weak_evidence": False}]
    assert compute_work_item_metrics(na_p1)["defensibility_score"] == 99

    # Full 6-status mix checks strict sum invariant and critical/high open counts.
    mixed = [
        {"verification_status": "VERIFIED", "priority_tier": "P0_CRITICAL", "weak_evidence": False},
        {"verification_status": "HUMAN_OVERRIDE", "priority_tier": "P0_CRITICAL", "weak_evidence": False},
        {"verification_status": "ESCALATED_LEGAL", "priority_tier": "P0_CRITICAL", "weak_evidence": False},
        {"verification_status": "NOT_APPLICABLE", "priority_tier": "P1_HIGH", "weak_evidence": False},
        {"verification_status": "NEEDS_HUMAN_VERIFICATION", "priority_tier": "P1_HIGH", "weak_evidence": True},
        {"verification_status": "INSUFFICIENT_EVIDENCE", "priority_tier": "P2_MEDIUM", "weak_evidence": False},
    ]
    m = compute_work_item_metrics(mixed)
    assert m["total"] == 6
    assert (
        m["machine_verified"]
        + m["human_override"]
        + m["escalated_legal"]
        + m["not_applicable"]
        + m["unresolved"]
    ) == m["total"]
    assert m["machine_verified"] == 1
    assert m["human_override"] == 1
    assert m["escalated_legal"] == 1
    assert m["not_applicable"] == 1
    assert m["unresolved"] == 2
    assert m["critical_total"] == 3
    assert m["critical_open"] == 1
    assert m["high_open"] == 1
    assert m["needs_triage"] == 3
    assert m["weak_evidence_count"] == 1
    assert m["defensibility_score"] == 17


@pytest.mark.asyncio
async def test_metrics_summary_parity_chronos_scan_conflict_and_xlsx_warnings() -> None:
    """Verify `/api/v1/metrics` vs `/summary` vs `summary.md`, scan Chronos conflict, and XLSX warning columns."""
    await startup()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Empty corpus first.
        m0 = (await client.get("/api/v1/metrics")).json()
        assert m0["total"] == 0
        assert m0["defensibility_score"] is None
        s0 = (await client.get("/api/v1/summary")).json()
        assert s0["defensibility_score"] is None

        # 1. Seed demo, apply HUMAN_OVERRIDE + NOT_APPLICABLE + ESCALATED_LEGAL, check parity & XLSX.
        seeded = await client.post("/api/v1/demo/seed")
        assert seeded.status_code == 200
        assert seeded.json()["work_item_count"] == 13

        unresolved = (await client.get("/api/v1/work-items?verification_status=INSUFFICIENT_EVIDENCE")).json()
        assert len(unresolved) >= 3

        await client.post(
            f"/api/v1/escalations/{unresolved[0]['id']}/resolve",
            json={
                "action": "manual_correction",
                "reason_code": "EXT_EVIDENCE",
                "correction": "Retained for seven years inside immutable WORM archival buckets.",
                "no_evidence_attestation": True,
                "actor": "Reviewer A",
            },
        )
        await client.post(
            f"/api/v1/escalations/{unresolved[1]['id']}/resolve",
            json={
                "action": "skip",
                "reason_code": "NOT_IN_SCOPE",
                "note": "Control applies only to on-prem hardware deployments.",
                "actor": "Reviewer A",
            },
        )
        await client.post(
            f"/api/v1/escalations/{unresolved[2]['id']}/resolve",
            json={
                "action": "counsel",
                "assignee": "Elena Vance, GC",
                "reason_code": "LIABILITY_CAP",
                "note": "Need counsel review on indemnity cap.",
                "actor": "Reviewer A",
            },
        )

        metrics = (await client.get("/api/v1/metrics")).json()
        summary = (await client.get("/api/v1/summary")).json()
        md = (await client.get("/api/v1/export/summary.md")).text
        assert metrics["total"] == summary["total_work_items"] == 13
        assert metrics["machine_verified"] == summary["verified_count"] == 8
        assert metrics["human_override"] == summary["human_override_count"] == 1
        assert metrics["not_applicable"] == summary["not_applicable_count"] == 1
        assert metrics["escalated_legal"] == summary["escalated_legal_count"] == 1
        assert metrics["unresolved"] == summary["unresolved_count"] == 2
        assert metrics["defensibility_score"] == summary["defensibility_score"] == 62
        assert summary["markdown"] == md
        assert "HUMAN_OVERRIDE" in md and "NOT_APPLICABLE" in md and "ESCALATED_LEGAL" in md

        # Export XLSX and verify Phase 3 governance columns & priority preservation.
        source_file = DATA_DIR / "Enterprise_Security_Questionnaire.xlsx"
        before_disk = source_file.read_bytes()
        xlsx_resp = await client.get("/api/v1/export/questionnaire.xlsx")
        assert xlsx_resp.status_code == 200
        assert source_file.read_bytes() == before_disk

        wb = load_workbook(io.BytesIO(xlsx_resp.content), read_only=True, data_only=True)
        try:
            rows = list(wb.active.iter_rows(values_only=True))
        finally:
            wb.close()
        header = list(rows[0])
        for required_col in (
            "AI_Response",
            "AI_Status",
            "Original_Priority",
            "Effective_Priority",
            "Review_Warning",
            "Reason_Code",
            "Reviewer_Note",
            "Escalation_Assignee",
            "Escalation_Reason",
            "Weak_Evidence",
        ):
            assert required_col in header, f"Missing column {required_col} in {header}"

        status_idx = header.index("AI_Status")
        orig_p_idx = header.index("Original_Priority")
        eff_p_idx = header.index("Effective_Priority")
        warn_idx = header.index("Review_Warning")
        code_idx = header.index("Reason_Code")

        na_rows = [r for r in rows[1:] if len(r) > status_idx and r[status_idx] == "NOT_APPLICABLE"]
        ov_rows = [r for r in rows[1:] if len(r) > status_idx and r[status_idx] == "HUMAN_OVERRIDE"]
        insuff_rows = [r for r in rows[1:] if len(r) > status_idx and r[status_idx] == "INSUFFICIENT_EVIDENCE"]
        assert len(na_rows) == 1
        assert na_rows[0][orig_p_idx] == "P0_CRITICAL"
        assert na_rows[0][eff_p_idx] == "P0_CRITICAL"
        assert na_rows[0][code_idx] == "NOT_IN_SCOPE"
        assert "NOT_APPLICABLE" in (na_rows[0][warn_idx] or "")
        assert len(ov_rows) == 1
        assert ov_rows[0][code_idx] == "EXT_EVIDENCE"
        assert "HUMAN_OVERRIDE" in (ov_rows[0][warn_idx] or "")
        assert len(insuff_rows) == 2
        assert all("INSUFFICIENT_EVIDENCE" in (r[warn_idx] or "") for r in insuff_rows)

        # 2. Custom multi-doc upload where legacy PDF is a PHYSICAL_SCAN -> TEMPORAL_CONFLICT gates to NEEDS_HUMAN_VERIFICATION.
        await client.post("/api/v1/corpus/reset")
        up_new = await client.post(
            "/api/v1/documents/upload",
            files={
                "file": (
                    "InfoSec_Standard_2026.pdf",
                    _make_pdf(["Access control requires multifactor authentication for privileged accounts."]),
                    "application/pdf",
                )
            },
        )
        up_old_scan = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("Legacy_InfoSec_2023.pdf", _make_pdf(None), "application/pdf")},
        )
        assert up_new.status_code == 200 and up_old_scan.status_code == 200
        old_scan_doc = up_old_scan.json()
        assert old_scan_doc["source_format"] == "PHYSICAL_SCAN"

        job = await client.post("/api/v1/jobs/start")
        assert job.status_code == 200
        done = await _wait_job(client, job.json()["job_id"])
        assert done["status"] == "COMPLETED"

        items = (await client.get("/api/v1/work-items")).json()
        tc_items = [i for i in items if i["item_type"] == "TEMPORAL_CONFLICT"]
        assert len(tc_items) == 1
        tc = tc_items[0]
        assert tc["verification_status"] == "NEEDS_HUMAN_VERIFICATION"
        assert tc["priority_tier"] == "P1_HIGH"
        assert len(tc["verified_citations"]) == 2

        legacy_summary = (await client.get(f"/api/v1/summary?document_id={old_scan_doc['id']}")).json()
        assert legacy_summary["total_work_items"] >= 2


@pytest.mark.asyncio
async def test_jobs_demo_populates_documents_immediately_and_corpus_reset_clears_all() -> None:
    """Ensure `POST /api/v1/jobs/demo` seeds all 4 docs synchronously before background run, and `/corpus/reset` wipes cleanly."""
    await startup()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        started = await client.post("/api/v1/jobs/demo")
        assert started.status_code == 200
        job_id = started.json()["job_id"]

        # Immediately query /documents BEFORE waiting for background agents to finish.
        docs_immediate = (await client.get("/api/v1/documents")).json()
        assert len(docs_immediate) == 4
        assert {d["filename"] for d in docs_immediate} == {
            "SOC2_Type_II_2026.pdf",
            "Legacy_InfoSec_Policy_2023.pdf",
            "aws_iam_prod_config.json",
            "Enterprise_Security_Questionnaire.xlsx",
        }

        # Reset while job is active -> must cancel job and leave empty corpus cleanly.
        reset_resp = await client.post("/api/v1/corpus/reset")
        assert reset_resp.status_code == 200
        assert reset_resp.json()["status"] == "reset"
        assert reset_resp.json()["deleted_documents"] == 4
        assert (await client.get("/api/v1/documents")).json() == []
        assert (await client.get("/api/v1/work-items")).json() == []
        metrics = (await client.get("/api/v1/metrics")).json()
        assert metrics["total"] == 0
        assert metrics["defensibility_score"] is None
        job_state = (await client.get(f"/api/v1/jobs/{job_id}")).json()
        assert job_state["status"] in {"CANCELLED", "COMPLETED"}


@pytest.mark.asyncio
async def test_startup_migrates_legacy_phase2_sqlite_tables_idempotently(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify `startup()` safely upgrades a legacy Phase 2 SQLite DB missing Phase 3 columns."""
    legacy_db = tmp_path / "legacy_phase2.db"
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
                    "CREATE TABLE executive_summaries (id VARCHAR(36) PRIMARY KEY, total_work_items INTEGER NOT NULL DEFAULT 0, defensibility_score FLOAT NOT NULL)"
                )
            )

        await startup()
        await startup()  # Idempotent second run.

        async with temp_engine.connect() as conn:
            work_cols = await conn.run_sync(lambda sc: {c["name"] for c in inspect(sc).get_columns("work_items")})
            sum_cols = await conn.run_sync(lambda sc: inspect(sc).get_columns("executive_summaries"))

        assert {
            "human_override_reason_code",
            "no_evidence_attestation",
            "override_locator",
            "weak_evidence",
            "weak_evidence_reason",
            "evidence_quality",
            "temporal_conflict",
        } <= work_cols
        sum_col_map = {c["name"]: c for c in sum_cols}
        assert "human_override_count" in sum_col_map
        assert "not_applicable_count" in sum_col_map
        assert sum_col_map["defensibility_score"]["nullable"] is True
    finally:
        await temp_engine.dispose()
