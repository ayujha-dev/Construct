"""Excel questionnaire parsing and write-back with openpyxl."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import UUID

from openpyxl import load_workbook

from bert.ingestion.docling_parser import IngestionResult, ParsedNode, checksum_for_nodes
from bert.models.documents import NodeType


class XLSXHandler:
    """Read every populated row and append deterministic response columns."""

    def __init__(self, *, header_row: int = 1) -> None:
        self._header_row = header_row

    def parse(self, file_path: Path, document_id: UUID) -> IngestionResult:
        nodes = list(self.stream_nodes(file_path))
        return IngestionResult(
            document_id=document_id,
            nodes=nodes,
            checksum=checksum_for_nodes(nodes),
            total_pages=0,
            low_confidence_crops=[],
        )

    def stream_nodes(self, file_path: Path) -> Iterator[ParsedNode]:
        order = 0
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
                    text = " | ".join("" if value is None else str(value) for value in values)
                    yield ParsedNode(
                        node_type=NodeType.XLSX_ROW,
                        verbatim_text=text,
                        section_path=f"{sheet_name} > Row {row_index}",
                        structured_payload={
                            "headers": headers,
                            "row_data": row_data,
                            "sheet_name": sheet_name,
                            "row_index": row_index,
                        },
                        node_order=order,
                    )
                    order += 1
        finally:
            workbook.close()

    @staticmethod
    def write_back(
        file_path: Path,
        results: list[dict[str, Any]],
        *,
        output_column: str = "AI_Response",
        status_column: str = "AI_Status",
        sheet_name: str | None = None,
    ) -> Path:
        workbook = load_workbook(str(file_path))
        try:
            sheet = workbook[sheet_name] if sheet_name else workbook.active
            output_index = sheet.max_column + 1
            status_index = output_index + 1
            sheet.cell(row=1, column=output_index, value=output_column)
            sheet.cell(row=1, column=status_index, value=status_column)
            for result in results:
                row_index = int(result["row_index"])
                sheet.cell(row=row_index, column=output_index, value=str(result.get("fluent_output", "")))
                sheet.cell(row=row_index, column=status_index, value=str(result.get("verification_status", "")))
            workbook.save(str(file_path))
        finally:
            workbook.close()
        return file_path
