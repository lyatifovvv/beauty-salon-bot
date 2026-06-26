# Карта документации проекта

## docs/core/ — основа проекта (читается всегда)

- `MATH_MODEL.md` — единственный источник правды о том как работает проект
- `WORKFLOW_RULES.md` — железные правила процесса разработки
- `ARCHITECTURE.md` — как устроено технически
- `TECH_STACK.md` — на чём пишем
- `GLOSSARY.md` — словарь терминов

## docs/decisions/ — Architecture Decision Records (MADR 4.0)

- `_template.md` — шаблон
- `0001-*.md`, `0002-*.md`... — конкретные решения

Любое архитектурное решение → новый файл здесь.

## docs/specs/ — спеки фичей

Для каждой большой фичи — папка `NNN-name/`:
- `spec.md` — что и зачем (user stories, acceptance criteria)
- `plan.md` — как реализуем (технический план)
- `tasks.md` — конкретные задачи (vertical slices)

## docs/runbooks/ — что делать когда X

Операционные инструкции для типовых ситуаций:
- `deploy.md` — деплой обновлений
- `restore-from-backup.md` — восстановление БД
- `ssl-troubleshoot.md` — проблемы с сертификатом

## docs/reference/ — справочники

Технические справочники: схема БД, env-переменные, slash-команды.

## docs/examples/ — образцы

Образцы документов для агентов:
- `EXAMPLE_BRIEF.md`
- `EXAMPLE_MATH_MODEL.md`
