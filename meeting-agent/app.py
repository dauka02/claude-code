"""Streamlit-интерфейс AI-агента протоколирования совещаний.

Поток: ввод (аудио или текст) → транскрипция → извлечение JSON → .docx → скачать.
Фаза 2: блок персональной рассылки поручений ответственным.

Главная точка входа для Streamlit Community Cloud.
"""

from __future__ import annotations

import json

import streamlit as st

from build_docx import build_docx
from config import get_secret
from extract import extract_protocol
from send import load_contacts, send_assignments
from transcribe import transcribe

st.set_page_config(page_title="Протокол совещания", page_icon="📝", layout="centered")

st.title("📝 AI-протокол совещания")
st.caption(
    "Загрузите аудио встречи или вставьте готовый транскрипт — агент сформирует "
    "структурированный протокол (.docx) с повесткой, решениями и поручениями."
)

# Состояние между перерисовками.
st.session_state.setdefault("protocol", None)
st.session_state.setdefault("docx_bytes", None)
st.session_state.setdefault("docx_name", None)

tab_text, tab_audio = st.tabs(["📄 Вставить текст", "🎙️ Загрузить аудио"])

with tab_text:
    transcript_text = st.text_area(
        "Транскрипт встречи",
        height=260,
        placeholder="Вставьте сюда текст расшифровки совещания…",
    )

with tab_audio:
    st.markdown("**🔴 Записать с микрофона**")
    # Встроенный виджет записи аудио в браузере (Streamlit ≥ 1.40).
    # Возвращает WAV-файл (file-like), который понимает transcribe().
    recorded_audio = None
    if hasattr(st, "audio_input"):
        recorded_audio = st.audio_input("Нажмите кнопку микрофона и говорите")
    else:
        st.info(
            "Запись с микрофона требует Streamlit ≥ 1.40. "
            "Обновите пакет или воспользуйтесь загрузкой файла ниже."
        )

    st.markdown("**📁 …или загрузить файл**")
    audio_file = st.file_uploader(
        "Аудио встречи (mp3 / wav / m4a, до ~25 МБ)",
        type=["mp3", "wav", "m4a"],
    )
    engine = get_secret("TRANSCRIBE_ENGINE", "whisper_api")
    st.caption(f"Движок транскрипции: `{engine}`. Длинные встречи лучше резать на части.")

if st.button("🛠️ Сформировать протокол", type="primary", use_container_width=True):
    transcript = (transcript_text or "").strip()

    try:
        with st.status("Обработка…", expanded=True) as status:
            # 1. Транскрипция (если есть аудио и нет текста).
            #    Приоритет — запись с микрофона, затем загруженный файл.
            audio_source = recorded_audio or audio_file
            if not transcript and audio_source is not None:
                st.write("🎙️ Транскрибирую аудио…")
                source_name = getattr(audio_source, "name", "recording.wav")
                transcript = transcribe(audio_source, filename=source_name)

            if not transcript:
                status.update(label="Нет данных", state="error")
                st.error("Вставьте текст транскрипта или загрузите аудио.")
                st.stop()

            # 2. Извлечение структуры.
            st.write("🧠 Извлекаю структуру протокола…")
            protocol = extract_protocol(transcript)

            # 3. Сборка .docx.
            st.write("📄 Собираю .docx…")
            buffer, filename = build_docx(protocol)

            st.session_state["protocol"] = protocol
            st.session_state["docx_bytes"] = buffer.getvalue()
            st.session_state["docx_name"] = filename

            status.update(label="Готово ✅", state="complete")
    except Exception as exc:  # noqa: BLE001
        st.error(f"Ошибка: {exc}")
        st.stop()

# Результат.
protocol = st.session_state.get("protocol")
if protocol:
    st.subheader("Результат")

    with st.expander("🔍 Распознанный JSON (проверьте перед скачиванием)"):
        st.json(protocol)

    поручения = protocol.get("поручения") or []
    if поручения:
        st.markdown("**Поручения**")
        st.table(
            [
                {
                    "Задача": t.get("задача", ""),
                    "Ответственный": t.get("ответственный", ""),
                    "Срок": t.get("срок", ""),
                    "Приоритет": t.get("приоритет", ""),
                }
                for t in поручения
            ]
        )

    st.download_button(
        "⬇️ Скачать .docx",
        data=st.session_state["docx_bytes"],
        file_name=st.session_state["docx_name"],
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        use_container_width=True,
    )

    # ── Фаза 2: рассылка участникам ──────────────────────────────────────────
    st.divider()
    st.subheader("📨 Отправить участникам (Фаза 2)")

    contacts = load_contacts()
    owners = []
    for t in поручения:
        owner = str(t.get("ответственный") or "").strip()
        if owner and owner.lower() not in ("не определён", "не указан") and owner not in owners:
            owners.append(owner)

    if not owners:
        st.info("Нет ответственных с поручениями — рассылать нечего.")
    elif not contacts:
        st.warning(
            "Файл `contacts.json` пуст или не найден. Добавьте контакты "
            "(имя → email / telegram_id), чтобы включить рассылку."
        )
    else:
        st.caption("Отметьте, кому разослать персональные задачи:")
        selected = [owner for owner in owners if st.checkbox(owner, value=owner in contacts, key=f"chk_{owner}")]

        if st.button("Отправить выбранным", use_container_width=True):
            import io

            with st.spinner("Отправляю…"):
                log = send_assignments(
                    protocol,
                    selected=selected,
                    docx=io.BytesIO(st.session_state["docx_bytes"]),
                    docx_name=st.session_state["docx_name"],
                )
            if log:
                st.table(log)
            else:
                st.info("Никому не отправлено (нет выбранных получателей с поручениями).")
