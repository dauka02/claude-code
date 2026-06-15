"""CLI для отладки: текст/аудио → протокол .docx.

Примеры:
    python main.py --text transcript.txt
    python main.py --audio meeting.mp3
    echo "..." | python main.py            # транскрипт из stdin
    python main.py --text transcript.txt --json   # печать JSON в stdout
"""

from __future__ import annotations

import argparse
import json
import sys

from build_docx import build_docx, save_to_output
from extract import extract_protocol
from transcribe import transcribe


def main() -> None:
    parser = argparse.ArgumentParser(description="AI-протокол совещания (CLI)")
    parser.add_argument("--text", help="Путь к файлу с готовым транскриптом")
    parser.add_argument("--audio", help="Путь к аудиофайлу (mp3/wav/m4a)")
    parser.add_argument("--json", action="store_true", help="Напечатать JSON в stdout")
    parser.add_argument("--out", default="output", help="Каталог для .docx (по умолчанию output/)")
    args = parser.parse_args()

    # Получаем транскрипт.
    if args.audio:
        print("🎙️ Транскрибирую аудио…", file=sys.stderr)
        transcript = transcribe(args.audio)
    elif args.text:
        with open(args.text, encoding="utf-8") as f:
            transcript = f.read()
    elif not sys.stdin.isatty():
        transcript = sys.stdin.read()
    else:
        parser.error("Укажите --text, --audio или подайте транскрипт через stdin")

    print("🧠 Извлекаю структуру…", file=sys.stderr)
    protocol = extract_protocol(transcript)

    if args.json:
        print(json.dumps(protocol, ensure_ascii=False, indent=2))

    buffer, filename = build_docx(protocol)
    path = save_to_output(buffer, filename, output_dir=args.out)
    print(f"📄 Готово: {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
