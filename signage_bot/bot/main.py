"""Точка входа: сборка зависимостей и запуск long-polling (aiogram 3.x)."""

from __future__ import annotations

import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from .config import load_config
from .drive import Drive, NullDrive
from .escalation import Escalator
from .handlers import operator as operator_handlers
from .handlers import user as user_handlers
from .intake import Intake
from .kb import KnowledgeBase
from .llm import LLM
from .photos import PhotoFlow
from .schedule import WorkSchedule
from .services import Services
from .sheets import NullSheets, Sheets
from .state import State


async def run() -> None:
    cfg = load_config()
    logging.basicConfig(
        level=getattr(logging, cfg.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("signage.main")

    # Каталог под SQLite.
    os.makedirs(os.path.dirname(cfg.db_path) or ".", exist_ok=True)

    bot = Bot(
        token=cfg.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

    # Внешние подключения.
    state = State(cfg.db_path)
    await state.connect()

    # Google Sheets (логи) — опционально. Без SHEET_ID работаем без логирования,
    # а KB берём из локального CSV.
    sheets_enabled = bool(cfg.sheet_id)
    if sheets_enabled:
        sheets = Sheets(cfg.google_sa_json, cfg.sheet_id)
        await sheets.connect()
        if cfg.seed_kb_if_empty:
            await sheets.seed_kb_if_empty(cfg.kb_seed_path)
    else:
        sheets = NullSheets()
        log.warning(
            "SHEET_ID не задан — логи в Google Sheets отключены, KB берётся из %s",
            cfg.kb_seed_path,
        )

    # Google Drive (фото) — опционально. Без GDRIVE_FOLDER_ID фото не грузится
    # в Drive, но всё равно уходит оператору в тему.
    drive_enabled = bool(cfg.gdrive_folder_id)
    if drive_enabled:
        drive = Drive(cfg.google_sa_json, cfg.gdrive_folder_id)
        await drive.connect()
    else:
        drive = NullDrive()
        log.warning("GDRIVE_FOLDER_ID не задан — загрузка фото в Drive отключена")

    kb = KnowledgeBase(
        sheets,
        cfg.kb_refresh_seconds,
        csv_path=cfg.kb_seed_path,
        use_csv=not sheets_enabled,
    )
    await kb.load()
    kb.start_refresh()

    llm = LLM(cfg.anthropic_api_key, cfg.anthropic_model)
    schedule = WorkSchedule(cfg)
    escalator = Escalator(
        bot, state, sheets, kb, schedule, cfg.operator_group_id
    )
    photos = PhotoFlow(bot, state, sheets, drive, kb, schedule, escalator)
    intake = Intake(state, sheets, kb)

    services = Services(
        cfg=cfg, bot=bot, state=state, sheets=sheets, drive=drive, kb=kb,
        llm=llm, schedule=schedule, escalator=escalator, photos=photos,
        intake=intake,
    )

    dp = Dispatcher()
    dp["services"] = services

    # Панель оператора живёт только в заданной супергруппе.
    operator_handlers.router.message.filter(F.chat.id == cfg.operator_group_id)
    dp.include_router(operator_handlers.router)
    dp.include_router(user_handlers.router)

    async def _on_shutdown() -> None:
        await kb.stop()
        await state.close()
        await bot.session.close()

    dp.shutdown.register(_on_shutdown)

    log.info("Бот запущен. KB-интентов для классификации: %d",
             len(kb.classifier_intents()))
    try:
        await dp.start_polling(bot)
    finally:
        await _on_shutdown()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
