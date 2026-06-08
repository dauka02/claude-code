"""Streamlit-интерфейс AI Signage Pre-Check Agent.

Запуск:
    streamlit run app.py
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from signage_precheck import ApplicationInput, SignagePreCheckAgent, load_rules
from signage_precheck.models import Status
from signage_precheck.render import report_to_markdown

load_dotenv()

st.set_page_config(page_title="AI Signage Pre-Check Agent", page_icon="🪧", layout="wide")

_STATUS_STYLE = {
    Status.COMPLIANT: ("🟢 Соответствует", "success"),
    Status.RISKS: ("🟡 Есть риски", "warning"),
    Status.MANUAL_REVIEW: ("🟠 Требуется ручная проверка", "warning"),
}
_SEVERITY_EMOJI = {"высокая": "🔴", "средняя": "🟠", "низкая": "🟡"}


def _save_uploads(uploaded_files) -> list[str]:
    """Сохраняет загруженные файлы во временные файлы, возвращает пути."""
    paths: list[str] = []
    for uf in uploaded_files or []:
        suffix = Path(uf.name).suffix
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(uf.getbuffer())
        tmp.flush()
        tmp.close()
        paths.append(tmp.name)
    return paths


def main() -> None:
    st.title("🪧 AI Signage Pre-Check Agent")
    st.caption(
        "Предварительная проверка заявок на вывески и наружную рекламу. "
        "Инструмент ускорения первичной проверки — финальное решение всегда за сотрудником."
    )

    # Сайдбар: статус базы правил
    with st.sidebar:
        st.header("База правил")
        try:
            rb = load_rules()
            st.success(f"{rb.name}\n\nверсия: {rb.version}\nправил: {len(rb.rules)}")
        except Exception as e:  # noqa: BLE001
            st.error(f"Не удалось загрузить базу правил: {e}")
            rb = None
        st.divider()
        st.caption(
            "Замените `signage_precheck/rules_base.yaml` на ваши реальные правила "
            "дизайн-кода или укажите путь в переменной `SIGNAGE_RULES_PATH`."
        )

    # Форма ввода
    col1, col2 = st.columns(2)
    with col1:
        address = st.text_input("Адрес объекта")
        description = st.text_area("Описание заявки", height=140)
        construction = st.text_area(
            "Параметры конструкции (размеры, материалы, подсветка)", height=120
        )
    with col2:
        notes = st.text_area("Заметки менеджера (необязательно)", height=100)
        images = st.file_uploader(
            "Изображения (фасад, эскиз)",
            type=["jpg", "jpeg", "png", "gif", "webp"],
            accept_multiple_files=True,
        )
        pdfs = st.file_uploader(
            "PDF-документы", type=["pdf"], accept_multiple_files=True
        )

    if images:
        st.image([img for img in images], width=220, caption=[i.name for i in images])

    analyze = st.button("🔍 Провести предварительную проверку", type="primary")

    if not analyze:
        return

    app_input = ApplicationInput(
        description=description,
        address=address,
        construction_params=construction,
        extra_notes=notes,
        image_paths=_save_uploads(images),
        pdf_paths=_save_uploads(pdfs),
    )
    if app_input.is_empty():
        st.warning("Добавьте хотя бы описание, изображение или PDF.")
        return

    with st.spinner("Анализирую материалы заявки…"):
        try:
            agent = SignagePreCheckAgent(rule_base=rb)
            report = agent.analyze(app_input)
        except Exception as e:  # noqa: BLE001
            st.error(f"Ошибка анализа: {e}")
            return

    _render_report(report)


def _render_report(report) -> None:
    st.divider()

    label, kind = _STATUS_STYLE.get(report.status, (report.status.value, "info"))
    getattr(st, kind)(f"**Предварительный статус:** {label}")

    st.subheader("Краткое резюме")
    st.write(report.summary)

    st.subheader(f"Возможные нарушения ({len(report.violations)})")
    if not report.violations:
        st.write("Явных нарушений не выявлено.")
    for i, v in enumerate(report.violations, 1):
        emoji = _SEVERITY_EMOJI.get(v.severity.value, "•")
        with st.expander(f"{emoji} {i}. {v.title} — {v.severity.value}"):
            st.markdown(f"**Почему это может быть нарушением:** {v.why}")
            st.markdown(f"**Правило:** {v.rule_reference}")
            st.markdown(f"**Рекомендация:** {v.recommendation}")

    st.subheader("Черновик ответа заявителю")
    st.text_area("Можно скопировать и отредактировать", report.applicant_response_draft, height=180)

    st.subheader("Вопросы для уточнения")
    if not report.clarifying_questions:
        st.write("Уточнений не требуется.")
    for q in report.clarifying_questions:
        st.markdown(f"- {q}")

    st.divider()
    st.caption(report.disclaimer)

    st.download_button(
        "⬇️ Скачать отчёт (Markdown)",
        data=report_to_markdown(report),
        file_name="signage_precheck_report.md",
        mime="text/markdown",
    )


if __name__ == "__main__":
    main()
