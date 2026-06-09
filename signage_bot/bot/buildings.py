"""Хук поиска по зданию (раздел 13.6, роадмап этап 3).

На пилоте вкладка Buildings пустая → всегда возвращает None. Точка расширения
для будущей точечной рекомендации по адресу без оператора.
"""

from __future__ import annotations

import re
from typing import Any

from .sheets import Sheets


def normalize_address(address: str) -> str:
    """Грубая нормализация: нижний регистр, убрать лишние пробелы/сокращения."""
    s = address.strip().lower()
    s = re.sub(r"\b(ул\.?|улица|г\.?|город|просп\.?|проспект)\b", "", s)
    s = re.sub(r"[^\w\s,]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


class Buildings:
    def __init__(self, sheets: Sheets) -> None:
        self._sheets = sheets

    async def lookup(self, address: str | None) -> dict[str, Any] | None:
        if not address:
            return None
        return await self._sheets.find_building(normalize_address(address))
