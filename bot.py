"""Telegram-бот для AI Signage Pre-Check Agent.

Пользователь присылает в чат материалы заявки (текст, фото фасада/эскиза, PDF),
затем команду /analyze — бот возвращает структурированный предварительный отчёт.

Запуск:
    export TELEGRAM_BOT_TOKEN=...      # токен от @BotFather
    export ANTHROPIC_API_KEY=sk-ant-... # ключ Anthropic
    python bot.py

Бот работает на long-polling — публичный URL не нужен, запускается где угодно
(локально, Railway, Render, Replit, VPS).
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from signage_precheck import ApplicationInput, SignagePreCheckAgent
from signage_precheck.render import report_to_markdown, report_to_text

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s", level=logging.INFO
)
log = logging.getLogger("signage-bot")

TG_MAX_LEN = 4000  # лимит сообщения Telegram — 4096, берём с запасом

WELCOME = (
    "🪧 *AI Signage Pre-Check Agent*\n\n"
    "Я помогаю с *предварительной* проверкой заявок на вывески и наружную рекламу.\n"
    "Я не принимаю финальное решение — оно остаётся за сотрудником.\n\n"
    "*Как пользоваться:*\n"
    "1. Пришлите материалы заявки — можно несколькими сообщениями:\n"
    "   • текст (адрес, описание, параметры конструкции);\n"
    "   • фото фасада и эскиза вывески;\n"
    "   • PDF-документы.\n"
    "2. Отправьте /analyze — я проверю заявку и пришлю отчёт.\n\n"
    "Команды: /analyze — проверить · /reset — очистить · /help — помощь"
)


# --------------------------------------------------------------------------- #
# Работа с сессией чата (накопленные материалы)                                #
# --------------------------------------------------------------------------- #
def _session(context: ContextTypes.DEFAULT_TYPE) -> dict:
    s = context.chat_data.setdefault(
        "app", {"text": [], "images": [], "pdfs": [], "tmpdir": None}
    )
    if s["tmpdir"] is None:
        s["tmpdir"] = tempfile.mkdtemp(prefix="signage_")
    return s


def _clear_session(context: ContextTypes.DEFAULT_TYPE) -> None:
    s = context.chat_data.get("app")
    if s and s.get("tmpdir"):
        import shutil

        shutil.rmtree(s["tmpdir"], ignore_errors=True)
    context.chat_data.pop("app", None)


def _has_material(s: dict) -> bool:
    return bool(s["text"] or s["images"] or s["pdfs"])


# --------------------------------------------------------------------------- #
# Хендлеры                                                                     #
# --------------------------------------------------------------------------- #
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME, parse_mode="Markdown")


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME, parse_mode="Markdown")


async def cmd_reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    _clear_session(context)
    await update.message.reply_text("🗑 Материалы заявки очищены. Можно начинать заново.")


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    s = _session(context)
    s["text"].append(update.message.text.strip())
    await update.message.reply_text(
        "📝 Текст добавлен. Пришлите ещё материалы или отправьте /analyze."
    )


async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    s = _session(context)
    photo = update.message.photo[-1]  # наибольшее разрешение
    f = await photo.get_file()
    path = Path(s["tmpdir"]) / f"image_{len(s['images']) + 1}.jpg"
    await f.download_to_drive(str(path))
    s["images"].append(str(path))
    await update.message.reply_text(
        f"🖼 Изображение добавлено ({len(s['images'])}). "
        "Пришлите ещё или отправьте /analyze."
    )


async def on_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    s = _session(context)
    doc = update.message.document
    name = doc.file_name or "document"
    mime = (doc.mime_type or "").lower()
    f = await doc.get_file()
    path = Path(s["tmpdir"]) / name
    await f.download_to_drive(str(path))

    if mime == "application/pdf" or name.lower().endswith(".pdf"):
        s["pdfs"].append(str(path))
        kind = "PDF-документ"
    elif mime.startswith("image/") or path.suffix.lower() in {
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
    }:
        s["images"].append(str(path))
        kind = "изображение"
    else:
        await update.message.reply_text(
            "⚠️ Поддерживаются изображения (jpg/png/…) и PDF. Файл пропущен."
        )
        return

    await update.message.reply_text(
        f"📎 Добавлен {kind}. Пришлите ещё или отправьте /analyze."
    )


async def cmd_analyze(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    s = _session(context)
    if not _has_material(s):
        await update.message.reply_text(
            "Пока нет материалов. Пришлите текст, фото или PDF, затем /analyze."
        )
        return

    await update.message.chat.send_action(ChatAction.TYPING)
    status = await update.message.reply_text("🔍 Анализирую заявку…")

    app_input = ApplicationInput(
        description="\n\n".join(s["text"]),
        image_paths=list(s["images"]),
        pdf_paths=list(s["pdfs"]),
    )

    agent: SignagePreCheckAgent = context.application.bot_data["agent"]
    try:
        # agent.analyze — блокирующий вызов (сеть), уводим в поток.
        report = await asyncio.to_thread(agent.analyze, app_input)
    except Exception as e:  # noqa: BLE001
        log.exception("analyze failed")
        await status.edit_text(f"❌ Ошибка анализа: {e}")
        return

    await status.delete()
    for chunk in _split(report_to_text(report)):
        await update.message.reply_text(chunk)

    # Отдельным файлом — Markdown-версия отчёта.
    md_path = Path(s["tmpdir"]) / "report.md"
    md_path.write_text(report_to_markdown(report), encoding="utf-8")
    with open(md_path, "rb") as fh:
        await update.message.reply_document(fh, filename="signage_precheck_report.md")

    _clear_session(context)


def _split(text: str, limit: int = TG_MAX_LEN) -> list[str]:
    """Режет длинный текст на части по строкам в пределах лимита Telegram."""
    chunks: list[str] = []
    cur = ""
    for line in text.split("\n"):
        if len(cur) + len(line) + 1 > limit:
            if cur:
                chunks.append(cur)
            cur = line
        else:
            cur = f"{cur}\n{line}" if cur else line
    if cur:
        chunks.append(cur)
    return chunks or [text[:limit]]


# --------------------------------------------------------------------------- #
# Запуск                                                                       #
# --------------------------------------------------------------------------- #
def main() -> None:
    load_dotenv()

    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit(
            "Не задан TELEGRAM_BOT_TOKEN. Получите токен у @BotFather и задайте "
            "переменную окружения TELEGRAM_BOT_TOKEN."
        )
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Не задан ANTHROPIC_API_KEY.")

    # Инициализируем агента один раз (загружает базу правил).
    agent = SignagePreCheckAgent()

    app = Application.builder().token(token).build()
    app.bot_data["agent"] = agent

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("reset", cmd_reset))
    app.add_handler(CommandHandler("analyze", cmd_analyze))
    app.add_handler(MessageHandler(filters.PHOTO, on_photo))
    app.add_handler(MessageHandler(filters.Document.ALL, on_document))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    log.info("Бот запущен. Ожидаю сообщения…")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
