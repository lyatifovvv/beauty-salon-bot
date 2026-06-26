#!/usr/bin/env bash
# Если в последнем сообщении большая ошибка/трейс — просим Claude переформулировать.
# Срабатывает на Stop. Exit 2 заставляет Claude продолжить с подсказкой.

INPUT=$(cat)
LAST=$(echo "$INPUT" | jq -r '.transcript[-1].content // ""' 2>/dev/null || echo "")

if [ -z "$LAST" ]; then
  exit 0
fi

# Только длинные технические простыни
WORD_COUNT=$(echo "$LAST" | wc -w)
if [ "$WORD_COUNT" -lt 200 ]; then
  exit 0
fi

# Ищем признаки технического сообщения
if echo "$LAST" | grep -qiE 'traceback|stack trace|error:|exception:|exit code|ENOENT|ECONNREFUSED|segmentation fault|fatal:'; then
  echo "Сообщение выше слишком техническое для пользователя. Переформулируй: начни с 'не паникуй', одним простым предложением скажи что произошло, дай 2-3 варианта что делать. Без английских терминов." >&2
  exit 2
fi

exit 0
