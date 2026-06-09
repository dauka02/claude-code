"""Google Drive — загрузка фото/эскизов (раздел 14 ТЗ).

Сервисный аккаунт с доступом к папке GDRIVE_FOLDER_ID. Файл грузится как
{user_id}_{timestamp}.jpg, возвращается ссылка для просмотра. Папка =
накапливаемый датасет эскизов для будущего vision-модуля.
"""

from __future__ import annotations

import asyncio
import io
import logging
import time

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

from .gauth import service_account_credentials

log = logging.getLogger("signage.drive")

SCOPES = ["https://www.googleapis.com/auth/drive"]


class Drive:
    def __init__(self, sa_json_path: str, folder_id: str) -> None:
        self._sa_path = sa_json_path
        self._folder_id = folder_id
        self._service = None

    async def connect(self) -> None:
        await asyncio.to_thread(self._connect_sync)

    def _connect_sync(self) -> None:
        creds = service_account_credentials(self._sa_path, SCOPES)
        self._service = build("drive", "v3", credentials=creds, cache_discovery=False)

    async def upload_photo(self, data: bytes, user_id: int) -> str:
        """Загружает байты как jpg, возвращает webViewLink (или '' при ошибке)."""
        return await asyncio.to_thread(self._upload_sync, data, user_id)

    def _upload_sync(self, data: bytes, user_id: int) -> str:
        name = f"{user_id}_{int(time.time())}.jpg"
        meta = {"name": name, "parents": [self._folder_id]}
        media = MediaIoBaseUpload(
            io.BytesIO(data), mimetype="image/jpeg", resumable=False
        )
        try:
            created = (
                self._service.files()
                .create(body=meta, media_body=media, fields="id, webViewLink")
                .execute()
            )
        except Exception:  # noqa: BLE001
            log.exception("Загрузка фото в Drive не удалась")
            return ""
        file_id = created.get("id")
        link = created.get("webViewLink", "")
        # Доступ по ссылке (чтобы оператор открыл без шаринга вручную).
        try:
            self._service.permissions().create(
                fileId=file_id,
                body={"role": "reader", "type": "anyone"},
            ).execute()
        except Exception:  # noqa: BLE001 — не критично, ссылка всё равно есть
            log.warning("Не удалось выставить доступ по ссылке для %s", file_id)
        return link


class NullDrive:
    """Заглушка, когда GDRIVE_FOLDER_ID не задан: фото в Drive не грузится.

    Фото всё равно уходит оператору в тему (через Telegram file_id) — просто
    без ссылки на Drive.
    """

    async def connect(self) -> None:
        return None

    async def upload_photo(self, data: bytes, user_id: int) -> str:
        return ""
