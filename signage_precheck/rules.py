"""Загрузка и форматирование базы правил дизайн-кода."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import yaml

DEFAULT_RULES_PATH = Path(__file__).with_name("rules_base.yaml")


@dataclass
class RuleBase:
    """Загруженная база правил."""

    meta: Dict[str, Any]
    rules: List[Dict[str, Any]]

    @property
    def name(self) -> str:
        return self.meta.get("name", "Дизайн-код")

    @property
    def version(self) -> str:
        return str(self.meta.get("version", "—"))

    def as_prompt_block(self) -> str:
        """Преобразует правила в текстовый блок для системного промпта."""
        lines: List[str] = [
            f"БАЗА ПРАВИЛ ДИЗАЙН-КОДА: {self.name} (версия {self.version})",
            "",
        ]
        for r in self.rules:
            lines.append(
                f"[{r.get('id', '—')}] ({r.get('category', 'без категории')}) "
                f"{r.get('title', '')}"
            )
            requirement = " ".join(str(r.get("requirement", "")).split())
            lines.append(f"  Требование: {requirement}")
            lines.append(f"  Ссылка: {r.get('reference', '—')}")
            lines.append(f"  Базовая значимость: {r.get('severity', 'средняя')}")
            lines.append("")
        return "\n".join(lines)


def load_rules(path: str | os.PathLike | None = None) -> RuleBase:
    """Загружает базу правил из YAML-файла.

    Порядок выбора пути:
      1. явный аргумент path
      2. переменная окружения SIGNAGE_RULES_PATH
      3. встроенный rules_base.yaml
    """
    resolved = (
        Path(path)
        if path
        else Path(os.environ.get("SIGNAGE_RULES_PATH", DEFAULT_RULES_PATH))
    )
    if not resolved.exists():
        raise FileNotFoundError(f"Файл базы правил не найден: {resolved}")

    with open(resolved, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    rules = data.get("rules", [])
    if not isinstance(rules, list) or not rules:
        raise ValueError(
            f"В базе правил {resolved} отсутствует непустой список 'rules'."
        )

    return RuleBase(meta=data.get("meta", {}), rules=rules)
