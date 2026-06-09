"""Лёгкий интейк (раздел 11 ТЗ).

Запускается при needs_data или явном намерении подать эскиз. Собирает адрес и
фото, выдаёт рекомендации по размерам (№3 + №5), фото уводит в Фото-поток
(всегда оператор). Данные пишутся во вкладку Intake. Нетиповой вопрос → эскалация.

Состояние интейка хранится в users.intake_step:
  await_address   — ждём адрес
  await_photo     — ждём фото фасада
  await_trademark — ждём ответ про товарный знак (иностранный язык, №16)
"""

from __future__ import annotations

import logging

from aiogram.types import Message

from .kb import KnowledgeBase
from .sheets import Sheets
from .state import State, User

log = logging.getLogger("signage.intake")

YES_WORDS = {"да", "есть", "иә", "бар", "yes", "имеется", "имею"}
NO_WORDS = {"нет", "жоқ", "no", "не имею", "отсутствует"}


class Intake:
    def __init__(self, state: State, sheets: Sheets, kb: KnowledgeBase) -> None:
        self._state = state
        self._sheets = sheets
        self._kb = kb

    async def ask_address(self, user: User, message: Message) -> None:
        await self._state.update_user(user.user_id, intake_step="await_address")
        text = self._kb.text(8, user.lang)
        await message.answer(text)
        await self._log_out(user, text, intent_id=8)

    async def ask_photo(self, user: User, message: Message) -> None:
        await self._state.update_user(user.user_id, intake_step="await_photo")
        text = self._kb.text(9, user.lang)
        await message.answer(text)
        await self._log_out(user, text, intent_id=9)

    async def ask_trademark(self, user: User, message: Message) -> None:
        await self._state.update_user(user.user_id, intake_step="await_trademark")
        text = self._kb.text(16, user.lang)
        await message.answer(text)
        await self._log_out(user, text, intent_id=16)

    # ------------------------ обработка ответов ---------------------------- #
    async def on_address(self, user: User, message: Message) -> None:
        address = (message.text or "").strip()
        await self._state.update_user(
            user.user_id, address=address, intake_step="await_photo"
        )
        user.address = address
        await self._sheets.log_intake(
            user_id=user.user_id,
            address=address,
            has_trademark=user.has_trademark,
            status="address_collected",
        )
        # Рекомендации по размерам (№3) + предупреждение о корректировках (№5).
        recs = self._kb.text(3, user.lang)
        corr = self._kb.text(5, user.lang)
        ask_photo = self._kb.text(9, user.lang)
        reply = f"{recs}\n\n{corr}\n\n{ask_photo}"
        await message.answer(reply)
        await self._log_out(user, reply, intent_id=3)

    async def on_trademark(self, user: User, message: Message) -> bool:
        """Возвращает True, если ответ распознан и записан, иначе False."""
        ans = (message.text or "").strip().lower()
        has = None
        if any(w in ans for w in YES_WORDS):
            has = 1
        elif any(w in ans for w in NO_WORDS):
            has = 0
        if has is None:
            return False
        await self._state.update_user(
            user.user_id, has_trademark=has, intake_step=None
        )
        user.has_trademark = has
        await self._sheets.log_intake(
            user_id=user.user_id,
            address=user.address,
            has_trademark=has,
            status="trademark_collected",
        )
        return True

    async def clear(self, user: User) -> None:
        await self._state.update_user(user.user_id, intake_step=None)

    async def _log_out(self, user: User, text: str, intent_id: int) -> None:
        await self._sheets.log_message(
            user_id=user.user_id,
            username=user.username,
            direction="out",
            message=text,
            intent_id=intent_id,
            mode="bot",
            lang=user.lang,
        )
