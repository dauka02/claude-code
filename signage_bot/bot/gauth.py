"""Загрузка Google-кредов: из файла (локально) или из сырого JSON (Railway/секрет).

На Railway файл service_account.json в репозиторий не кладут — вместо этого в
переменную GOOGLE_SERVICE_ACCOUNT_JSON кладут само содержимое JSON. Хелпер
понимает оба случая: если значение начинается с "{" — это JSON, иначе путь.
"""

from __future__ import annotations

import json

from google.oauth2.service_account import Credentials


def service_account_credentials(raw: str, scopes: list[str]) -> Credentials:
    value = (raw or "").strip()
    if value.startswith("{"):
        info = json.loads(value)
        return Credentials.from_service_account_info(info, scopes=scopes)
    return Credentials.from_service_account_file(value, scopes=scopes)
