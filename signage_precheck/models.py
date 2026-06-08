"""Структуры данных: вход заявки и формат предварительного отчёта.

PreCheckReport — это схема, под которую агент жёстко форматирует ответ модели
(structured outputs). Поля 1:1 соответствуют требуемым разделам отчёта.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Перечисления                                                                 #
# --------------------------------------------------------------------------- #
class Status(str, Enum):
    """Предварительный статус заявки."""

    COMPLIANT = "соответствует"
    RISKS = "есть риски"
    MANUAL_REVIEW = "требуется ручная проверка"


class Severity(str, Enum):
    """Значимость возможного нарушения."""

    LOW = "низкая"
    MEDIUM = "средняя"
    HIGH = "высокая"


# --------------------------------------------------------------------------- #
# Вход: материалы заявки                                                       #
# --------------------------------------------------------------------------- #
@dataclass
class ApplicationInput:
    """Материалы заявки, которые загружает пользователь.

    Все поля необязательны — агент работает с тем, что есть, и сам отмечает,
    каких данных не хватает для полноценной проверки.
    """

    description: str = ""  # текстовое описание заявки
    address: str = ""  # адрес объекта
    construction_params: str = ""  # параметры конструкции (размеры, материалы…)
    # Пути к файлам: изображения фасада/эскиза и PDF-документы
    image_paths: List[str] = field(default_factory=list)
    pdf_paths: List[str] = field(default_factory=list)
    extra_notes: str = ""  # дополнительные заметки менеджера

    def is_empty(self) -> bool:
        return not any(
            [
                self.description.strip(),
                self.address.strip(),
                self.construction_params.strip(),
                self.extra_notes.strip(),
                self.image_paths,
                self.pdf_paths,
            ]
        )


# --------------------------------------------------------------------------- #
# Выход: предварительный отчёт                                                 #
# --------------------------------------------------------------------------- #
class Violation(BaseModel):
    """Одно возможное нарушение требований дизайн-кода."""

    title: str = Field(description="Краткое название возможного нарушения")
    why: str = Field(
        description="Объяснение, почему это может быть нарушением (со ссылкой на материалы заявки)"
    )
    rule_reference: str = Field(
        description="Ссылка/упоминание соответствующего правила из базы (id и пункт), либо 'нет в базе'"
    )
    severity: Severity = Field(description="Значимость: низкая | средняя | высокая")
    recommendation: str = Field(description="Рекомендация по исправлению")


class PreCheckReport(BaseModel):
    """Структурированный предварительный отчёт агента.

    Поля соответствуют требуемым разделам:
      1. summary                    — краткое резюме заявки
      2. status                     — предварительный статус
      3+4+5+6. violations[]         — нарушения с объяснением, ссылкой и рекомендацией
      7. applicant_response_draft   — черновик ответа заявителю
      8. clarifying_questions       — вопросы для уточнения
    """

    summary: str = Field(description="Краткое резюме заявки (2–4 предложения)")
    status: Status = Field(description="Предварительный статус заявки")
    violations: List[Violation] = Field(
        description="Список возможных нарушений (пустой, если нарушений не выявлено)"
    )
    applicant_response_draft: str = Field(
        description="Черновик вежливого ответа заявителю с перечнем замечаний (если есть)"
    )
    clarifying_questions: List[str] = Field(
        description="Вопросы, которые нужно уточнить у заявителя или менеджера"
    )

    # Технический дисклеймер — заполняется агентом всегда.
    disclaimer: str = Field(
        default=(
            "Это предварительный автоматический анализ. Он не является финальным "
            "решением и не заменяет проверку ответственным сотрудником."
        ),
        description="Дисклеймер о предварительном характере анализа",
    )
