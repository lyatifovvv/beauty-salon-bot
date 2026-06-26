---
description: Выбрать тех. стек и спроектировать архитектуру
model: opus
allowed-tools: Read, Write, Edit, WebSearch
---

## Pre-flight
- TECH_STACK.md уже создан: !`[ -f docs/core/TECH_STACK.md ] && echo "ДА — это изменение, нужен ADR" || echo "НЕТ — создаём с нуля"`

## Workflow check

Если архитектура уже зафиксирована — направь: `@reviewer хочу изменить <X>. Обнови мат-модель и ARCHITECTURE.md, создай ADR.`

## Зафиксировано курсом (не обсуждать)

- ОС: **Ubuntu 24.04 LTS**
- Хостинг: **Beget VPS, регион РФ**
- Один VPS на всё (приложение + БД + nginx)
- БД по умолчанию: **PostgreSQL** на том же VPS
- Деплой: **systemd + nginx + Let's Encrypt** (без Docker)

## Что выбираешь ты

- Размер VPS (из `BEGET_CATALOG.md`)
- Язык и фреймворк под тип проекта
- Доп. сервисы (Redis, S3) — только если нужны

## Дефолтные стеки (предложи, не обсуждай долго)

- **Веб-приложение / SaaS / лендинг** → Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui + Drizzle + PostgreSQL + Better Auth
- **Telegram-бот** → Python 3.12 + aiogram 3.x + SQLAlchemy async + asyncpg + Redis
- **Telegram Mini App** → Next.js 15 + @telegram-apps/sdk v3 + @telegram-apps/telegram-ui + aiogram backend
- **API only** → FastAPI 0.115+ + SQLAlchemy async + Drizzle

## Прочитай

`PROJECT_BRIEF.md`, `docs/core/MATH_MODEL.md`, `BEGET_CATALOG.md`.

## Заполни три файла

### 1. `docs/core/TECH_STACK.md` (через Write)

```markdown
# Тех. стек

## Тип проекта
[бот / веб / API / лендинг]

## Сервер (зафиксировано курсом)
- ОС: Ubuntu 24.04 LTS
- Хостинг: Beget VPS, регион РФ
- Тариф: [X CPU / Y ГБ RAM / Z ГБ NVMe] — [N] ₽/мес

## Стек
- Язык: [X.Y]
- Фреймворк: [X] [версия] — почему (1 строка)
- БД: PostgreSQL 16 на том же VPS
- ORM: [Drizzle / SQLAlchemy]
- Миграции: [Drizzle Kit / Alembic]
- Auth: [Better Auth / Clerk / N/A]
- Тесты: [Vitest / pytest]
- Линтер: [eslint / ruff]

## Дополнительные сервисы
- [Redis на том же VPS — для чего, если нужно]
- [Beget S3 — для файлов, если есть]

## Внешние API
- [сервис: для чего]

## Команды
- Локальный запуск: `[команда]`
- Тесты: `[команда]`
- Миграции: `[команда]`
```

### 2. `docs/core/ARCHITECTURE.md` (через Write)

Mermaid-схема + список компонентов + где живут данные + структура папок + команда локального запуска + план деплоя.

### 3. `.env.example` — обнови через Edit существующий

**Правила:**
- ✅ В .env идут: секреты, среда-зависимое
- ❌ НЕ идут: бизнес-константы (→ MATH_MODEL.md §2 + код), настройки фреймворка с дефолтами, тексты, дубли

**Три категории с эмодзи:**
- 👤 — заполняет пользователь (уже есть: BEGET_*, LETSENCRYPT_EMAIL)
- 🤖 — заполнит Claude при /deploy (уже есть: DATABASE_URL, APP_SECRET)
- 🔑 — Claude попросит в нужный момент

**Под выбранный стек добавь только нужные блоки 🔑:**

- Telegram-бот → `TELEGRAM_BOT_TOKEN`
- AI → `ANTHROPIC_API_KEY` или `OPENAI_API_KEY`
- Платежи → `YOOKASSA_*`
- Better Auth → `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- Clerk → `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- S3 → `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`

Не добавляй блок если не нужен.

## Также обнови

- `.gitignore` — добавь специфику стека
- Создай заготовку `README.md` приложения (одна команда запуска)

## Финал

Дай резюме:

```
ВЫБОР СТЕКА
- Сервер: Beget VPS, [тариф], ~[N] ₽/мес
- Стек: [X] потому что [короткая причина]

ЧТО ТЕБЕ НУЖНО СДЕЛАТЬ
1. Купить VPS на Beget (Ubuntu 24.04 LTS, [тариф])
2. (Если хочешь свой домен) .ru за 199 ₽/год
3. Из письма Beget — впиши в .env 4 значения (BEGET_*)

ЧТО Я СДЕЛАЮ ПРИ /deploy
- DATABASE_URL и APP_SECRET сгенерирую сам
- [список 🔑 — что попрошу у тебя в процессе]

Готов? Дальше /dev — начнём писать код.
```
