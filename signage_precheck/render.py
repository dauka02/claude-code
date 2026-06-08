"""Форматирование отчёта в текст / Markdown."""

from __future__ import annotations

from .models import PreCheckReport, Status

_STATUS_ICON = {
    Status.COMPLIANT: "🟢",
    Status.RISKS: "🟡",
    Status.MANUAL_REVIEW: "🟠",
}


def report_to_markdown(report: PreCheckReport) -> str:
    """Преобразует отчёт в Markdown (для экспорта или отображения)."""
    icon = _STATUS_ICON.get(report.status, "•")
    lines: list[str] = []

    lines.append("# Предварительный отчёт проверки заявки\n")
    lines.append("## 1. Краткое резюме")
    lines.append(report.summary + "\n")

    lines.append("## 2. Предварительный статус")
    lines.append(f"{icon} **{report.status.value}**\n")

    lines.append("## 3. Возможные нарушения")
    if not report.violations:
        lines.append("_Явных нарушений не выявлено._\n")
    else:
        for i, v in enumerate(report.violations, 1):
            lines.append(f"### {i}. {v.title}  — значимость: {v.severity.value}")
            lines.append(f"- **Почему это может быть нарушением:** {v.why}")
            lines.append(f"- **Правило:** {v.rule_reference}")
            lines.append(f"- **Рекомендация по исправлению:** {v.recommendation}\n")

    lines.append("## 4. Черновик ответа заявителю")
    lines.append(report.applicant_response_draft + "\n")

    lines.append("## 5. Вопросы для уточнения")
    if not report.clarifying_questions:
        lines.append("_Уточнений не требуется._\n")
    else:
        for q in report.clarifying_questions:
            lines.append(f"- {q}")
        lines.append("")

    lines.append("---")
    lines.append(f"_{report.disclaimer}_")
    return "\n".join(lines)


def report_to_text(report: PreCheckReport) -> str:
    """Plain-text вариант для терминала."""
    md = report_to_markdown(report)
    # Лёгкая очистка markdown-разметки для терминала.
    for token in ("### ", "## ", "# ", "**", "_"):
        md = md.replace(token, "")
    return md
