# Mayurika

Персональная кицунэ-помощница. Утверждена архитектура из **90 функций**, реализуется поэтапно.

## Текущий этап: локальный чат и SQLite

- Python — единственный API, только `127.0.0.1`; Node.js используется только для frontend.
- SQLite хранит диалоги, сообщения, кандидаты воспоминаний и события.
- Чат с историей диалогов, контекстом из локальной памяти и настраиваемым облачным HTTPS endpoint.
- TypeScript + Canvas + CSS, чёрно-золотой интерфейс.
- Запуск через `Mayurika.bat` с уже установленным TypeScript `tsc`.

## Облачное подключение

**Поддерживается документированный OpenAI-совместимый API Cloud.ru Foundation Models.** Адрес по умолчанию: `https://foundation-models.api.cloud.ru/v1/chat/completions`. Реальное соединение с ключом пользователя пока не проверено.

В Windows PowerShell установи переменные окружения перед запуском (не вставляй настоящий ключ в GitHub):

```powershell
$env:MAYURIKA_CHAT_URL="https://foundation-models.api.cloud.ru/v1/chat/completions" # необязательно
$env:MAYURIKA_CHAT_MODEL="YOUR_MODEL"
$env:MAYURIKA_CHAT_KEY="YOUR_PRIVATE_KEY"
.\Mayurika.bat
```

Настройки существуют только в окружении процесса. Не сохраняй ключ в BAT, README или коммитах. Сервер отправляет запросы только на указанный HTTPS endpoint. Для Cloud.ru Foundation Models используется Bearer API key. Модель можно узнать через `GET /api/cloud/models` после задания ключа и запуска. Не отправляй ключ в чат или GitHub.

## API

- `GET /api/health` — статус базы и наличие настроек облака (без проверки соединения).
- `GET /api/cloud/models` — список доступных моделей от Cloud.ru (требует ключа в окружении).\n- `GET /api/conversations` — история диалогов.
- `GET /api/chat/history?id=...` — сообщения диалога.
- `POST /api/chat` — `{"content":"Привет","conversation_id":null}`; возвращает `{"answer":"...","conversation_id":"..."}`.
- `POST /api/memory` — заметка со статусом `pending`.
- `GET /api/memory/search?q=...` — локальный поиск.
- `GET /api/events` — реальные события.

При сетевой ошибке ответ не записывается как успешный диалог. Входящие воспоминания **не считаются подтверждёнными фактами**.

## Пока не реализовано

Потоковый вывод токенов, реальные Cloud.ru-specific API и embeddings, векторный поиск, полноценная проверка фактов, SOUL CORE, самообучение и агенты. Это следующий этап. Никаких новых сторонних зависимостей не добавлено.

## Проверка

```powershell
python -m unittest discover -s tests -v
```

Данные находятся в `data/memory.sqlite3` и не попадают в Git. Не публикуй локальный API в интернет: полноценная аутентификация ещё не реализована.
