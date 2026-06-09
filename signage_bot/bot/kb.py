"""Кэш базы знаний (раздел 13 ТЗ).

Загружается из вкладки KB при старте и обновляется каждые KB_REFRESH_SECONDS.
Правка KB менеджерами отражается ≤ KB_REFRESH_SECONDS (критерий приёмки 6).

Содержательные интенты для классификатора — id 3..19 (active=TRUE).
id 1,2,20,21 — служебные тексты, в классификацию не подаются.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from .sheets import Sheets

log = logging.getLogger("signage.kb")

# id, которые НЕ являются темами для классификатора (служебные).
SERVICE_IDS = {1, 2, 20, 21}


def _truthy(v) -> bool:
    return str(v).strip().lower() in {"true", "1", "yes", "да", "истина"}


@dataclass
class KBEntry:
    id: int
    topic: str
    text_ru: str
    text_kk: str
    active: bool


class KnowledgeBase:
    def __init__(self, sheets: Sheets, refresh_seconds: int) -> None:
        self._sheets = sheets
        self._refresh = refresh_seconds
        self._entries: dict[int, KBEntry] = {}
        self._task: asyncio.Task | None = None

    async def load(self) -> None:
        records = await self._sheets.read_kb()
        entries: dict[int, KBEntry] = {}
        for r in records:
            raw_id = str(r.get("id", "")).strip()
            if not raw_id.isdigit():
                continue
            entries[int(raw_id)] = KBEntry(
                id=int(raw_id),
                topic=str(r.get("topic", "")).strip(),
                text_ru=str(r.get("text_ru", "")).strip(),
                text_kk=str(r.get("text_kk", "")).strip(),
                active=_truthy(r.get("active", "")),
            )
        self._entries = entries
        log.info("KB загружена: %d записей", len(entries))

    def start_refresh(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._refresh_loop())

    async def _refresh_loop(self) -> None:
        while True:
            await asyncio.sleep(self._refresh)
            try:
                await self.load()
            except Exception:  # noqa: BLE001 — рефреш не должен ронять бота
                log.exception("Не удалось обновить KB")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None

    # ----------------------------- доступ ---------------------------------- #
    def get(self, intent_id: int) -> KBEntry | None:
        return self._entries.get(intent_id)

    def text(self, intent_id: int, lang: str) -> str:
        """Текст по интенту: KZ если есть и lang=kk, иначе RU (раздел 8)."""
        e = self._entries.get(intent_id)
        if not e:
            return ""
        if lang == "kk" and e.text_kk:
            return e.text_kk
        return e.text_ru

    def service_text(self, intent_id: int, lang: str) -> str:
        return self.text(intent_id, lang)

    def classifier_intents(self) -> list[KBEntry]:
        """Активные содержательные интенты (id 3..19) для промпта классификатора."""
        return [
            e
            for e in sorted(self._entries.values(), key=lambda x: x.id)
            if e.active and e.id not in SERVICE_IDS
        ]
