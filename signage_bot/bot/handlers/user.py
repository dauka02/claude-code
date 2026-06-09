"""Хендлеры сообщений предпринимателей — основной поток (раздел 4 ТЗ).

Порядок проверок критичен:
  1. тип сообщения (voice/photo/text)
  2. состояние (mode=human → молчим, релеим в тему; mode=bot → дальше)
  3. интейк в процессе?
  4. классификатор → решение (ответ из KB либо эскалация)
"""

from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from ..llm import detect_lang_heuristic
from ..services import Services
from ..state import User

log = logging.getLogger("signage.user")

router = Router(name="user")
# Только личные чаты с ботом — групповые сообщения обрабатывает operator-роутер.
router.message.filter(F.chat.type == "private")

# Слова-маркеры явной просьбы о человеке (раздел 19).
HUMAN_WORDS = {"оператор", "человек", "специалист", "менеджер", "живой", "сотрудник"}


async def _get_user(message: Message, services: Services) -> User:
    return await services.state.get_or_create_user(
        message.from_user.id,
        username=message.from_user.username,
    )


# ------------------------------- команды ----------------------------------- #
@router.message(CommandStart())
async def on_start(message: Message, services: Services) -> None:
    user = await _get_user(message, services)
    if user.mode == "human":
        await _relay_to_topic(message, services, user)
        return
    text = await services.localized(1, user.lang)
    await services.reply_client(user, text, intent_id=1)


# ------------------------- голос/аудио/видео ------------------------------- #
@router.message(F.voice | F.audio | F.video_note)
async def on_voice(message: Message, services: Services) -> None:
    user = await _get_user(message, services)
    if user.mode == "human":
        await _relay_to_topic(message, services, user)
        return
    # Язык известен → на нём; неизвестен (первое касание) → RU + KZ.
    known_lang = user.last_intent_id is not None
    if known_lang:
        text = await services.localized(2, user.lang)
    else:
        ru = await services.localized(2, "ru")
        kk = await services.localized(2, "kk")
        text = ru if ru == kk else f"{ru}\n\n{kk}"
    await services.reply_client(user, text, intent_id=2)
    await services.sheets.log_message(
        user_id=user.user_id, username=user.username, direction="in",
        message="[voice/audio]", mode=user.mode, lang=user.lang,
    )


# ------------------------------- фото -------------------------------------- #
@router.message(F.photo | (F.document & F.document.mime_type.startswith("image/")))
async def on_photo(message: Message, services: Services) -> None:
    user = await _get_user(message, services)
    await services.sheets.log_message(
        user_id=user.user_id, username=user.username, direction="in",
        message="[photo]" + (f" {message.caption}" if message.caption else ""),
        mode=user.mode, lang=user.lang,
    )
    # Любое фото → Фото-поток → всегда оператор (даже в mode=human уместно: фото
    # попадёт в ту же тему). Фото-поток сам выставит human и зашлёт в тему.
    await services.photos.handle(message, user)


# ------------------------------- текст ------------------------------------- #
@router.message(F.text)
async def on_text(message: Message, services: Services) -> None:
    user = await _get_user(message, services)
    text = message.text.strip()

    await services.sheets.log_message(
        user_id=user.user_id, username=user.username, direction="in",
        message=text, mode=user.mode, lang=user.lang,
    )

    # 2. Режим human → бот молчит для клиента, релеит в тему оператора.
    if user.mode == "human":
        await _relay_to_topic(message, services, user)
        return

    # 3. Интейк в процессе.
    if user.intake_step == "await_address":
        await services.intake.on_address(user, message)
        return
    if user.intake_step == "await_trademark":
        recognized = await services.intake.on_trademark(user, message)
        if recognized:
            # Иностранный язык/товарный знак — специфичный случай → оператор.
            await services.escalator.escalate(
                user, question=text, reason="non_typical_intake"
            )
        else:
            await services.intake.ask_trademark(user, message)
        return
    if user.intake_step == "await_photo":
        # Ждали фото, пришёл текст — выходим из интейка и классифицируем заново.
        await services.intake.clear(user)
        user.intake_step = None

    # Явная просьба о человеке → сразу эскалация.
    if any(w in text.lower() for w in HUMAN_WORDS):
        user.lang = detect_lang_heuristic(text)
        await services.state.update_user(user.user_id, lang=user.lang)
        await services.escalator.escalate(user, question=text, reason="human_requested")
        return

    # 3'. Классификатор (call #1).
    intents = services.kb.classifier_intents()
    cls = await services.llm.classify(text, intents)

    # Зафиксировать язык обращения.
    if cls.lang != user.lang:
        user.lang = cls.lang
        await services.state.update_user(user.user_id, lang=cls.lang)

    # Повтор одного и того же вопроса → эскалация (раздел 19).
    repeat = await services.state.bump_repeat(user.user_id, cls.intent_id)

    cfg = services.cfg
    # 4. Решение.
    if cls.intent_id in cfg.always_escalate_intents:
        await services.escalator.escalate(user, question=text, reason="always_escalate")
        return

    if cls.can_answer and cls.confidence >= cfg.confidence_threshold:
        # Повтор одного вопроса много раз подряд → эскалация (защита от зацикливания).
        # Порог 3: на повторную/переформулированную просьбу бот всё ещё отвечает.
        if repeat >= 3:
            await services.escalator.escalate(user, question=text, reason="repeat")
            return
        kb_text = services.kb.text(cls.intent_id, user.lang)
        if not kb_text:
            await services.escalator.escalate(
                user, question=text, reason="cannot_answer"
            )
            return
        adapted = await services.llm.adapt(kb_text, user.lang, text)
        await services.reply_client(
            user, adapted, intent_id=cls.intent_id,
            confidence=cls.confidence, adapted=adapted,
        )
        return

    # Не уверены, но нужны данные → лёгкий интейк вместо эскалации.
    if cls.needs_data == "address" and not user.address:
        await services.intake.ask_address(user, message)
        return
    if cls.needs_data == "facade_photo":
        await services.intake.ask_photo(user, message)
        return
    if cls.needs_data == "trademark":
        await services.intake.ask_trademark(user, message)
        return

    # Иначе — эскалация (раздел 3: лучше переэскалировать).
    reason = "low_confidence" if cls.intent_id else "cannot_answer"
    await services.escalator.escalate(user, question=text, reason=reason)


# --------------------------- релей в тему ---------------------------------- #
async def _relay_to_topic(message: Message, services: Services, user: User) -> None:
    """В режиме human клиентские сообщения публикуются в тему оператора."""
    gid = services.cfg.operator_group_id
    # Если темы нет (не удалось создать) — релеим в общий чат группы, без зацикливания.
    kwargs = {"message_thread_id": user.topic_id} if user.topic_id else {}
    try:
        if message.photo:
            await services.bot.send_photo(
                gid, message.photo[-1].file_id,
                caption=f"👤 Клиент: {message.caption or ''}".strip(),
                **kwargs,
            )
        else:
            await services.bot.send_message(
                gid, f"👤 Клиент: {message.text or '[медиа]'}", **kwargs,
            )
    except Exception:  # noqa: BLE001
        log.exception("Не удалось релеить сообщение клиента в группу %s", gid)
