"""Конфигурация бота. Все значения берутся из .env (см. раздел 16 ТЗ)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _get(name: str, default: str | None = None, required: bool = False) -> str:
    val = os.environ.get(name, default)
    if required and not val:
        raise SystemExit(f"Не задана обязательная переменная окружения: {name}")
    return val or ""


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    try:
        return int(raw) if raw not in (None, "") else default
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    try:
        return float(raw) if raw not in (None, "") else default
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw in (None, ""):
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _intset(name: str, default: str) -> set[int]:
    raw = os.environ.get(name, default) or ""
    out: set[int] = set()
    for part in raw.replace(";", ",").split(","):
        part = part.strip()
        if part.isdigit():
            out.add(int(part))
    return out


@dataclass(frozen=True)
class Config:
    bot_token: str = field(default_factory=lambda: _get("BOT_TOKEN", required=True))
    anthropic_api_key: str = field(
        default_factory=lambda: _get("ANTHROPIC_API_KEY", required=True)
    )
    anthropic_model: str = field(
        default_factory=lambda: _get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
    )

    operator_group_id: int = field(
        default_factory=lambda: _int("OPERATOR_GROUP_ID", 0)
    )
    operator_relay_prefix: str = field(
        default_factory=lambda: _get("OPERATOR_RELAY_PREFIX", "")
    )

    google_sa_json: str = field(
        default_factory=lambda: _get(
            "GOOGLE_SERVICE_ACCOUNT_JSON", "./service_account.json"
        )
    )
    # Sheets/Drive опциональны: без них бот работает в облегчённом режиме —
    # KB берётся из локального CSV, логи в Sheets и загрузка в Drive отключены.
    sheet_id: str = field(default_factory=lambda: _get("SHEET_ID", ""))
    gdrive_folder_id: str = field(
        default_factory=lambda: _get("GDRIVE_FOLDER_ID", "")
    )

    confidence_threshold: float = field(
        default_factory=lambda: _float("CONFIDENCE_THRESHOLD", 0.7)
    )
    always_escalate_intents: set[int] = field(
        default_factory=lambda: _intset("ALWAYS_ESCALATE_INTENTS", "12")
    )
    kb_refresh_seconds: int = field(
        default_factory=lambda: _int("KB_REFRESH_SECONDS", 300)
    )
    kz_autotranslate: bool = field(
        default_factory=lambda: _bool("KZ_AUTOTRANSLATE", True)
    )

    timezone: str = field(default_factory=lambda: _get("TIMEZONE", "Asia/Almaty"))
    work_days: str = field(default_factory=lambda: _get("WORK_DAYS", "1-5"))
    work_start: str = field(default_factory=lambda: _get("WORK_START", "09:00"))
    work_end: str = field(default_factory=lambda: _get("WORK_END", "18:00"))
    work_hours: str = field(
        default_factory=lambda: _get("WORK_HOURS", "Пн–Пт 09:00–18:00")
    )

    log_level: str = field(default_factory=lambda: _get("LOG_LEVEL", "INFO"))

    db_path: str = field(default_factory=lambda: _get("DB_PATH", "./data/state.db"))

    # Авто-сид KB при первом старте (если вкладка KB пустая) — удобно на Railway.
    seed_kb_if_empty: bool = field(
        default_factory=lambda: _bool("SEED_KB_IF_EMPTY", True)
    )
    kb_seed_path: str = field(
        default_factory=lambda: _get("KB_SEED_PATH", "KB_seed.csv")
    )


def load_config() -> Config:
    return Config()
