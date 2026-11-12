"""Excel questionnaire parsing and non-mutating write-back with openpyxl."""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path
from typing import Any, BinaryIO
from uuid import UUID, uuid4

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

from bert.ingestion.docling_parser import IngestionResult, ParsedNode, checksum_for_nodes
from bert.models.documents import NodeType, SourceFormat


class XLSXHandler:
    """Read every populated row and generate non-mutating response workbooks."""

    def __init__(self, *, header_row: int = 1) -> None:
        self._header_row = header_row

    def parse(self, file_path: Path, document_id: UUID) -> IngestionResult:
        nodes = list(self.stream_nodes(file_path, document_id))
        checksum = checksum_for_nodes(nodes)
        for node in nodes:
            if node.locator is not None:
                node.locator["checksum"] = checksum
        return IngestionResult(
            document_id=document_id,
            nodes=nodes,
            checksum=checksum,
            total_pages=0,
            low_confidence_crops=[],
            source_format=SourceFormat.XLSX,
        )

    def stream_nodes(self, file_path: Path, document_id: UUID | None = None) -> Iterator[ParsedNode]:
        order = 0
        doc_id_str = str(document_id) if document_id else ""
        workbook = load_workbook(str(file_path), read_only=True, data_only=True)
        try:
            for sheet_name in workbook.sheetnames:
                sheet = workbook[sheet_name]
                rows = sheet.iter_rows(values_only=True)
                headers_row = next(rows, None)
                if headers_row is None:
                    continue
                headers = [str(cell).strip() if cell is not None else f"Column_{index + 1}" for index, cell in enumerate(headers_row)]
                for row_index, row in enumerate(rows, start=self._header_row + 1):
                    values = [cell for cell in row]
                    if not any(value not in (None, "") for value in values):
                        continue
                    row_data: dict[str, Any] = {
                        headers[index] if index < len(headers) else f"Column_{index + 1}": value
                        for index, value in enumerate(values)
                    }
                    end_col = get_column_letter(max(1, len(values), len(headers)))
                    col_range = f"A{row_index}:{end_col}{row_index}"
                    text = " | ".join("" if value is None else str(value) for value in values)
                    locator = {
                        "source_type": "xlsx",
                        "doc_id": doc_id_str,
                        "sheet": sheet_name,
                        "row": row_index,
                        "col_range": col_range,
                        "node_id": str(uuid4()),
                        "checksum": "",
                    }
                    yield ParsedNode(
                        node_type=NodeType.XLSX_ROW,
                        verbatim_text=text,
                        section_path=f"{sheet_name} > Row {row_index}",
                        structured_payload={
                            "headers": headers,
                            "row_data": row_data,
                            "sheet_name": sheet_name,
                            "row_index": row_index,
                            "sheet": sheet_name,
                            "row": row_index,
                            "col_range": col_range,
                        },
                        locator=locator,
                        node_order=order,
                    )
                    order += 1
        finally:
            workbook.close()

    @staticmethod
    def build_export_bytes(
        file_path: Path,
        results: list[dict[str, Any]],
        *,
        output_column: str = "AI_Response",
        status_column: str = "AI_Status",
        assignee_column: str = "Escalation_Assignee",
        reason_column: str = "Escalation_Reason",
        sheet_name: str | None = None,
    ) -> bytes:
        """Render an answered workbook in memory without mutating `file_path`."""
        buffer = io.BytesIO()
        XLSXHandler.write_back(
            file_path,
            results,
            output_column=output_column,
            status_column=status_column,
            assignee_column=assignee_column,
            reason_column=reason_column,
            sheet_name=sheet_name,
            output=buffer,
            include_escalation_columns=True,
        )
        return buffer.getvalue()

    @staticmethod
    def write_back(
        file_path: Path,
        results: list[dict[str, Any]],
        *,
        output_column: str = "AI_Response",
        status_column: str = "AI_Status",
        assignee_column: str = "Escalation_Assignee",
        reason_column: str = "Escalation_Reason",
        sheet_name: str | None = None,
        output: Path | BinaryIO | None = None,
        include_escalation_columns: bool | None = None,
    ) -> Path | bytes:
        """Write response/status/governance columns to `output` (`BytesIO`/path) without mutating `file_path`."""
        write_escalation = include_escalation_columns if include_escalation_columns is not None else (output is not None)
        workbook = load_workbook(str(file_path))
        try:
            workbook.properties.title = "ShieldStaff Completed Questionnaire"
            workbook.properties.creator = "ShieldStaff"
            sheet = workbook[sheet_name] if sheet_name else workbook.active
            output_index = sheet.max_column + 1
            status_index = output_index + 1
            sheet.cell(row=1, column=output_index, value=output_column)
            sheet.cell(row=1, column=status_index, value=status_column)

            extra_headers = [
                ("Original_Priority", "original_priority_tier"),
                ("Effective_Priority", "effective_priority_tier"),
                ("Review_Warning", "review_warning"),
                ("Reason_Code", "reason_code"),
                ("Reviewer_Note", "reviewer_note"),
                (assignee_column, "escalation_assignee"),
                (reason_column, "escalation_reason"),
                ("Weak_Evidence", "weak_evidence_flag"),
            ]
            if write_escalation:
                for offset, (header_name, _) in enumerate(extra_headers, start=1):
                    sheet.cell(row=1, column=status_index + offset, value=header_name)

            for result in results:
                row_index = int(result["row_index"])
                sheet.cell(row=row_index, column=output_index, value=str(result.get("fluent_output", "")))
                sheet.cell(row=row_index, column=status_index, value=str(result.get("verification_status", "")))
                if write_escalation:
                    for offset, (_, key) in enumerate(extra_headers, start=1):
                        val = result.get(key)
                        if key == "weak_evidence_flag" and val is None:
                            is_weak = bool(result.get("weak_evidence"))
                            weak_reason = str(result.get("weak_evidence_reason") or "").strip()
                            val = f"YES: {weak_reason}" if (is_weak and weak_reason) else ("YES" if is_weak else "NO")
                        sheet.cell(row=row_index, column=status_index + offset, value="" if val is None else str(val))

            if output is None:
                workbook.save(str(file_path))
                return file_path
            if isinstance(output, Path):
                workbook.save(str(output))
                return output
            workbook.save(output)
            if isinstance(output, io.BytesIO):
                return output.getvalue()
            return file_path
        finally:
            workbook.close()
