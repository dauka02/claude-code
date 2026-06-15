"""Фаза 2: персональная рассылка поручений участникам.

Читает contacts.json (имя → email / telegram_id). Для каждого ответственного
фильтрует его поручения, формирует персональное сообщение и шлёт его вместе с
общим .docx (email) или текстом (Telegram). Ведёт лог отправок.
"""

from __future__ import annotations

import io
import json
import os
import smtplib
from email.message import EmailMessage
from typing import Any

import requests

from config import get_secret


def load_contacts(path: str = "contacts.json") -> dict[str, dict[str, str]]:
    """Загрузить справочник контактов. Возвращает {имя: {email, telegram_id}}."""
    here = os.path.dirname(os.path.abspath(__file__))
    full = path if os.path.isabs(path) else os.path.join(here, path)
    if not os.path.exists(full):
        return {}
    with open(full, encoding="utf-8") as f:
        return json.load(f)


def tasks_for(protocol: dict[str, Any], responsible: str) -> list[dict[str, Any]]:
    """Отфильтровать поручения для конкретного ответственного."""
    name = (responsible or "").strip().lower()
    result = []
    for task in protocol.get("поручения") or []:
        owner = str(task.get("ответственный") or "").strip().lower()
        if owner and owner == name:
            result.append(task)
    return result


def _format_message(responsible: str, tasks: list[dict[str, Any]], protocol: dict[str, Any]) -> str:
    """Текст персонального сообщения с задачами участника."""
    тема = str(protocol.get("тема") or "совещание").strip()
    lines = [f"Здравствуйте, {responsible}!", "", f"По итогам встречи «{тема}» на вас оформлены поручения:", ""]
    for i, task in enumerate(tasks, 1):
        lines.append(
            f"{i}. {task.get('задача', '').strip()}\n"
            f"   Срок: {task.get('срок', 'не указан')} · "
            f"Приоритет: {task.get('приоритет', 'средний')}"
        )
    lines += ["", "Полный протокол — во вложении.", "", "— Авто-секретарь совещаний"]
    return "\n".join(lines)


def _send_email(to_email: str, subject: str, body: str, docx: io.BytesIO | None, docx_name: str) -> None:
    """Отправить письмо через Gmail SMTP с вложением .docx."""
    gmail_user = get_secret("GMAIL_USER")
    gmail_pass = get_secret("GMAIL_APP_PASSWORD")
    if not gmail_user or not gmail_pass:
        raise RuntimeError("Не заданы GMAIL_USER / GMAIL_APP_PASSWORD для отправки email.")

    msg = EmailMessage()
    msg["From"] = gmail_user
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    if docx is not None:
        docx.seek(0)
        msg.add_attachment(
            docx.read(),
            maintype="application",
            subtype="vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=docx_name,
        )
        docx.seek(0)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, gmail_pass)
        server.send_message(msg)


def _send_telegram(chat_id: str, text: str) -> None:
    """Отправить текстовое сообщение через Telegram Bot API."""
    token = get_secret("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("Не задан TELEGRAM_BOT_TOKEN для отправки в Telegram.")
    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": text},
        timeout=60,
    )
    response.raise_for_status()


def send_assignments(
    protocol: dict[str, Any],
    selected: list[str] | None = None,
    docx: io.BytesIO | None = None,
    docx_name: str = "Протокол.docx",
    contacts_path: str = "contacts.json",
) -> list[dict[str, str]]:
    """Разослать персональные поручения выбранным ответственным.

    selected — список имён ответственных (если None — все, у кого есть поручения).
    Возвращает лог отправок: [{ответственный, канал, статус, детали}].
    """
    contacts = load_contacts(contacts_path)
    тема = str(protocol.get("тема") or "Протокол совещания").strip()

    # Список ответственных, у которых реально есть поручения.
    owners = []
    for task in protocol.get("поручения") or []:
        owner = str(task.get("ответственный") or "").strip()
        if owner and owner.lower() not in ("не определён", "не указан") and owner not in owners:
            owners.append(owner)

    if selected is not None:
        owners = [o for o in owners if o in selected]

    log: list[dict[str, str]] = []
    for owner in owners:
        tasks = tasks_for(protocol, owner)
        if not tasks:
            continue
        contact = contacts.get(owner, {})
        message = _format_message(owner, tasks, protocol)

        sent_any = False
        # Email — приоритетный канал (с вложением).
        if contact.get("email"):
            try:
                _send_email(contact["email"], f"Поручения: {тема}", message, docx, docx_name)
                log.append({"ответственный": owner, "канал": "email", "статус": "ок", "детали": contact["email"]})
                sent_any = True
            except Exception as exc:  # noqa: BLE001
                log.append({"ответственный": owner, "канал": "email", "статус": "ошибка", "детали": str(exc)})

        # Telegram — если есть chat_id.
        if contact.get("telegram_id"):
            try:
                _send_telegram(str(contact["telegram_id"]), message)
                log.append({"ответственный": owner, "канал": "telegram", "статус": "ок", "детали": str(contact["telegram_id"])})
                sent_any = True
            except Exception as exc:  # noqa: BLE001
                log.append({"ответственный": owner, "канал": "telegram", "статус": "ошибка", "детали": str(exc)})

        if not sent_any:
            log.append({"ответственный": owner, "канал": "—", "статус": "пропущен", "детали": "нет контактов в contacts.json"})

    return log
