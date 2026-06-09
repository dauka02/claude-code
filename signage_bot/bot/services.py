"""Контейнер зависимостей, прокидываемый в хендлеры через dp["services"]."""

from __future__ import annotations

from dataclasses import dataclass

from aiogram import Bot

from .config import Config
from .drive import Drive
from .escalation import Escalator
from .intake import Intake
from .kb import KnowledgeBase
from .llm import LLM
from .photos import PhotoFlow
from .schedule import WorkSchedule
from .sheets import Sheets
from .state import State, User


@dataclass
class Services:
    cfg: Config
    bot: Bot
    state: State
    sheets: Sheets
    drive: Drive
    kb: KnowledgeBase
    llm: LLM
    schedule: WorkSchedule
    escalator: Escalator
    photos: PhotoFlow
    intake: Intake

    async def localized(self, intent_id: int, lang: str) -> str:
        """Текст KB на нужном языке с авто-переводом RU→KZ при пустой KZ-колонке.

        Подстановка {WORK_HOURS} выполняется здесь же.
        """
        entry = self.kb.get(intent_id)
        if not entry:
            return ""
        if lang == "kk":
            if entry.text_kk:
                text = entry.text_kk
            elif self.cfg.kz_autotranslate and entry.text_ru:
                text = await self.llm.translate_ru_to_kk(entry.text_ru)
            else:
                text = entry.text_ru
        else:
            text = entry.text_ru
        return text.replace("{WORK_HOURS}", self.schedule.work_hours_text)

    async def reply_client(
        self,
        user: User,
        text: str,
        *,
        intent_id: int | None = None,
        confidence: float | None = None,
        adapted: str | None = None,
        mode: str = "bot",
    ) -> None:
        """Отправляет ответ клиенту и логирует исходящее сообщение."""
        await self.bot.send_message(user.user_id, text)
        await self.sheets.log_message(
            user_id=user.user_id,
            username=user.username,
            direction="out",
            message=text,
            intent_id=intent_id,
            confidence=confidence,
            mode=mode,
            lang=user.lang,
            adapted=adapted,
        )
