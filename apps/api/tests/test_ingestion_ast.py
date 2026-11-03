from __future__ import annotations

import hashlib
import json
from pathlib import Path
from uuid import uuid4

from openpyxl import Workbook, load_workbook

from bert.ingestion.json_streamer import JSONStreamer
from bert.ingestion.xlsx_handler import XLSXHandler
from bert.models.documents import NodeType


def test_json_streamer_emits_nested_json_rule_paths_and_checksum(tmp_path: Path) -> None:
    source = tmp_path / "rules.json"
    source.write_text(json.dumps({"rules": {"admin": {"action": "s3:*", "effect": "Allow"}}}), encoding="utf-8")
    result = JSONStreamer().parse(source, uuid4())
    assert result.nodes
    assert all(node.node_type is NodeType.JSON_RULE for node in result.nodes)
    assert any(node.section_path == "rules.admin.action" for node in result.nodes)
    expected = hashlib.sha256("".join(node.verbatim_text for node in result.nodes).encode()).hexdigest()
    assert result.checksum == expected


def test_json_streamer_preserves_array_indexes_in_json_paths(tmp_path: Path) -> None:
    source = tmp_path / "array-rules.json"
    source.write_text(json.dumps({"rules": [{"action": "read"}, {"action": "write"}]}), encoding="utf-8")
    result = JSONStreamer().parse(source, uuid4())
    assert [node.section_path for node in result.nodes] == ["rules[0].action", "rules[1].action"]


def test_xlsx_handler_round_trips_response_and_status_columns(tmp_path: Path) -> None:
    source = tmp_path / "questionnaire.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Question", "Scope"])
    sheet.append(["Does MFA apply?", "Access"])
    workbook.save(source)
    workbook.close()

    result = XLSXHandler().parse(source, uuid4())
    assert len(result.nodes) == 1
    assert result.nodes[0].structured_payload["row_data"]["Question"] == "Does MFA apply?"  # type: ignore[index]
    XLSXHandler.write_back(source, [{"row_index": 2, "fluent_output": "Yes.", "verification_status": "VERIFIED"}])

    written = load_workbook(source, read_only=True, data_only=True)
    row = list(written.active.iter_rows(values_only=True))[1]
    assert row[-2:] == ("Yes.", "VERIFIED")
    written.close()
