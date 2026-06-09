"""Панель оператора — темы и релей (раздел 10 ТЗ).

Команды:
  в теме клиента — /take, /close
  в общем чате   — /list, /takeover <user_id>

Любое прочее сообщение оператора в теме клиента → релеится клиенту (бот —
прозрачный посредник). Связка topic_id ↔ user_id берётся из SQLite.
"""

from __future__ import annotations

import logging
import time

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandObject
from aiogram.types import Message

from ..services import Services

log = logging.getLogger("signage.operator")

router = Router(name="operator")

# Последний ответ оператора по user_id — для колонки response при /close.
_last_response: dict[int, str] = {}


def _age(seconds: float) -> str:
    s = int(time.time() - seconds)
    if s < 60:
        return f"{s} сек"
    if s < 3600:
        return f"{s // 60} мин"
    return f"{s // 3600} ч {s % 3600 // 60} мин"


def _op_tag(message: Message) -> str:
    u = message.from_user
    return f"@{u.username}" if u and u.username else (u.full_name if u else "оператор")


# ------------------------------ /take -------------------------------------- #
@router.message(Command("take"))
async def cmd_take(message: Message, services: Services) -> None:
    topic_id = message.message_thread_id
    user = await services.state.get_user_by_topic(topic_id) if topic_id else None
    if not user:
        await message.reply("Команда /take работает внутри темы клиента.")
        return
    await services.state.take_escalation(user.user_id, message.from_user.id)
    await message.reply(f"✅ Обращение ведёт {_op_tag(message)}")


# ------------------------------ /close ------------------------------------- #
@router.message(Command("close"))
async def cmd_close(message: Message, services: Services) -> None:
    topic_id = message.message_thread_id
    user = await services.state.get_user_by_topic(topic_id) if topic_id else None
    if not user:
        await message.reply("Команда /close работает внутри темы клиента.")
        return

    # esc_id берём ДО закрытия — после close_escalation открытой строки не будет.
    esc_id = await _open_esc_id(services, user.user_id)
    await services.state.set_mode(user.user_id, "bot")
    await services.state.update_user(user.user_id, operator_id=None)
    await services.state.close_escalation(user.user_id)
    await services.sheets.close_escalation_row(
        esc_id=esc_id,
        operator_id=message.from_user.id,
        response=_last_response.pop(user.user_id, ""),
    )

    # Клиенту — опциональное уведомление о закрытии.
    try:
        closed_note = (
            "Обращение закрыто, спасибо за обращение."
            if user.lang == "ru"
            else "Өтінішіңіз жабылды, хабарласқаныңызға рахмет."
        )
        await services.bot.send_message(user.user_id, closed_note)
    except TelegramBadRequest:
        pass

    await message.reply("☑️ Обращение закрыто, клиент снова на боте.")
    try:
        await services.bot.close_forum_topic(
            services.cfg.operator_group_id, topic_id
        )
    except TelegramBadRequest:
        pass


# ------------------------------ /list -------------------------------------- #
@router.message(Command("list"))
async def cmd_list(message: Message, services: Services) -> None:
    rows = await services.state.list_open()
    if not rows:
        await message.reply("Открытых обращений нет.")
        return
    lines = ["<b>Открытые обращения:</b>"]
    for r in rows:
        who = ("@" + r["username"]) if r["username"] else f"id{r['user_id']}"
        op = f" · ведёт {r['operator_id']}" if r["operator_id"] else " · не взято"
        lines.append(
            f"• {who} · {r['address'] or '—'} · ждёт {_age(r['opened_at'])}{op}"
        )
    await message.reply("\n".join(lines))


# ---------------------------- /takeover ------------------------------------ #
@router.message(Command("takeover"))
async def cmd_takeover(
    message: Message, command: CommandObject, services: Services
) -> None:
    arg = (command.args or "").strip().lstrip("#")
    if not arg.isdigit():
        await message.reply("Использование: /takeover <user_id>")
        return
    user_id = int(arg)
    user = await services.state.get_user(user_id)
    if not user:
        await message.reply(f"Клиент {user_id} не найден в базе состояний.")
        return
    await services.escalator.escalate(
        user, question="(ручное подключение оператора)", reason="manual_takeover"
    )
    await services.state.take_escalation(user_id, message.from_user.id)
    await message.reply(f"✅ Вы подключились к клиенту {user_id}.")


# ------------------------- релей оператор→клиент --------------------------- #
@router.message(F.is_topic_message & (F.text | F.photo))
async def relay_to_client(message: Message, services: Services) -> None:
    # Команды уже обработаны выше; пустые тексты-команды пропускаем.
    if message.text and message.text.startswith("/"):
        return
    topic_id = message.message_thread_id
    user = await services.state.get_user_by_topic(topic_id) if topic_id else None
    if not user:
        return  # тема без привязки (например, General) — игнор
    if user.mode != "human":
        await message.reply("Обращение закрыто. Используйте /takeover для повторного подключения.")
        return

    # Коллизия: пишет не тот, кто взял обращение.
    esc = await services.state.get_open_escalation(user.user_id)
    if esc and esc["operator_id"] and esc["operator_id"] != message.from_user.id:
        await message.reply(f"⚠️ Обращение ведёт оператор {esc['operator_id']}.")

    prefix = services.cfg.operator_relay_prefix
    try:
        if message.photo:
            cap = (prefix + " " if prefix else "") + (message.caption or "")
            await services.bot.send_photo(
                user.user_id, message.photo[-1].file_id, caption=cap.strip() or None
            )
            _last_response[user.user_id] = message.caption or "[фото]"
        else:
            body = (prefix + "\n" if prefix else "") + message.text
            await services.bot.send_message(user.user_id, body)
            _last_response[user.user_id] = message.text
    except TelegramBadRequest:
        await message.reply("⚠️ Не удалось доставить сообщение клиенту.")
        return

    await services.sheets.log_message(
        user_id=user.user_id, username=user.username, direction="out",
        message=message.caption or message.text or "[медиа]",
        mode="human", lang=user.lang, operator_id=message.from_user.id,
    )


async def _open_esc_id(services: Services, user_id: int) -> int:
    esc = await services.state.get_open_escalation(user_id)
    return esc["esc_id"] if esc else 0
