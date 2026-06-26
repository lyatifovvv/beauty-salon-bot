---
status: proposed
date: 2026-06-20
decision-makers: [Пользователь]
consulted: [Antigravity]
informed: []
---

# Use SQLite for Local Development and String-based JSON/Enum Storage

## Context and Problem Statement

Для упрощения локального запуска и тестирования бота «Sebastian» без необходимости разворачивать СУБД PostgreSQL на компьютере пользователя, предложено использовать SQLite. Однако SQLite не поддерживает типы `Json` и `Enum` в Prisma ORM.

## Decision Drivers

* Простота локального запуска: база данных должна создаваться автоматически в одном файле `dev.db`.
* Совместимость с PostgreSQL: схема базы данных и кодовая база должны быть переносимыми на PostgreSQL на сервере Beget с минимальными изменениями (только провайдер и строка подключения).
* Сохранение инвариантов `MATH_MODEL.md`.

## Proposed Changes

* Изменить провайдер базы данных в `prisma/schema.prisma` на `sqlite`.
* Изменить поле `Master.workingHours` с типа `Json` на `String`, добавив явный парсинг JSON в коде приложения.
* Изменить типы перечислений (`enum`) в `Appointment` и `Notification` на `String`, сохранив валидацию строковых значений на уровне приложения и TypeScript.

## Decision Outcome

Chosen option: **SQLite для локальной разработки с хранением JSON/Enums в виде String**, так как это позволяет запускать проект одной командой `npx prisma migrate dev` без зависимостей от внешних баз данных, и сохраняет полную готовность схемы и кода к переключению на PostgreSQL на сервере.

### Consequences

* **Good:** Нулевые требования к настройке окружения для тестирования (база в файле `dev.db`).
* **Good:** Быстрые миграции и сидинг.
* **Good:** Полная совместимость схемы с PostgreSQL при смене провайдера.
* **Bad:** Требует ручной сериализации (`JSON.stringify`) и десериализации (`JSON.parse`) рабочих часов в коде (реализовано в `masterService`, `appointmentService` и `adminHandlers`).
