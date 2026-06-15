"""Извлечение структурированного протокола из транскрипта через Claude.

Вход:  текст транскрипта.
Выход: валидированный dict с ключами:
       тема, дата, участники[], повестка[], решения[],
       поручения[], открытые_вопросы[], следующая_встреча

Используется Anthropic Claude API (модель claude-sonnet-4-6). Ответ модели
ограничен JSON-схемой (structured outputs), плюс есть парсинг + валидация и
один повтор при ошибке.
"""

from __future__ import annotations

import json
import os
from typing import Any

import anthropic

from config import require_secret

MODEL = "claude-sonnet-4-6"

# Обязательные ключи итогового JSON и пустые значения по умолчанию.
_REQUIRED_KEYS: dict[str, Any] = {
    "тема": "",
    "дата": None,
    "участники": [],
    "повестка": [],
    "решения": [],
    "поручения": [],
    "открытые_вопросы": [],
    "следующая_встреча": None,
}

# JSON-схема для structured outputs — гарантирует разбираемый JSON нужной формы.
_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "тема": {"type": "string"},
        "дата": {"type": ["string", "null"]},
        "участники": {"type": "array", "items": {"type": "string"}},
        "повестка": {"type": "array", "items": {"type": "string"}},
        "решения": {"type": "array", "items": {"type": "string"}},
        "поручения": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "задача": {"type": "string"},
                    "ответственный": {"type": "string"},
                    "срок": {"type": "string"},
                    "приоритет": {
                        "type": "string",
                        "enum": ["высокий", "средний", "низкий"],
                    },
                },
                "required": ["задача", "ответственный", "срок", "приоритет"],
                "additionalProperties": False,
            },
        },
        "открытые_вопросы": {"type": "array", "items": {"type": "string"}},
        "следующая_встреча": {"type": ["string", "null"]},
    },
    "required": list(_REQUIRED_KEYS.keys()),
    "additionalProperties": False,
}


def _load_prompt() -> str:
    """Прочитать системный промпт извлечения из prompts/extract_prompt.txt."""
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "prompts", "extract_prompt.txt")
    with open(path, encoding="utf-8") as f:
        return f.read()


def _normalize(data: dict[str, Any]) -> dict[str, Any]:
    """Дополнить недостающие ключи дефолтами и нормализовать поручения."""
    result = {**_REQUIRED_KEYS, **{k: data.get(k, v) for k, v in _REQUIRED_KEYS.items()}}

    normalized_tasks = []
    for item in result.get("поручения") or []:
        if not isinstance(item, dict):
            continue
        normalized_tasks.append(
            {
                "задача": str(item.get("задача") or "").strip(),
                "ответственный": str(item.get("ответственный") or "не определён").strip()
                or "не определён",
                "срок": str(item.get("срок") or "не указан").strip() or "не указан",
                "приоритет": str(item.get("приоритет") or "средний").strip() or "средний",
            }
        )
    result["поручения"] = normalized_tasks
    return result


def _validate(data: dict[str, Any]) -> None:
    """Бросить ValueError, если структура не соответствует ожиданиям."""
    for key in _REQUIRED_KEYS:
        if key not in data:
            raise ValueError(f"В ответе отсутствует ключ «{key}»")
    for key in ("участники", "повестка", "решения", "поручения", "открытые_вопросы"):
        if not isinstance(data[key], list):
            raise ValueError(f"Ключ «{key}» должен быть списком")


def _call_claude(client: anthropic.Anthropic, system_prompt: str, transcript: str) -> dict[str, Any]:
    """Один вызов модели → разобранный и нормализованный dict."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        thinking={"type": "disabled"},
        output_config={
            "effort": "low",
            "format": {"type": "json_schema", "schema": _SCHEMA},
        },
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": f"Транскрипт встречи:\n\n{transcript}",
            }
        ],
    )

    # При output_config.format первый текстовый блок гарантированно содержит JSON.
    text = next((b.text for b in response.content if b.type == "text"), "")
    data = json.loads(text)
    data = _normalize(data)
    _validate(data)
    return data


def extract_protocol(transcript: str) -> dict[str, Any]:
    """Извлечь протокол из транскрипта. Один повтор при ошибке разбора/валидации."""
    transcript = (transcript or "").strip()
    if not transcript:
        raise ValueError("Пустой транскрипт — нечего обрабатывать.")

    api_key = require_secret("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = _load_prompt()

    try:
        return _call_claude(client, system_prompt, transcript)
    except (json.JSONDecodeError, ValueError):
        # Повтор: усиливаем требование вернуть строго валидный JSON.
        retry_prompt = (
            system_prompt
            + "\n\nВАЖНО: верни ТОЛЬКО валидный JSON указанной структуры, "
            "без каких-либо пояснений и без markdown."
        )
        return _call_claude(client, retry_prompt, transcript)
