#!/usr/bin/env bash
# Загружает свежий контекст в начало каждой сессии Claude Code.

DATE=$(date '+%d.%m.%Y %H:%M')
BRANCH=$(git branch --show-current 2>/dev/null || echo "не git репозиторий")
DIRTY_COUNT=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
PROJECT_NAME=$(basename "$PWD")

# Файл-индикатор «проект уже настроен»
HAS_BRIEF="нет"
[ -f "PROJECT_BRIEF.md" ] && HAS_BRIEF="да"
HAS_MATH="нет"
[ -f "MATH_MODEL.md" ] && HAS_MATH="да"

CONTEXT=$(cat <<EOF
Контекст сессии:
- Дата: $DATE
- Проект: $PROJECT_NAME
- Ветка: $BRANCH
- Незакоммиченных файлов: $DIRTY_COUNT
- PROJECT_BRIEF.md: $HAS_BRIEF
- MATH_MODEL.md: $HAS_MATH

Если пользователь новый (нет PROJECT_BRIEF.md) — предложи начать с /start.
Общайся на русском, на «ты», без технического жаргона.
EOF
)

# Возвращаем JSON с additionalContext
echo "{\"additionalContext\": $(echo "$CONTEXT" | jq -Rs .)}"
