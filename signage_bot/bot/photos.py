"""Фото-поток (раздел 9 ТЗ). На пилоте фото НЕ анализируется — всегда оператору.

photo → скачать (наибольший размер) → Drive → вкладка Photos → заглушка клиенту
(id 20, вне часов + id 21) → эскалация в тему с самим изображением → mode=human.

Папка Drive + вкладка Photos = датасет для будущего vision-модуля (этап 1+).
Точка расширения: analyze_photo() перед эскалацией (роадмап).
"""

from __future__ import annotations

import io
import logging

from aiogram import Bot
from aiogram.types import Message

from .drive import Drive
from .escalation import Escalator, PhotoRef
from .kb import KnowledgeBase
from .schedule import WorkSchedule
from .sheets import Sheets
from .state import State, User

log = logging.getLogger("signage.photos")


class PhotoFlow:
    def __init__(
        self,
        bot: Bot,
        state: State,
        sheets: Sheets,
        drive: Drive,
        kb: KnowledgeBase,
        schedule: WorkSchedule,
        escalator: Escalator,
    ) -> None:
        self._bot = bot
        self._state = state
        self._sheets = sheets
        self._drive = drive
        self._kb = kb
        self._schedule = schedule
        self._escalator = escalator

    async def handle(self, message: Message, user: User) -> None:
        file_id = self._extract_file_id(message)
        if not file_id:
            return

        # 1. Скачать из Telegram (наибольший размер).
        try:
            buf = await self._bot.download(file_id, destination=io.BytesIO())
            data = buf.read() if buf else b""
        except Exception:  # noqa: BLE001
            log.exception("Не удалось скачать фото из Telegram")
            data = b""

        # 2. Загрузить в Drive → ссылка.
        drive_link = ""
        if data:
            drive_link = await self._drive.upload_photo(data, user.user_id)
        await self._state.update_user(
            user.user_id, last_photo_drive_link=drive_link or None
        )

        # 5. (сначала эскалация, чтобы получить esc_id для строки Photos)
        esc_id = await self._escalator.escalate(
            user,
            question=message.caption or "(фото без подписи)",
            reason="photo",
            photo=PhotoRef(file_id=file_id, drive_link=drive_link),
            notify_client_offhours=False,  # заметку отправим ниже сами
        )

        # 3. Строка во вкладку Photos (датасет для vision).
        await self._sheets.log_photo(
            user_id=user.user_id,
            username=user.username,
            lang=user.lang,
            address=user.address,
            telegram_file_id=file_id,
            drive_link=drive_link,
            esc_id=esc_id,
            status="new",
        )

        # 4. Клиенту — заглушка id 20; вне рабочих часов добавляем id 21.
        reply = self._kb.text(20, user.lang)
        if not self._schedule.is_working():
            note = self._kb.text(21, user.lang).replace(
                "{WORK_HOURS}", self._schedule.work_hours_text
            )
            reply = f"{reply}\n\n{note}"
        await message.answer(reply)
        await self._sheets.log_message(
            user_id=user.user_id,
            username=user.username,
            direction="out",
            message=reply,
            intent_id=20,
            mode="human",
            lang=user.lang,
        )
        # 6. mode=human уже выставлен в escalate().

    @staticmethod
    def _extract_file_id(message: Message) -> str | None:
        if message.photo:
            return message.photo[-1].file_id  # наибольший размер
        doc = message.document
        if doc and (doc.mime_type or "").startswith("image/"):
            return doc.file_id
        return None
