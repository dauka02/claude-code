# 📝 AI-агент протоколирования совещаний

Веб-агент: пользователь загружает аудио или вставляет текст встречи → агент
формирует структурированный протокол → отдаёт `.docx` с повесткой, решениями,
поручениями, сроками и ответственными. **Фаза 2** — автоотправка персональных
задач участникам (email / Telegram).

Деплой: **Streamlit Community Cloud** (бесплатно, из GitHub-репозитория).

## Структура

```
meeting-agent/
├─ app.py                  # Streamlit UI — главная точка входа
├─ main.py                 # CLI (для отладки)
├─ config.py               # get_secret(): st.secrets → os.getenv
├─ transcribe.py           # аудио → текст (whisper_api | yandex | whisper_local)
├─ extract.py              # текст → JSON (Claude, claude-sonnet-4-6)
├─ build_docx.py           # JSON → .docx
├─ send.py                 # Фаза 2: персональная рассылка
├─ prompts/extract_prompt.txt
├─ contacts.json
├─ requirements.txt        # pip-зависимости (читает Streamlit Cloud)
├─ packages.txt            # apt: ffmpeg
└─ .streamlit/secrets.toml.example
```

## Запуск локально

```bash
cd meeting-agent
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml   # и заполнить ключи
streamlit run app.py
```

CLI:

```bash
python main.py --text transcript.txt --json
python main.py --audio meeting.mp3
```

## HTTP-веб-приложение (Flask, без Streamlit)

Альтернатива Streamlit — обычный HTTP-сервер с одной HTML-страницей: запись с
микрофона прямо в браузере (`MediaRecorder`), загрузка файла или вставка текста
→ скачать `.docx`.

```bash
cd meeting-agent
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...     # или положить в .env
python server.py
# открыть http://localhost:8000
```

Эндпоинты: `GET /` (UI), `POST /process` (текст/аудио → JSON + id .docx),
`GET /download/<id>`, `POST /send` (Фаза 2), `GET /contacts`.

> Запись с микрофона работает только в защищённом контексте браузера —
> `http://localhost` или `https://`. На удалённом сервере по обычному `http`
> микрофон недоступен (правило безопасности браузера, не зависит от фреймворка).

## Секреты

Локально — `.streamlit/secrets.toml` (в `.gitignore`). На облаке — те же ключи
в дашборде приложения (**Settings → Secrets**), формат тот же TOML.

| Ключ | Назначение |
|------|------------|
| `ANTHROPIC_API_KEY` | Claude API (извлечение протокола) |
| `TRANSCRIBE_ENGINE` | `whisper_api` \| `yandex` \| `whisper_local` |
| `OPENAI_API_KEY` | для `whisper_api` |
| `YANDEX_API_KEY`, `YANDEX_LANG` | для `yandex` (KZ / микс RU-KZ) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Фаза 2: email |
| `TELEGRAM_BOT_TOKEN` | Фаза 2: Telegram |

## Деплой на Streamlit Community Cloud

1. Запушить проект в **публичный GitHub-репозиторий**.
2. `share.streamlit.io` → **New app** → выбрать репозиторий, ветку и главный файл
   `meeting-agent/app.py`.
3. **Advanced settings → Secrets**: вставить ключи в TOML-формате.
4. **Deploy** → ссылка вида `https://имя.streamlit.app`. Любой `git push` в ветку
   пересобирает приложение.

**Лимиты:** репозиторий публичный; секреты только в дашборде; аудио ≈ до 25 МБ,
длинные встречи резать на части или грузить готовый транскрипт текстом. На облаке
транскрипция — через API (`whisper_api` / `yandex`); `whisper_local` тяжёл для
Community Cloud и предназначен для локального режима.

## Замечания по реализации

- Транскрипция Whisper и Telegram Bot API вызываются напрямую через `requests`,
  поэтому пакеты `openai` и `python-telegram-bot` не нужны — это экономит RAM на
  Community Cloud.
- Извлечение использует **structured outputs** (JSON-схема) + парсинг, валидацию
  и один повтор при ошибке — поручения с не названным сроком/ответственным
  получают «не указан» / «не определён», без выдумок.
