"""Транскрипция аудио → текст.

Движок выбирается секретом TRANSCRIBE_ENGINE:
  - whisper_api   — OpenAI Whisper API (нужен OPENAI_API_KEY). Рекомендуется в облаке.
  - yandex        — Yandex SpeechKit (нужен YANDEX_API_KEY). Для KZ / микс RU-KZ.
  - whisper_local — локальный faster-whisper (тяжёлый, только для локального режима).

Вход:  путь к файлу ИЛИ (bytes, имя_файла).
Выход: текст транскрипта.
"""

from __future__ import annotations

import io
import os

import requests

from config import get_secret, require_secret


def _read_audio(audio: "str | tuple[bytes, str] | io.BytesIO", filename: str | None) -> tuple[bytes, str]:
    """Привести разные виды входа к паре (данные, имя_файла)."""
    if isinstance(audio, str):
        with open(audio, "rb") as f:
            return f.read(), os.path.basename(audio)
    if isinstance(audio, tuple):
        data, name = audio
        return data, name
    if isinstance(audio, (io.BytesIO, io.BufferedReader)):
        data = audio.read()
        return data, filename or "audio.mp3"
    # Streamlit UploadedFile и подобные file-like объекты.
    if hasattr(audio, "read"):
        data = audio.read()
        name = filename or getattr(audio, "name", "audio.mp3")
        return data, name
    raise TypeError("Неподдерживаемый тип аудио-входа")


def _transcribe_whisper_api(data: bytes, filename: str) -> str:
    """OpenAI Whisper API (модель whisper-1) через REST."""
    api_key = require_secret("OPENAI_API_KEY")
    response = requests.post(
        "https://api.openai.com/v1/audio/transcriptions",
        headers={"Authorization": f"Bearer {api_key}"},
        files={"file": (filename, data)},
        data={"model": "whisper-1"},
        timeout=300,
    )
    response.raise_for_status()
    return response.json().get("text", "").strip()


def _transcribe_yandex(data: bytes) -> str:
    """Yandex SpeechKit (короткое распознавание) через REST.

    Подходит для встреч на казахском или микса RU/KZ. Для длинного аудио
    SpeechKit требует асинхронное распознавание + Object Storage — здесь
    реализован простой синхронный путь для коротких фрагментов.
    """
    api_key = require_secret("YANDEX_API_KEY")
    lang = get_secret("YANDEX_LANG", "ru-RU")
    response = requests.post(
        "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize",
        headers={"Authorization": f"Api-Key {api_key}"},
        params={"lang": lang},
        data=data,
        timeout=300,
    )
    response.raise_for_status()
    return response.json().get("result", "").strip()


def _transcribe_whisper_local(data: bytes, filename: str) -> str:
    """Локальный faster-whisper. Тяжёлый — не для Community Cloud."""
    try:
        from faster_whisper import WhisperModel  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "Движок whisper_local требует пакет faster-whisper "
            "(раскомментируйте его в requirements.txt). В облаке используйте whisper_api."
        ) from exc

    import tempfile

    model_size = get_secret("WHISPER_MODEL", "base")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    suffix = os.path.splitext(filename)[1] or ".mp3"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        segments, _ = model.transcribe(tmp_path)
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        os.unlink(tmp_path)


def transcribe(audio, filename: str | None = None) -> str:
    """Транскрибировать аудио в текст согласно TRANSCRIBE_ENGINE."""
    engine = (get_secret("TRANSCRIBE_ENGINE", "whisper_api") or "whisper_api").lower()
    data, name = _read_audio(audio, filename)

    if not data:
        raise ValueError("Пустой аудио-файл.")

    if engine == "whisper_api":
        return _transcribe_whisper_api(data, name)
    if engine == "yandex":
        return _transcribe_yandex(data)
    if engine == "whisper_local":
        return _transcribe_whisper_local(data, name)

    raise ValueError(
        f"Неизвестный TRANSCRIBE_ENGINE: «{engine}». "
        f"Допустимо: whisper_api | yandex | whisper_local."
    )
