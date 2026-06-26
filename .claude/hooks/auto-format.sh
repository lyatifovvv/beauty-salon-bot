#!/usr/bin/env bash
# Автоформатирование файла после Edit/Write.
# Тихо игнорирует ошибки — не блокирует работу Claude.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.css)
    npx --no-install prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  *.py)
    ruff format "$FILE_PATH" 2>/dev/null || black "$FILE_PATH" 2>/dev/null || true
    ;;
esac

exit 0
