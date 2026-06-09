"""Рабочие часы бота (раздел 15 ТЗ).

ВАЖНО: это рабочие часы Центра/бота (когда оператор у панели), а НЕ часы
приёма/выдачи эскизов Управления из базы знаний (id 4). Это разные сущности,
их нельзя путать.
"""

from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

from .config import Config


def _parse_time(s: str, default: time) -> time:
    try:
        hh, mm = s.split(":")
        return time(int(hh), int(mm))
    except (ValueError, AttributeError):
        return default


def _parse_days(s: str) -> set[int]:
    """`WORK_DAYS` вида "1-5" или "1,2,3" → множество ISO-дней (Пн=1..Вс=7)."""
    days: set[int] = set()
    for part in (s or "").replace(" ", "").split(","):
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            if a.isdigit() and b.isdigit():
                days.update(range(int(a), int(b) + 1))
        elif part.isdigit():
            days.add(int(part))
    return days or {1, 2, 3, 4, 5}


class WorkSchedule:
    def __init__(self, cfg: Config) -> None:
        self._tz = ZoneInfo(cfg.timezone)
        self._days = _parse_days(cfg.work_days)
        self._start = _parse_time(cfg.work_start, time(9, 0))
        self._end = _parse_time(cfg.work_end, time(18, 0))
        self.work_hours_text = cfg.work_hours

    def now(self) -> datetime:
        return datetime.now(self._tz)

    def is_working(self, moment: datetime | None = None) -> bool:
        m = moment or self.now()
        if m.tzinfo is None:
            m = m.replace(tzinfo=self._tz)
        if m.isoweekday() not in self._days:
            return False
        return self._start <= m.time() <= self._end
