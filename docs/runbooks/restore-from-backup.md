# Runbook: Восстановление БД из бэкапа

> Что делать если БД испорчена или потеряны данные.

## Где лежат бэкапы

- **На сервере:** `/var/backups/postgres/*.dump` — последние 14 дней
- **На S3 Beget (если настроено):** `s3://your-bucket/db/` — последние 14 дней

## Восстановление: пошагово

### 1. Останови приложение

```bash
ssh root@$BEGET_VPS_IP "systemctl stop myapp"
```

### 2. Создай страховочный бэкап ТЕКУЩЕГО состояния

(Даже если данные испорчены — сохрани на случай если откат пошёл не так)

```bash
ssh root@$BEGET_VPS_IP "pg_dump myapp > /tmp/before-restore-$(date +%F-%H%M).dump"
```

### 3. Найди нужный бэкап

```bash
ssh root@$BEGET_VPS_IP "ls -lh /var/backups/postgres/ | head -20"
```

Выбери последний хороший бэкап (по дате до момента когда всё сломалось).

### 4. Удали испорченную БД и создай заново

```bash
ssh root@$BEGET_VPS_IP "sudo -u postgres psql <<EOF
DROP DATABASE myapp;
CREATE DATABASE myapp;
GRANT ALL PRIVILEGES ON DATABASE myapp TO myapp;
EOF"
```

### 5. Загрузи бэкап

```bash
ssh root@$BEGET_VPS_IP "pg_restore -d myapp /var/backups/postgres/myapp_YYYY-MM-DD.dump"
```

Или для plain SQL:
```bash
ssh root@$BEGET_VPS_IP "psql myapp < /var/backups/postgres/myapp_YYYY-MM-DD.sql"
```

### 6. Запусти приложение

```bash
ssh root@$BEGET_VPS_IP "systemctl start myapp"
ssh root@$BEGET_VPS_IP "systemctl status myapp"
curl -I https://<domain>/healthz
```

### 7. Проверь данные

Войди в админку, проверь что записи на месте. Если что-то не так — у тебя есть `before-restore-*.dump` чтобы откатить откат.

## Если бэкапов нет

Это **крайний случай**. Beget делает snapshot диска раз в сутки — обратись в поддержку Beget (`@beget_support_bot` в Telegram) с просьбой восстановить snapshot.

## Профилактика

- Проверяй бэкапы раз в месяц: `ssh root@<IP> "ls -lh /var/backups/postgres/ | head"` — должны быть свежие
- Тестируй восстановление на staging (бонус-урок)
- Сохраняй важные бэкапы на свой компьютер раз в месяц: `scp root@<IP>:/var/backups/postgres/myapp_$(date +%F).dump ~/backups/`
