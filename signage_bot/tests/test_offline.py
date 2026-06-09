"""Оффлайн-проверки чистой логики (без Telegram/Google/Anthropic).

Запуск из каталога signage_bot:
    python -m tests.test_offline
Покрывает: язык, парсинг JSON классификатора, рабочие часы, фильтр интентов KB,
нормализацию адреса и SQLite-состояние. Сеть и секреты не требуются.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from bot.buildings import normalize_address
from bot.kb import KBEntry, KnowledgeBase, _truthy
from bot.llm import _extract_json, detect_lang_heuristic
from bot.schedule import WorkSchedule, _parse_days
from bot.state import State

PASS = 0


def check(cond: bool, msg: str) -> None:
    global PASS
    assert cond, f"FAIL: {msg}"
    PASS += 1


def test_lang() -> None:
    check(detect_lang_heuristic("Сәлеметсіз бе") == "kk", "kk by chars")
    check(detect_lang_heuristic("Здравствуйте, какие размеры?") == "ru", "ru default")
    check(detect_lang_heuristic("Hello") == "ru", "latin → ru")


def test_json() -> None:
    d = _extract_json('{"intent_id": 3, "can_answer": true, "confidence": 0.9, '
                      '"lang": "ru", "needs_data": null}')
    check(d["intent_id"] == 3 and d["can_answer"] is True, "plain json")
    fenced = '```json\n{"intent_id": null, "can_answer": false, "confidence": 0.1, ' \
             '"lang": "kk", "needs_data": "address"}\n```'
    d2 = _extract_json(fenced)
    check(d2["intent_id"] is None and d2["needs_data"] == "address", "fenced json")


def test_schedule() -> None:
    check(_parse_days("1-5") == {1, 2, 3, 4, 5}, "parse range")
    check(_parse_days("1,3,5") == {1, 3, 5}, "parse list")
    cfg = SimpleNamespace(
        timezone="Asia/Almaty", work_days="1-5", work_start="09:00",
        work_end="18:00", work_hours="Пн–Пт 09:00–18:00",
    )
    ws = WorkSchedule(cfg)
    tz = ZoneInfo("Asia/Almaty")
    check(ws.is_working(datetime(2026, 6, 8, 10, 0, tzinfo=tz)), "Mon 10:00 working")
    check(not ws.is_working(datetime(2026, 6, 8, 20, 0, tzinfo=tz)), "Mon 20:00 off")
    check(not ws.is_working(datetime(2026, 6, 13, 10, 0, tzinfo=tz)), "Sat off")


def test_kb() -> None:
    check(_truthy("TRUE") and _truthy("да") and not _truthy(""), "truthy")
    kb = KnowledgeBase(sheets=None, refresh_seconds=300)  # type: ignore[arg-type]
    kb._entries = {
        1: KBEntry(1, "greeting", "Здравствуйте", "", True),
        2: KBEntry(2, "voice", "Голос", "", True),
        3: KBEntry(3, "sizes", "Размеры 2,5 м", "", True),
        12: KBEntry(12, "out", "Вне компетенции", "", True),
        19: KBEntry(19, "ad", "Реклама", "", True),
        20: KBEntry(20, "photo", "Спасибо", "Рахмет", True),
        21: KBEntry(21, "off", "В часы {WORK_HOURS}", "", False),
    }
    ids = {e.id for e in kb.classifier_intents()}
    check(ids == {3, 12, 19}, f"classifier excludes service/inactive, got {ids}")
    check(kb.text(20, "kk") == "Рахмет", "kk text when present")
    check(kb.text(3, "kk") == "Размеры 2,5 м", "fallback to ru when kk empty")


def test_address() -> None:
    a = normalize_address("ул. Бейбитшилик, 11")
    check("бейбитшилик" in a and "ул" not in a.split(), f"normalized: {a!r}")


def test_state() -> None:
    async def _run() -> None:
        tmp = tempfile.mkdtemp()
        st = State(os.path.join(tmp, "t.db"))
        await st.connect()
        u = await st.get_or_create_user(111, "alice", "ru")
        check(u.mode == "bot", "new user bot mode")
        await st.update_user(111, topic_id=555, address="ул. Абая, 1")
        by_topic = await st.get_user_by_topic(555)
        check(by_topic and by_topic.user_id == 111, "lookup by topic")
        await st.set_mode(111, "human")
        check((await st.get_user(111)).mode == "human", "mode set human")

        esc_id = await st.open_escalation(111, 555, "cannot_answer")
        check(esc_id > 0, "escalation opened")
        await st.take_escalation(111, 999)
        opn = await st.get_open_escalation(111)
        check(opn["operator_id"] == 999, "take sets operator")
        rows = await st.list_open()
        check(len(rows) == 1, "one open escalation")
        await st.close_escalation(111)
        check(await st.get_open_escalation(111) is None, "escalation closed")

        c1 = await st.bump_repeat(111, 3)
        c2 = await st.bump_repeat(111, 3)
        c3 = await st.bump_repeat(111, 5)
        check((c1, c2, c3) == (1, 2, 1), f"repeat counter {c1,c2,c3}")
        await st.close()

    asyncio.run(_run())


def main() -> None:
    test_lang()
    test_json()
    test_schedule()
    test_kb()
    test_address()
    test_state()
    print(f"OK — пройдено проверок: {PASS}")


if __name__ == "__main__":
    main()
