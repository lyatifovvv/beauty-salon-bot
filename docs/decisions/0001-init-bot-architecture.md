---
status: proposed
date: 2026-06-20
decision-makers: [Пользователь]
consulted: [Antigravity]
informed: []
---

# Use Node.js, TypeScript and Grammy for Sebastian Beauty Salon Bot

## Context and Problem Statement

Салону красоты «Sebastian» требуется автоматизировать онлайн-запись клиентов, уведомления о визитах, сбор отзывов и управление расписанием. Нужно запустить надежного Telegram-бота, который не требует сложной внешней CRM на первом этапе, но сохраняет архитектурную гибкость для интеграции с YCLIENTS, DIKIDI и др. в будущем.

## Decision Drivers

* Простота разработки и поддержки для MVP.
* Поддержка асинхронности и высокая скорость работы с Telegram API.
* Необходимость иметь встроенную админку прямо в боте.
* Локальное хранение данных в реляционной БД PostgreSQL.

## Considered Options

* **Option A** — Python (aiogram 3 + SQLAlchemy + PostgreSQL)
* **Option B** — Node.js (TypeScript + Grammy + Prisma + PostgreSQL)
* **Option C** — PHP/Laravel (с интеграцией bot-api)

## Decision Outcome

Chosen option: **Option B — Node.js (TypeScript + Grammy + Prisma + PostgreSQL)**, потому что TypeScript обеспечивает строгую типизацию данных, соответствующую математической модели, библиотека Grammy является самым быстрым и современным фреймворком для Telegram-ботов с отличной поддержкой middleware, а Prisma ORM позволяет легко менять схему БД и делать миграции.

### Consequences

* **Good:** Быстрая скорость работы с Telegram API за счет асинхронного движка Node.js.
* **Good:** Легко выделить CRM-интеграцию в отдельный абстрактный интерфейс (адаптер) на TypeScript.
* **Good:** Отличная поддержка сложных интерактивных меню и сессий пользователей (через сессии Grammy).
* **Bad:** Требует компиляции TypeScript в JS перед запуском в продакшене.

### Confirmation

Через 4 недели мы проверим работоспособность системы по стабильности работы бота (аптайм 99.9%) и отсутствию багов с пересечением записей клиентов (инвариант I1).

## Pros and Cons of the Options

### Option A — Python (aiogram 3)

Популярный стек для ботов на Python.

* **Good:** Много готовых примеров, простой синтаксис.
* **Bad:** Менее привычная экосистема для веб-разработчиков, если потребуется делать WebApp (встроенный сайт в боте).

### Option B — Node.js (TypeScript + Grammy)

Современный JavaScript/TypeScript стек.

* **Good:** Строгая типизация, идеальная интеграция с фронтендом (если в будущем добавится WebApp-интерфейс).
* **Bad:** Чуть больший размер Node-модулей, требуется процесс сборки.
