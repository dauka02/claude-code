#!/usr/bin/env python3
"""CLI для AI Signage Pre-Check Agent.

Примеры:
    python cli.py --description "Вывеска кафе, объёмные буквы" \\
                  --address "ул. Пушкина, 10" \\
                  --image facade.jpg --image sketch.png \\
                  --pdf application.pdf

    python cli.py --description "..." --json   # вывести отчёт в JSON
"""

from __future__ import annotations

import argparse
import json
import sys

from dotenv import load_dotenv

from signage_precheck import ApplicationInput, SignagePreCheckAgent, load_rules
from signage_precheck.render import report_to_text


def main() -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Предварительная проверка заявки на вывеску/наружную рекламу."
    )
    parser.add_argument("--description", default="", help="Текстовое описание заявки")
    parser.add_argument("--address", default="", help="Адрес объекта")
    parser.add_argument(
        "--construction", default="", help="Параметры конструкции (размеры, материалы)"
    )
    parser.add_argument("--notes", default="", help="Доп. заметки менеджера")
    parser.add_argument(
        "--image", action="append", default=[], help="Путь к изображению (можно несколько)"
    )
    parser.add_argument(
        "--pdf", action="append", default=[], help="Путь к PDF-документу (можно несколько)"
    )
    parser.add_argument("--rules", default=None, help="Путь к своей базе правил (YAML)")
    parser.add_argument("--json", action="store_true", help="Вывести отчёт в JSON")
    args = parser.parse_args()

    app = ApplicationInput(
        description=args.description,
        address=args.address,
        construction_params=args.construction,
        extra_notes=args.notes,
        image_paths=args.image,
        pdf_paths=args.pdf,
    )

    if app.is_empty():
        parser.error("Заявка пустая — укажите хотя бы --description, --image или --pdf.")

    rule_base = load_rules(args.rules) if args.rules else None
    agent = SignagePreCheckAgent(rule_base=rule_base)

    print("Анализирую заявку…", file=sys.stderr)
    try:
        report = agent.analyze(app)
    except Exception as e:  # noqa: BLE001
        print(f"Ошибка: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(report.model_dump_json(indent=2))
    else:
        print(report_to_text(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
