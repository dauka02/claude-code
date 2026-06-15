"""Конфигурация: единая точка чтения секретов.

Порядок поиска ключа:
  1. st.secrets  — на Streamlit Community Cloud (Settings → Secrets)
  2. os.getenv   — локально (.env / переменные окружения)

Все модули берут ключи только через get_secret(), чтобы код одинаково работал
и в облаке, и локально.
"""

from __future__ import annotations

import os


def get_secret(key: str, default: str | None = None) -> str | None:
    """Вернуть значение секрета по ключу.

    Сначала пытаемся прочитать из st.secrets (облако), затем из переменных
    окружения (локально). Если ключа нет нигде — возвращаем default.
    """
    # st.secrets доступен только когда код запущен под Streamlit. Импортируем
    # лениво и аккуратно глушим любые ошибки (нет streamlit / нет secrets.toml).
    try:
        import streamlit as st  # noqa: PLC0415  (ленивый импорт намеренно)

        if key in st.secrets:
            return str(st.secrets[key])
    except Exception:
        pass

    return os.getenv(key, default)


def require_secret(key: str) -> str:
    """Как get_secret, но кидает понятную ошибку, если ключа нет."""
    value = get_secret(key)
    if not value:
        raise RuntimeError(
            f"Не задан секрет «{key}». Укажите его в .streamlit/secrets.toml "
            f"(локально) или в Settings → Secrets (Streamlit Cloud)."
        )
    return value
