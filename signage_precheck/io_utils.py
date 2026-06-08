"""Подготовка материалов заявки в content-блоки для Claude (vision + PDF)."""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Any, Dict, List

from .models import ApplicationInput

# Поддерживаемые форматы изображений в Messages API
_IMAGE_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _image_block(path: str) -> Dict[str, Any]:
    p = Path(path)
    media_type = _IMAGE_MEDIA_TYPES.get(p.suffix.lower())
    if media_type is None:
        guessed, _ = mimetypes.guess_type(str(p))
        media_type = guessed or "image/png"
    data = base64.standard_b64encode(p.read_bytes()).decode("utf-8")
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": data},
    }


def _pdf_block(path: str) -> Dict[str, Any]:
    p = Path(path)
    data = base64.standard_b64encode(p.read_bytes()).decode("utf-8")
    return {
        "type": "document",
        "source": {
            "type": "base64",
            "media_type": "application/pdf",
            "data": data,
        },
        "title": p.name,
    }


def build_user_content(app: ApplicationInput) -> List[Dict[str, Any]]:
    """Собирает список content-блоков пользовательского сообщения.

    Порядок: текстовое описание заявки → изображения → PDF-документы.
    """
    blocks: List[Dict[str, Any]] = []

    text_parts: List[str] = ["МАТЕРИАЛЫ ЗАЯВКИ НА РАЗМЕЩЕНИЕ ВЫВЕСКИ/НАРУЖНОЙ РЕКЛАМЫ:", ""]
    if app.address.strip():
        text_parts.append(f"Адрес объекта: {app.address.strip()}")
    if app.description.strip():
        text_parts.append(f"\nОписание заявки:\n{app.description.strip()}")
    if app.construction_params.strip():
        text_parts.append(f"\nПараметры конструкции:\n{app.construction_params.strip()}")
    if app.extra_notes.strip():
        text_parts.append(f"\nДополнительные заметки менеджера:\n{app.extra_notes.strip()}")

    attachments_note: List[str] = []
    if app.image_paths:
        attachments_note.append(f"{len(app.image_paths)} изображен.")
    if app.pdf_paths:
        attachments_note.append(f"{len(app.pdf_paths)} PDF-документ(ов)")
    if attachments_note:
        text_parts.append("\nВложения: " + ", ".join(attachments_note) + " (ниже).")

    blocks.append({"type": "text", "text": "\n".join(text_parts)})

    for img in app.image_paths:
        blocks.append({"type": "text", "text": f"Изображение: {Path(img).name}"})
        blocks.append(_image_block(img))

    for pdf in app.pdf_paths:
        blocks.append(_pdf_block(pdf))

    blocks.append(
        {
            "type": "text",
            "text": (
                "Проведи предварительную проверку этой заявки по базе правил "
                "дизайн-кода и верни структурированный отчёт согласно заданной схеме."
            ),
        }
    )
    return blocks
