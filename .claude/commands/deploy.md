---
description: Первичный деплой на VPS Beget с Ubuntu 24.04
model: opus
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Grep
---

## Pre-flight
- .env заполнен: !`grep -E "^BEGET_VPS_IP=." .env 2>/dev/null && echo "ДА" || echo "НЕТ — заполни .env"`
- Тесты локально: !`(cd $(pwd) && pnpm test 2>&1 | tail -5) || (python -m pytest 2>&1 | tail -5) || echo "тесты не настроены"`

## Workflow check

Прочитай `docs/core/WORKFLOW_RULES.md`.

**Откажись если:**
- В `REVIEW.md` остались `❌` блокеры (если ревью было) — «Сначала исправь блокеры через `/dev`».
- Тесты падают локально — «Не деплою сломанное».
- Пустые поля `👤` в `.env` — попроси заполнить.

## Контекст

Это **ПЕРВИЧНЫЙ деплой** на один VPS Beget (Ubuntu 24.04 LTS) под root. Запускается ОДИН РАЗ после первого блока разработки.

**Дальше `/dev` сам делает `git push + systemctl restart`** на каждый блок.

## Категории полей в `.env`

- **👤** — заполнил пользователь: `BEGET_VPS_IP`, `BEGET_VPS_USER`, `BEGET_VPS_PASSWORD`, `BEGET_DOMAIN`, `LETSENCRYPT_EMAIL`
- **🤖** — заполняешь ты при деплое:
  - `DATABASE_URL = postgresql://myapp:<password>@localhost:5432/myapp` где `<password> = $(openssl rand -base64 24 | tr -d '/+=' | head -c 32)`
  - `APP_SECRET = $(openssl rand -hex 32)`
- **🔑** — попроси у пользователя если пусто. Скажи где брать:
  - `TELEGRAM_BOT_TOKEN` → @BotFather: `/newbot`
  - `ANTHROPIC_API_KEY` → console.anthropic.com → API Keys
  - `YOOKASSA_*` → личный кабинет YooKassa
  - `BETTER_AUTH_SECRET = $(openssl rand -hex 32)` — генерируй сам

Вписывай через Edit. Перед заливкой на сервер — финальная проверка что все поля заполнены.

## SSH с паролем

Используй `sshpass`. Mac: `brew install hudochenkov/sshpass/sshpass`. Linux: `apt install sshpass`. Все ssh:
```bash
sshpass -p "$BEGET_VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@$BEGET_VPS_IP "<команды>"
```

Если `sshpass` нет — попроси пользователя вводить пароль вручную.

## План деплоя

Между шагами — отчитайся и жди подтверждения. Перед опасными командами (rm, drop) — явный OK.

1. **Проверка** — `uname -a`, `lsb_release -a`. Ubuntu 24.04 LTS?
2. **Пакеты** — `apt update && apt upgrade -y`, поставь: `git curl ufw fail2ban certbot python3-certbot-nginx nginx postgresql postgresql-contrib` + специфика стека (python3.12+venv ИЛИ nodejs LTS, redis-server если нужно).
3. **Firewall** — `ufw allow 22,80,443`, deny остальное, enable.
4. **PostgreSQL (🤖)** — создай пользователя `myapp`, базу `myapp`, дай права. Впиши `DATABASE_URL` в локальный `.env`.
5. **APP_SECRET (🤖)** — сгенерируй через `openssl rand -hex 32`, впиши в локальный `.env`.
6. **Заполни 🔑** — проверь пустые поля, попроси по одному.
7. **GitHub.** Если репо нет — попроси создать приватный на github.com, дай URL. Запушь.
8. **Код на сервер** — `git clone` в `/root/app`. Приватный → deploy-key.
9. **Зависимости + миграции** — под стек из `TECH_STACK.md`.
10. **`.env` на сервер** — `scp .env root@$IP:/root/app/.env`.
11. **systemd** — создай `/etc/systemd/system/myapp.service` с `Type=notify`, `KillMode=mixed`, `TimeoutStopSec=15`, `MemoryMax=400M`. `systemctl enable --now`, `journalctl -u myapp -n 50`.
12. **nginx** — конфиг в `/etc/nginx/sites-available/myapp` с upstream backend, `add_header Strict-Transport-Security`, симлинк, `nginx -t`, reload.
13. **SSL** — `certbot --nginx -d $BEGET_DOMAIN -d www.$BEGET_DOMAIN --non-interactive --agree-tos --email $LETSENCRYPT_EMAIL`.
14. **Health endpoint** — добавь `/healthz` в приложение если ещё нет (быстрый, без auth, 200 на жизнь процесса).
15. **Проверка прод** — `curl -I https://$BEGET_DOMAIN` → 200. Попроси открыть в браузере.
16. **Бэкапы (если есть S3)** — `/root/backup.sh` с pg_dump | gzip | aws s3, cron на 3 ночи, ротация 14 дней.
17. **deploy.log** — сохрани локально через Write со всеми командами.

## Итоговый отчёт

```
✅ ПЕРВИЧНЫЙ ДЕПЛОЙ ЗАВЕРШЁН

🌐 Твой сайт: https://<DOMAIN>

Дальше: каждый блок /dev будет сам выкатывать обновления.
Тебе ничего не надо делать — продолжай /dev.

Утилиты:
  Перезапуск:  ssh root@<IP> "systemctl restart myapp"
  Логи:        ssh root@<IP> "journalctl -u myapp -f"
  Бэкапы:      /var/backups/postgres/ (если настроено)

Сейчас:
1. /permissions → default (вернись в обычный режим)
2. /dev — продолжить разработку
```

Если падает — останавливайся, показывай ошибку через `@friendly-troubleshooter`. Не обходи тихо.
