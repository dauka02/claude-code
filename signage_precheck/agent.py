"""Ядро агента: сборка запроса, вызов Claude, возврат структурированного отчёта."""

from __future__ import annotations

import os
from typing import Optional

import anthropic

from .io_utils import build_user_content
from .models import ApplicationInput, PreCheckReport
from .prompts import build_system_blocks
from .rules import RuleBase, load_rules

DEFAULT_MODEL = "claude-opus-4-8"
MAX_TOKENS = 8000


class SignagePreCheckAgent:
    """Агент предварительной проверки заявок на вывески.

    Пример использования:
        agent = SignagePreCheckAgent()
        report = agent.analyze(ApplicationInput(description="...", image_paths=[...]))
        print(report.summary, report.status)
    """

    def __init__(
        self,
        rule_base: Optional[RuleBase] = None,
        model: Optional[str] = None,
        client: Optional[anthropic.Anthropic] = None,
    ) -> None:
        self.rule_base = rule_base or load_rules()
        self.model = model or os.environ.get("SIGNAGE_MODEL", DEFAULT_MODEL)
        # Клиент берёт ключ из ANTHROPIC_API_KEY автоматически.
        self.client = client or anthropic.Anthropic()
        self._system_blocks = build_system_blocks(self.rule_base)

    def analyze(self, app: ApplicationInput) -> PreCheckReport:
        """Анализирует заявку и возвращает структурированный отчёт."""
        if app.is_empty():
            raise ValueError(
                "Пустая заявка: добавьте описание, параметры конструкции, "
                "изображение или PDF."
            )

        content = build_user_content(app)

        response = self.client.messages.parse(
            model=self.model,
            max_tokens=MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=self._system_blocks,
            messages=[{"role": "user", "content": content}],
            output_format=PreCheckReport,
        )

        report = response.parsed_output
        if report is None:
            # Возможен отказ модели по соображениям безопасности или обрыв вывода.
            reason = getattr(response, "stop_reason", "unknown")
            raise RuntimeError(
                f"Не удалось получить структурированный отчёт (stop_reason={reason}). "
                "Проверьте материалы заявки и повторите попытку."
            )
        return report
