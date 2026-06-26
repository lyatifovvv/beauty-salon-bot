# Runbook: Деплой обновлений

> Автоматический деплой после каждого блока разработки. Этот документ описывает что под капотом.

## Когда применяется

После каждого блока в `/dev` Claude автоматически:
1. Тесты локально → если зелёные
2. `git push origin main`
3. SSH на сервер: `git pull` + миграции БД (если есть) + `systemctl restart myapp`
4. `curl https://домен/healthz` — проверка что прод поднялся

## Если деплой упал

Claude автоматически откатит:
```bash
git revert HEAD
git push
ssh root@$BEGET_VPS_IP "cd /root/app && git pull && systemctl restart myapp"
```

Потом передаст управление `@friendly-troubleshooter` для диагностики.

## Ручной деплой (если надо)

В Claude Code:
```
/deploy
```

Или вручную с компьютера:
```bash
git push origin main
ssh root@<IP> "cd /root/app && git pull && pnpm install --prod && systemctl restart myapp"
```

## Откат к предыдущей версии

```bash
ssh root@<IP> "cd /root/app && git log --oneline -10"
# выбери коммит к которому откатиться
ssh root@<IP> "cd /root/app && git reset --hard <commit-sha> && systemctl restart myapp"
```

## Проверка статуса прода

```bash
ssh root@<IP> "systemctl status myapp"
ssh root@<IP> "journalctl -u myapp -n 100"
curl -I https://<domain>/healthz
```
