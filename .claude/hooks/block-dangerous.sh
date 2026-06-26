#!/usr/bin/env bash
# Блокирует опасные bash-команды до их выполнения.
# Срабатывает на PreToolUse:Bash. Exit code 2 = блокировка с сообщением в stderr.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

if [ -z "$CMD" ]; then
  exit 0
fi

# Опасные паттерны
if echo "$CMD" | grep -qE 'rm -rf /[^/]*$|rm -rf /\*|rm -rf ~|rm -rf \$HOME|sudo rm -rf|chmod -R 777 /|chown -R .* /|dd if=.* of=/dev/(sda|nvme)|mkfs\.|:\(\)\{:\|:&\};:|> /dev/sda|> /dev/nvme|fdisk /dev|wipefs|shred /dev'; then
  echo "⛔ Опасная команда заблокирована: уничтожит систему или диск" >&2
  echo "Если действительно нужно — выполни вручную в терминале с явным подтверждением" >&2
  exit 2
fi

# Защита БД
if echo "$CMD" | grep -qiE 'drop database|drop table.*cascade|truncate.*cascade'; then
  echo "⛔ Опасная SQL-команда заблокирована: безвозвратное удаление данных" >&2
  echo "Сначала сделай бэкап: pg_dump <db> > backup.sql, потом подтверди вручную" >&2
  exit 2
fi

# Git force push в main
if echo "$CMD" | grep -qE 'git push.*--force.*main|git push.*-f.*main'; then
  echo "⛔ git push --force в main заблокирован: перезапишет историю на сервере" >&2
  echo "Если это намеренно — выполни вручную в терминале" >&2
  exit 2
fi

exit 0
