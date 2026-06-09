"""Google Sheets — логи, эскалации, интейк, фото, KB (раздел 13 ТЗ).

gspread синхронный, поэтому все вызовы оборачиваем в asyncio.to_thread,
чтобы не блокировать event loop aiogram.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

import gspread
from google.oauth2.service_account import Credentials

log = logging.getLogger("signage.sheets")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Имя вкладки → её заголовки (первая строка). KB не трогаем — её ведут менеджеры.
TABS: dict[str, list[str]] = {
    "KB": ["id", "topic", "text_ru", "text_kk", "active"],
    "Log": [
        "timestamp", "user_id", "username", "direction", "message",
        "intent_id", "confidence", "mode", "lang", "operator_id", "adapted",
    ],
    "Escalations": [
        "esc_id", "timestamp_open", "user_id", "username", "question",
        "reason", "status", "operator_id", "timestamp_close", "response",
    ],
    "Intake": ["timestamp", "user_id", "address", "has_trademark", "status"],
    "Photos": [
        "timestamp", "user_id", "username", "lang", "address",
        "telegram_file_id", "drive_link", "esc_id", "status",
    ],
    "Buildings": [
        "address", "district", "street", "concept_status", "concept_link",
        "recommended_sizes", "notes", "updated_at",
    ],
}


def _ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


class Sheets:
    def __init__(self, sa_json_path: str, sheet_id: str) -> None:
        self._sa_path = sa_json_path
        self._sheet_id = sheet_id
        self._gc: Optional[gspread.Client] = None
        self._ss: Optional[gspread.Spreadsheet] = None
        self._ws: dict[str, gspread.Worksheet] = {}
        self._lock = asyncio.Lock()

    # --------------------------- подключение ------------------------------- #
    async def connect(self) -> None:
        await asyncio.to_thread(self._connect_sync)

    def _connect_sync(self) -> None:
        creds = Credentials.from_service_account_file(self._sa_path, scopes=SCOPES)
        self._gc = gspread.authorize(creds)
        self._ss = self._gc.open_by_key(self._sheet_id)
        existing = {w.title: w for w in self._ss.worksheets()}
        for title, headers in TABS.items():
            ws = existing.get(title)
            if ws is None:
                ws = self._ss.add_worksheet(
                    title=title, rows=1000, cols=max(len(headers), 8)
                )
                ws.update("A1", [headers])
                log.info("Создана вкладка %s", title)
            else:
                # Гарантируем заголовки в первой строке (кроме KB — её ведут вручную).
                if title != "KB":
                    first = ws.row_values(1)
                    if first != headers:
                        ws.update("A1", [headers])
            self._ws[title] = ws

    def _sheet(self, title: str) -> gspread.Worksheet:
        ws = self._ws.get(title)
        if ws is None:
            raise RuntimeError(f"Вкладка {title} не инициализирована")
        return ws

    # ------------------------------- KB ------------------------------------ #
    async def read_kb(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(lambda: self._sheet("KB").get_all_records())

    # ------------------------------ запись --------------------------------- #
    async def _append(self, title: str, row: list[Any]) -> None:
        async with self._lock:
            try:
                await asyncio.to_thread(
                    self._sheet(title).append_row,
                    row,
                    value_input_option="USER_ENTERED",
                )
            except Exception:  # noqa: BLE001 — лог не должен ронять бота
                log.exception("append_row в %s не удался", title)

    async def log_message(
        self,
        *,
        user_id: int,
        username: str | None,
        direction: str,            # in | out
        message: str,
        intent_id: int | None = None,
        confidence: float | None = None,
        mode: str = "bot",
        lang: str = "ru",
        operator_id: int | None = None,
        adapted: str | None = None,
    ) -> None:
        await self._append(
            "Log",
            [
                _ts(), user_id, username or "", direction, message,
                intent_id if intent_id is not None else "",
                round(confidence, 3) if confidence is not None else "",
                mode, lang, operator_id or "", adapted or "",
            ],
        )

    async def log_escalation(
        self,
        *,
        esc_id: int,
        user_id: int,
        username: str | None,
        question: str,
        reason: str,
        operator_id: int | None = None,
    ) -> None:
        await self._append(
            "Escalations",
            [
                esc_id, _ts(), user_id, username or "", question, reason,
                "open", operator_id or "", "", "",
            ],
        )

    async def close_escalation_row(
        self, esc_id: int, operator_id: int | None, response: str
    ) -> None:
        """Обновляет статус/время закрытия эскалации по esc_id (поиск в колонке A)."""
        async with self._lock:
            try:
                await asyncio.to_thread(
                    self._close_escalation_sync, esc_id, operator_id, response
                )
            except Exception:  # noqa: BLE001
                log.exception("close_escalation_row(%s) не удался", esc_id)

    def _close_escalation_sync(
        self, esc_id: int, operator_id: int | None, response: str
    ) -> None:
        ws = self._sheet("Escalations")
        cell = ws.find(str(esc_id), in_column=1)
        if not cell:
            return
        row = cell.row
        ws.update_cell(row, 7, "closed")               # status
        if operator_id:
            ws.update_cell(row, 8, operator_id)        # operator_id
        ws.update_cell(row, 9, _ts())                  # timestamp_close
        if response:
            ws.update_cell(row, 10, response)          # response

    async def log_intake(
        self, *, user_id: int, address: str | None,
        has_trademark: int | None, status: str
    ) -> None:
        tm = "" if has_trademark is None else ("да" if has_trademark else "нет")
        await self._append(
            "Intake", [_ts(), user_id, address or "", tm, status]
        )

    async def log_photo(
        self,
        *,
        user_id: int,
        username: str | None,
        lang: str,
        address: str | None,
        telegram_file_id: str,
        drive_link: str,
        esc_id: int | None,
        status: str = "new",
    ) -> None:
        await self._append(
            "Photos",
            [
                _ts(), user_id, username or "", lang, address or "",
                telegram_file_id, drive_link, esc_id or "", status,
            ],
        )

    # ---------------------------- Buildings -------------------------------- #
    async def find_building(self, normalized_address: str) -> dict[str, Any] | None:
        """Хук поиска по адресу. На пилоте вкладка пустая → вернёт None."""
        try:
            rows = await asyncio.to_thread(
                lambda: self._sheet("Buildings").get_all_records()
            )
        except Exception:  # noqa: BLE001
            return None
        for row in rows:
            addr = str(row.get("address", "")).strip().lower()
            if addr and addr == normalized_address.strip().lower():
                return row
        return None
