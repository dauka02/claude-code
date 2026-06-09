"""Состояние диалогов — SQLite (раздел 12 ТЗ).

Таблицы:
  users       — состояние клиента (режим bot/human, тема оператора, интейк)
  escalations — журнал эскалаций (open/closed)

Связка user_id ↔ topic_id — единственный источник истины для релея
сообщений между клиентом и темой оператора. Никогда не релеим в тему,
не сверившись с этой связкой.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

import aiosqlite

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id               INTEGER PRIMARY KEY,
    username              TEXT,
    lang                  TEXT DEFAULT 'ru',
    mode                  TEXT DEFAULT 'bot',          -- bot | human
    topic_id              INTEGER,
    intake_step           TEXT,
    address               TEXT,
    last_photo_drive_link TEXT,
    has_trademark         INTEGER,                     -- NULL | 0 | 1
    operator_id           INTEGER,
    last_intent_id        INTEGER,
    repeat_count          INTEGER DEFAULT 0,
    updated_at            REAL
);

CREATE TABLE IF NOT EXISTS escalations (
    esc_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    topic_id    INTEGER,
    reason      TEXT,
    status      TEXT DEFAULT 'open',                   -- open | closed
    operator_id INTEGER,
    opened_at   REAL,
    closed_at   REAL
);

CREATE INDEX IF NOT EXISTS idx_users_topic ON users(topic_id);
CREATE INDEX IF NOT EXISTS idx_esc_user ON escalations(user_id);
CREATE INDEX IF NOT EXISTS idx_esc_status ON escalations(status);
"""


@dataclass
class User:
    user_id: int
    username: str | None = None
    lang: str = "ru"
    mode: str = "bot"
    topic_id: int | None = None
    intake_step: str | None = None
    address: str | None = None
    last_photo_drive_link: str | None = None
    has_trademark: int | None = None
    operator_id: int | None = None
    last_intent_id: int | None = None
    repeat_count: int = 0
    updated_at: float = 0.0


class State:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._db: Optional[aiosqlite.Connection] = None

    async def connect(self) -> None:
        self._db = await aiosqlite.connect(self._db_path)
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(SCHEMA)
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    @property
    def db(self) -> aiosqlite.Connection:
        assert self._db is not None, "State.connect() не вызван"
        return self._db

    # ----------------------------- users ---------------------------------- #
    async def get_user(self, user_id: int) -> Optional[User]:
        cur = await self.db.execute(
            "SELECT * FROM users WHERE user_id = ?", (user_id,)
        )
        row = await cur.fetchone()
        return _row_to_user(row) if row else None

    async def get_or_create_user(
        self, user_id: int, username: str | None = None, lang: str = "ru"
    ) -> User:
        user = await self.get_user(user_id)
        if user:
            if username and username != user.username:
                await self.update_user(user_id, username=username)
                user.username = username
            return user
        await self.db.execute(
            "INSERT INTO users (user_id, username, lang, mode, updated_at) "
            "VALUES (?, ?, ?, 'bot', ?)",
            (user_id, username, lang, time.time()),
        )
        await self.db.commit()
        return User(user_id=user_id, username=username, lang=lang, mode="bot")

    async def update_user(self, user_id: int, **fields: Any) -> None:
        if not fields:
            return
        fields["updated_at"] = time.time()
        cols = ", ".join(f"{k} = ?" for k in fields)
        await self.db.execute(
            f"UPDATE users SET {cols} WHERE user_id = ?",
            (*fields.values(), user_id),
        )
        await self.db.commit()

    async def get_user_by_topic(self, topic_id: int) -> Optional[User]:
        cur = await self.db.execute(
            "SELECT * FROM users WHERE topic_id = ?", (topic_id,)
        )
        row = await cur.fetchone()
        return _row_to_user(row) if row else None

    async def set_mode(self, user_id: int, mode: str) -> None:
        await self.update_user(user_id, mode=mode)

    async def bump_repeat(self, user_id: int, intent_id: int | None) -> int:
        """Считает повтор одного и того же интента подряд. Возвращает счётчик."""
        user = await self.get_user(user_id)
        if user and user.last_intent_id == intent_id and intent_id is not None:
            count = (user.repeat_count or 0) + 1
        else:
            count = 1
        await self.update_user(
            user_id, last_intent_id=intent_id, repeat_count=count
        )
        return count

    # -------------------------- escalations -------------------------------- #
    async def open_escalation(
        self, user_id: int, topic_id: int | None, reason: str
    ) -> int:
        cur = await self.db.execute(
            "INSERT INTO escalations (user_id, topic_id, reason, status, opened_at) "
            "VALUES (?, ?, ?, 'open', ?)",
            (user_id, topic_id, reason, time.time()),
        )
        await self.db.commit()
        return cur.lastrowid or 0

    async def get_open_escalation(self, user_id: int) -> Optional[aiosqlite.Row]:
        cur = await self.db.execute(
            "SELECT * FROM escalations WHERE user_id = ? AND status = 'open' "
            "ORDER BY opened_at DESC LIMIT 1",
            (user_id,),
        )
        return await cur.fetchone()

    async def take_escalation(self, user_id: int, operator_id: int) -> None:
        await self.db.execute(
            "UPDATE escalations SET operator_id = ? "
            "WHERE user_id = ? AND status = 'open'",
            (operator_id, user_id),
        )
        await self.update_user(user_id, operator_id=operator_id)
        await self.db.commit()

    async def close_escalation(self, user_id: int) -> None:
        await self.db.execute(
            "UPDATE escalations SET status = 'closed', closed_at = ? "
            "WHERE user_id = ? AND status = 'open'",
            (time.time(), user_id),
        )
        await self.db.commit()

    async def list_open(self) -> list[aiosqlite.Row]:
        cur = await self.db.execute(
            "SELECT e.*, u.username, u.address FROM escalations e "
            "LEFT JOIN users u ON u.user_id = e.user_id "
            "WHERE e.status = 'open' ORDER BY e.opened_at ASC"
        )
        return list(await cur.fetchall())


def _row_to_user(row: aiosqlite.Row) -> User:
    return User(
        user_id=row["user_id"],
        username=row["username"],
        lang=row["lang"] or "ru",
        mode=row["mode"] or "bot",
        topic_id=row["topic_id"],
        intake_step=row["intake_step"],
        address=row["address"],
        last_photo_drive_link=row["last_photo_drive_link"],
        has_trademark=row["has_trademark"],
        operator_id=row["operator_id"],
        last_intent_id=row["last_intent_id"],
        repeat_count=row["repeat_count"] or 0,
        updated_at=row["updated_at"] or 0.0,
    )
