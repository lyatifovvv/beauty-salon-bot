# Runbook: Проблемы с SSL-сертификатом

> Что делать если сайт показывает «небезопасное соединение» или сертификат истёк.

## Симптомы

- Браузер показывает «Not secure» или красный замок
- Ошибка `NET::ERR_CERT_DATE_INVALID`
- `curl https://домен` ругается на сертификат

## Диагностика

```bash
ssh root@$BEGET_VPS_IP "certbot certificates"
```

Покажет все сертификаты и даты истечения.

## Решение 1: Принудительное обновление

```bash
ssh root@$BEGET_VPS_IP "certbot renew --force-renewal"
ssh root@$BEGET_VPS_IP "systemctl reload nginx"
```

## Решение 2: Получение сертификата заново

Если обновление не помогло:

```bash
ssh root@$BEGET_VPS_IP "certbot --nginx -d <domain> -d www.<domain> --reinstall"
```

## Профилактика

certbot обновляет сертификаты автоматически каждые 60 дней через systemd timer. Проверка работает ли:

```bash
ssh root@$BEGET_VPS_IP "systemctl list-timers | grep certbot"
```

Должно показывать активный таймер `certbot.timer`.

## Если ничего не помогает

```
@friendly-troubleshooter SSL сертификат не обновляется, что делать?
```

Передай управление агенту — он посмотрит логи certbot и нашёл реальную причину.
