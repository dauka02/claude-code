"""HTTP-веб-приложение (Flask) для AI-протокола совещания.

Одностраничный UI: запись с микрофона прямо в браузере, загрузка аудио или
вставка текста → извлечение протокола (Claude) → скачать .docx.

Запуск:
    cd meeting-agent
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=sk-ant-...      # или положите в .env
    python server.py
    # открыть http://localhost:8000

Микрофон в браузере работает только в защищённом контексте — http://localhost
(или https://). На удалённом сервере по обычному http микрофон браузер не даст.
"""

from __future__ import annotations

import io
import os
from uuid import uuid4

from flask import Flask, abort, jsonify, render_template, request, send_file

from build_docx import build_docx
from extract import extract_protocol
from send import load_contacts, send_assignments
from transcribe import transcribe

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _load_dotenv() -> None:
    """Подхватить переменные из .env (без зависимостей), если файл есть."""
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

app = Flask(__name__)

# Готовые .docx держим в памяти до скачивания: docx_id → (bytes, имя_файла).
# Для одного пользователя / локального запуска этого достаточно.
_DOCX_STORE: dict[str, tuple[bytes, str]] = {}
# Последний протокол — чтобы Фаза 2 (рассылка) знала, что отправлять.
_LAST_PROTOCOL: dict[str, object] = {}


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/process")
def process():
    """Принять текст ИЛИ аудио → вернуть JSON-протокол и id для скачивания .docx."""
    transcript = (request.form.get("transcript") or "").strip()

    try:
        # Если текста нет — берём аудио (запись с микрофона или загруженный файл).
        if not transcript:
            audio = request.files.get("audio")
            if audio and audio.filename:
                data = audio.read()
                transcript = transcribe((data, audio.filename))

        if not transcript:
            return jsonify({"error": "Вставьте текст транскрипта или приложите аудио."}), 400

        protocol = extract_protocol(transcript)
        buffer, filename = build_docx(protocol)

        docx_id = uuid4().hex
        _DOCX_STORE[docx_id] = (buffer.getvalue(), filename)
        _LAST_PROTOCOL.clear()
        _LAST_PROTOCOL.update(protocol)
        _LAST_PROTOCOL["__docx_id__"] = docx_id

        return jsonify(
            {
                "protocol": protocol,
                "docx_id": docx_id,
                "filename": filename,
                "transcript": transcript,
            }
        )
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


@app.get("/download/<docx_id>")
def download(docx_id: str):
    item = _DOCX_STORE.get(docx_id)
    if not item:
        abort(404)
    data, filename = item
    return send_file(
        io.BytesIO(data),
        as_attachment=True,
        download_name=filename,
        mimetype=DOCX_MIME,
    )


@app.post("/send")
def send():
    """Фаза 2: разослать персональные поручения выбранным ответственным."""
    if not _LAST_PROTOCOL:
        return jsonify({"error": "Сначала сформируйте протокол."}), 400

    payload = request.get_json(silent=True) or {}
    selected = payload.get("selected")  # список имён или None (всем)

    docx_id = _LAST_PROTOCOL.get("__docx_id__")
    item = _DOCX_STORE.get(docx_id) if docx_id else None
    docx_buf = io.BytesIO(item[0]) if item else None
    docx_name = item[1] if item else "Протокол.docx"

    protocol = {k: v for k, v in _LAST_PROTOCOL.items() if not k.startswith("__")}
    try:
        log = send_assignments(protocol, selected=selected, docx=docx_buf, docx_name=docx_name)
        return jsonify({"log": log})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


@app.get("/contacts")
def contacts():
    """Список контактов — чтобы UI показал, кому можно слать."""
    return jsonify(load_contacts())


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)
