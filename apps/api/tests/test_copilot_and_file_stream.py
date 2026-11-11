from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from pypdf import PdfReader

from bert.api.main import app, startup
from bert.main import _write_demo_fixtures


@pytest.mark.asyncio
async def test_document_file_stream_returns_binary_pdf_and_json() -> None:
    await startup()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        seeded = await client.post("/api/v1/demo/seed")
        assert seeded.status_code == 200
        documents = (await client.get("/api/v1/documents")).json()
        pdf = next(document for document in documents if document["filename"] == "SOC2_Type_II_2026.pdf")
        config = next(document for document in documents if document["filename"] == "aws_iam_prod_config.json")

        pdf_response = await client.get(f"/api/v1/documents/{pdf['id']}/file")
        assert pdf_response.status_code == 200
        assert pdf_response.content.startswith(b"%PDF-")
        assert pdf_response.headers["content-type"] == "application/pdf"
        assert pdf_response.headers["content-disposition"] == 'inline; filename="SOC2_Type_II_2026.pdf"'

        config_response = await client.get(f"/api/v1/documents/{config['id']}/file")
        assert config_response.status_code == 200
        assert config_response.json()["owner"] == "Platform Security"


@pytest.mark.asyncio
async def test_copilot_verifies_known_policy_and_hard_fails_unknown_question() -> None:
    await startup()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/v1/demo/seed")
        documents = (await client.get("/api/v1/documents")).json()
        policy = next(document for document in documents if document["filename"] == "SOC2_Type_II_2026.pdf")

        verified = await client.post(
            "/api/v1/copilot/chat",
            json={"prompt": "Does the company enforce MFA for privileged accounts?", "document_id": policy["id"]},
        )
        assert verified.status_code == 200
        verified_payload = verified.json()
        assert verified_payload["verification_status"] == "VERIFIED"
        assert verified_payload["match_score"] >= 97.0
        assert "multifactor authentication" in verified_payload["answer"]
        assert "[SOC2_Type_II_2026.pdf:1]" in verified_payload["answer"]
        assert verified_payload["citations"][0]["bounding_box"]["x1"] <= 612

        insufficient = await client.post(
            "/api/v1/copilot/chat",
            json={"prompt": "What is the vendor cyber insurance limit?", "document_id": policy["id"]},
        )
        assert insufficient.status_code == 200
        assert insufficient.json() == {
            "answer": "Insufficient evidence in uploaded corpus — flagged for manual review.",
            "verification_status": "INSUFFICIENT_EVIDENCE",
            "match_score": 0.0,
            "citations": [],
        }


def test_write_demo_fixtures_creates_readable_binary_pdfs() -> None:
    fixtures = _write_demo_fixtures()
    pdf_paths = [path for _, source_format, path in fixtures if source_format.value == "DIGITAL_PDF"]
    assert len(pdf_paths) == 2
    for path in pdf_paths:
        assert Path(path).read_bytes().startswith(b"%PDF-1.4")
        reader = PdfReader(str(path))
        assert reader.pages
        assert tuple(float(value) for value in reader.pages[0].mediabox) == (0.0, 0.0, 612.0, 792.0)
        assert reader.pages[0].extract_text().strip()
