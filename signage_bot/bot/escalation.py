"""Эскалация и панель оператора (раздел 10 ТЗ).

Модель «одна тема = один клиент»: первая эскалация создаёт Тему в супергруппе,
связка user_id ↔ topic_id хранится в SQLite, повторные обращения переиспользуют
ту же тему. Бот — прозрачный посредник между клиентом и темой.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest

from .kb import KnowledgeBase
from .schedule import WorkSchedule
from .sheets import Sheets
from .state import State, User

log = logging.getLogger("signage.escalation")


@dataclass
class PhotoRef:
    file_id: str
    drive_link: str


# Человекочитаемые причины эскалации для карточки.
REASONS = {
    "low_confidence": "низкая уверенность классификатора",
    "cannot_answer": "вопрос вне базы знаний",
    "always_escalate": "интент требует оператора",
    "human_requested": "клиент просит человека",
    "repeat": "повторный одинаковый вопрос",
    "photo": "получено фото/эскиз",
    "non_typical_intake": "нетиповой вопрос при подаче эскиза",
    "manual_takeover": "ручное подключение оператора",
}


class Escalator:
    def __init__(
        self,
        bot: Bot,
        state: State,
        sheets: Sheets,
        kb: KnowledgeBase,
        schedule: WorkSchedule,
        group_id: int,
    ) -> None:
        self._bot = bot
        self._state = state
        self._sheets = sheets
        self._kb = kb
        self._schedule = schedule
        self._group_id = group_id

    # ------------------------- управление темой ---------------------------- #
    async def ensure_topic(self, user: User) -> int:
        if user.topic_id:
            # Переоткрыть, если была закрыта/архивирована.
            try:
                await self._bot.reopen_forum_topic(
                    self._group_id, user.topic_id
                )
            except TelegramBadRequest:
                pass  # уже открыта или ничего страшного
            return user.topic_id

        name = user.username or f"id{user.user_id}"
        title = f"{name} · {user.address or '—'} · #{user.user_id}"[:128]
        topic = await self._bot.create_forum_topic(self._group_id, name=title)
        topic_id = topic.message_thread_id
        await self._state.update_user(user.user_id, topic_id=topic_id)
        user.topic_id = topic_id
        return topic_id

    # ----------------------------- эскалация ------------------------------- #
    async def escalate(
        self,
        user: User,
        question: str,
        reason: str,
        photo: PhotoRef | None = None,
        notify_client_offhours: bool = True,
    ) -> int:
        """Создаёт/переоткрывает тему, публикует карточку (+ фото), ставит human.

        Возвращает esc_id. Клиентский ответ здесь НЕ отправляется, кроме
        заметки о приёмном времени вне рабочих часов (критерий приёмки 5).
        """
        topic_id = await self.ensure_topic(user)
        await self._state.set_mode(user.user_id, "human")
        esc_id = await self._state.open_escalation(
            user.user_id, topic_id, reason
        )
        await self._sheets.log_escalation(
            esc_id=esc_id,
            user_id=user.user_id,
            username=user.username,
            question=question,
            reason=REASONS.get(reason, reason),
        )

        reason_text = REASONS.get(reason, reason)
        card = (
            "🆕 <b>Новое обращение</b>\n"
            f"Причина: {reason_text}\n"
            f"Язык: {user.lang}\n"
            f"Адрес: {user.address or '—'}\n"
            f"Клиент: {('@' + user.username) if user.username else user.user_id}\n"
            f"\n<b>Вопрос:</b>\n{question or '—'}\n"
            f"\nКоманды: /take — взять · /close — закрыть"
        )
        try:
            await self._bot.send_message(
                self._group_id, card, message_thread_id=topic_id
            )
        except TelegramBadRequest:
            log.exception("Не удалось отправить карточку в тему %s", topic_id)

        # Эскиз/фото отдельным сообщением — само изображение + ссылка Drive.
        if photo and photo.file_id:
            caption = "🖼 Эскиз/фото клиента"
            if photo.drive_link:
                caption += f"\nDrive: {photo.drive_link}"
            try:
                await self._bot.send_photo(
                    self._group_id,
                    photo.file_id,
                    caption=caption,
                    message_thread_id=topic_id,
                )
            except TelegramBadRequest:
                log.exception("Не удалось отправить фото в тему %s", topic_id)

        # Вне рабочих часов — заметка клиенту о приёмном времени.
        if notify_client_offhours and not self._schedule.is_working():
            note = self._kb.text(21, user.lang).replace(
                "{WORK_HOURS}", self._schedule.work_hours_text
            )
            try:
                await self._bot.send_message(user.user_id, note)
                await self._sheets.log_message(
                    user_id=user.user_id,
                    username=user.username,
                    direction="out",
                    message=note,
                    intent_id=21,
                    mode="human",
                    lang=user.lang,
                )
            except TelegramBadRequest:
                pass

        return esc_id
