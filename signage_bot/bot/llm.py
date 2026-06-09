"""LLM: классификатор (call #1) и адаптация (call #2) — разделы 7, 8 ТЗ.

Принципы (раздел 2): бот не выдумывает факты; адаптация может перефразировать,
но НЕ может менять/добавлять цифры, размеры, адреса, телефоны, кабинеты, часы,
юридические формулировки. Любая неуверенность → эскалация.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from anthropic import AsyncAnthropic

from .kb import KBEntry

log = logging.getLogger("signage.llm")

# Казахские символы для эвристики языка (раздел 6).
KK_CHARS = set("әғқңөұүһі")


def detect_lang_heuristic(text: str) -> str:
    """Грубая проверка по казахским символам. Неоднозначно → 'ru'."""
    low = text.lower()
    if any(ch in KK_CHARS for ch in low):
        return "kk"
    return "ru"


@dataclass
class Classification:
    intent_id: int | None
    can_answer: bool
    confidence: float
    lang: str
    needs_data: str | None


CLASSIFIER_SYSTEM = """Ты — классификатор обращений для бота по согласованию вывесок \
(Центр урбанистики Астаны). Бот отвечает ТОЛЬКО на основе утверждённой базы знаний.

Тебе дают текст обращения, недавний контекст и список интентов (id + тема + текст).
Определи ОДИН интент, который уверенно покрывает вопрос.

Правила:
- can_answer=true ТОЛЬКО если вопрос уверенно покрывается одним из интентов списка.
- Если вопрос вне списка, спорный, про индивидуальное здание/сроки/конкретное \
решение, либо ты не уверен — can_answer=false.
- Интенты НЕ выдумывай: intent_id только из переданного списка либо null.
- lang: "kk" если обращение на казахском, иначе "ru". Неоднозначно → "ru".
- needs_data: "address" | "facade_photo" | "trademark" | null — если для движения \
по вопросу явно нужен адрес, фото фасада или сведения о товарном знаке.
- confidence: 0..1 — насколько ты уверен в покрытии.

Верни СТРОГО JSON без пояснений:
{"intent_id": int|null, "can_answer": bool, "confidence": 0..1, \
"lang": "ru"|"kk", "needs_data": null|"address"|"facade_photo"|"trademark"}"""

ADAPT_SYSTEM = """Ты — ассистент Центра урбанистики Астаны. Тебе дают утверждённый \
текст ответа из базы знаний и вопрос пользователя. Перефразируй ответ вежливо и \
по теме вопроса.

СТРОГО ЗАПРЕЩЕНО: менять или добавлять цифры, размеры, адреса, телефоны, номера \
кабинетов, часы работы, юридические формулировки. Используй ТОЛЬКО факты из \
исходного текста — ничего не придумывай и не дополняй из общих знаний.
Отвечай на языке ЯЗЫК (ru — по-русски, kk — по-казахски). Только сам ответ, \
без вступлений вроде «Вот ответ»."""

TRANSLATE_SYSTEM = """Переведи текст с русского на казахский язык точно и официально, \
сохранив все цифры, размеры, адреса, телефоны, номера кабинетов и часы без изменений. \
Верни только перевод."""


def _extract_json(raw: str) -> dict:
    raw = raw.strip()
    # Иногда модель оборачивает в ```json ... ```
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        raise ValueError(f"В ответе нет JSON: {raw!r}")
    return json.loads(m.group(0))


class LLM:
    def __init__(self, api_key: str, model: str) -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    # ----------------------- call #1: классификатор ------------------------ #
    async def classify(
        self, text: str, intents: list[KBEntry], context: list[str] | None = None
    ) -> Classification:
        intents_block = "\n".join(
            f"- id={e.id} | тема={e.topic} | текст={e.text_ru}" for e in intents
        )
        ctx_block = ""
        if context:
            ctx_block = "\n\nНедавний контекст диалога:\n" + "\n".join(
                f"- {c}" for c in context[-3:]
            )
        user_msg = (
            f"Список интентов:\n{intents_block}{ctx_block}\n\n"
            f"Обращение пользователя:\n{text}"
        )
        try:
            resp = await self._client.messages.create(
                model=self._model,
                max_tokens=300,
                temperature=0,
                system=CLASSIFIER_SYSTEM,
                messages=[{"role": "user", "content": user_msg}],
            )
            data = _extract_json(resp.content[0].text)
        except Exception:  # noqa: BLE001 — при сбое безопаснее эскалировать
            log.exception("Классификатор упал — эскалируем по умолчанию")
            return Classification(
                intent_id=None,
                can_answer=False,
                confidence=0.0,
                lang=detect_lang_heuristic(text),
                needs_data=None,
            )

        valid_ids = {e.id for e in intents}
        intent_id = data.get("intent_id")
        if intent_id is not None and intent_id not in valid_ids:
            intent_id = None  # не доверяем выдуманным id
        lang = data.get("lang")
        if lang not in {"ru", "kk"}:
            lang = detect_lang_heuristic(text)
        needs = data.get("needs_data")
        if needs not in {"address", "facade_photo", "trademark", None}:
            needs = None
        try:
            conf = float(data.get("confidence", 0.0))
        except (TypeError, ValueError):
            conf = 0.0
        return Classification(
            intent_id=intent_id,
            can_answer=bool(data.get("can_answer")) and intent_id is not None,
            confidence=max(0.0, min(1.0, conf)),
            lang=lang,
            needs_data=needs,
        )

    # ------------------------ call #2: адаптация --------------------------- #
    async def adapt(self, kb_text: str, lang: str, question: str) -> str:
        user_msg = (
            f"ЯЗЫК={lang}\n\nИсходный текст из базы знаний:\n{kb_text}\n\n"
            f"Вопрос пользователя:\n{question}"
        )
        try:
            resp = await self._client.messages.create(
                model=self._model,
                max_tokens=700,
                temperature=0.2,
                system=ADAPT_SYSTEM,
                messages=[{"role": "user", "content": user_msg}],
            )
            return resp.content[0].text.strip() or kb_text
        except Exception:  # noqa: BLE001 — при сбое отдаём исходный текст KB
            log.exception("Адаптация упала — отдаём исходный текст KB")
            return kb_text

    # ----------------- перевод RU→KZ на лету (раздел 8) -------------------- #
    async def translate_ru_to_kk(self, text: str) -> str:
        try:
            resp = await self._client.messages.create(
                model=self._model,
                max_tokens=700,
                temperature=0,
                system=TRANSLATE_SYSTEM,
                messages=[{"role": "user", "content": text}],
            )
            return resp.content[0].text.strip() or text
        except Exception:  # noqa: BLE001
            log.exception("Перевод RU→KZ упал — отдаём RU")
            return text
