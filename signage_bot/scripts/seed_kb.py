"""Заливка KB_seed.csv во вкладку KB Google-таблицы (раздел 18 ТЗ).

Запуск (из каталога signage_bot):
    python -m scripts.seed_kb            # зальёт KB_seed.csv
    python -m scripts.seed_kb other.csv  # из другого файла

Перезаписывает содержимое вкладки KB заголовком + строками из CSV.
Требует .env с SHEET_ID и GOOGLE_SERVICE_ACCOUNT_JSON.
"""

from __future__ import annotations

import csv
import sys

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

from bot.config import load_config

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]
HEADERS = ["id", "topic", "text_ru", "text_kk", "active"]


def main() -> None:
    load_dotenv()
    cfg = load_config()
    path = sys.argv[1] if len(sys.argv) > 1 else "KB_seed.csv"

    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [[r.get(h, "") for h in HEADERS] for r in reader]

    creds = Credentials.from_service_account_file(cfg.google_sa_json, scopes=SCOPES)
    gc = gspread.authorize(creds)
    ss = gc.open_by_key(cfg.sheet_id)
    try:
        ws = ss.worksheet("KB")
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title="KB", rows=max(len(rows) + 5, 50), cols=5)

    ws.clear()
    ws.update("A1", [HEADERS] + rows, value_input_option="USER_ENTERED")
    print(f"Залито в KB: {len(rows)} строк из {path}")


if __name__ == "__main__":
    main()
