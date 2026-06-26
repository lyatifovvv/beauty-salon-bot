# Математическая модель KvitNo (compact)

> v1.0 · Telegram-бот для записи в бьюти-салон (1 салон, 1-5 мастеров) · Валюта: ₽ · Часовой пояс: Europe/Moscow
> Уровень данных: сущности, типы. Уровень правил: инварианты I1-I12. Уровень операций: команды с pre/post. Уровень UX: сценарии UC-01..UC-05.

---

## 1. Пространство состояний

### 1.1 Service (услуга)

```
Service = {
  id: UUID,
  name: String[1..100],
  duration_minutes: ℕ₊,           кратно 15, ∈ [15, 480]
  price_rub: ℕ₀,
  is_active: Boolean,             default true
  created_at: DateTime
}
```

// бизнес-смысл: услуга в каталоге, доступна клиенту если is_active=true

### 1.2 Master (мастер)

```
Master = {
  id: UUID,
  name: String[1..100],
  photo_url: String | null,
  service_ids: Set<UUID>,         какие услуги делает (ссылки на Service.id)
  working_hours: Map<Weekday, TimeRange | null>,
                                  Weekday ∈ {1..7}, null = выходной
                                  TimeRange = { from: Time, to: Time }
  vacation_from: Date | null,
  vacation_to: Date | null,
  is_active: Boolean              default true
}

isOnVacation(master, date) → master.vacation_from ≤ date ≤ master.vacation_to
isAvailable(master, date) → master.is_active ∧ ¬isOnVacation(master, date)
```

// бизнес-смысл: мастер с расписанием и услугами, отпуск — диапазон дат

### 1.3 Client (клиент)

```
Client = {
  id: UUID,
  telegram_id: ℕ₊,                уникален (см. I8)
  name: String[1..100],
  phone: String,                  matches /^\+7\d{10}$/  (см. §7.F2)
  created_at: DateTime,
  is_blocked: Boolean             default false
}
```

// бизнес-смысл: зарегистрированный клиент (оставил имя и телефон). Гость → не Client.

### 1.4 Appointment (запись)

```
Appointment = {
  id: UUID,
  client_id: UUID,                FK → Client.id
  master_id: UUID,                FK → Master.id
  service_id: UUID,               FK → Service.id
  starts_at: DateTime,            tz = Europe/Moscow
  ends_at: DateTime,              вычисляется при создании, см. §7.F1
  price_rub_snapshot: ℕ₀,         цена на момент создания (см. §7.F3)
  status: AppointmentStatus,
  created_at: DateTime,
  cancelled_at: DateTime | null,
  cancel_reason: String | null
}

AppointmentStatus = "confirmed" | "cancelled_by_client" | "cancelled_by_admin" | "completed" | "no_show"
```

// бизнес-смысл: запись клиента на услугу к мастеру в конкретное время

### 1.5 Notification (напоминание)

```
Notification = {
  id: UUID,
  appointment_id: UUID,           FK → Appointment.id
  type: NotificationType,
  scheduled_at: DateTime,         когда отправить
  sent_at: DateTime | null,
  status: NotificationStatus
}

NotificationType = "reminder_24h" | "reminder_1h" | "cancellation_notice"
NotificationStatus = "pending" | "sent" | "cancelled" | "failed"
```

### 1.6 AdminSession (сессия администратора)

```
AdminSession = {
  telegram_id: ℕ₊,
  authenticated_at: DateTime,
  expires_at: DateTime            = authenticated_at + 7 days  (см. §2)
}
```

// бизнес-смысл: подтверждённый доступ владельцы к /admin на 7 дней

---

## 2. Константы

```
Символ                  Значение      Описание
── Временные окна ──
BOOKING_HORIZON_DAYS    30            максимум насколько вперёд можно записаться
BOOKING_LEAD_HOURS      2             минимум за сколько часов до начала
CANCEL_DEADLINE_HOURS   24            клиент может отменить не позже этого срока
── Слоты ──
SLOT_GRID_MINUTES       15            шаг сетки слотов (см. §7.F4)
── Напоминания ──
REMINDER_24H            24h           за сколько шлём напоминание-1
REMINDER_1H             1h            за сколько шлём напоминание-2
── Админ ──
ADMIN_SESSION_DAYS      7             длительность сессии после ввода пароля
ADMIN_PASSWORD_HASH     <bcrypt>      хеш пароля в .env (cost ≥ 12)
── Производные ──
TIMEZONE                Europe/Moscow часовой пояс расчётов
WORK_DAYS_LIMIT_PAST    30            насколько в прошлое можно ставить completed/no_show
```

---

## 3. Начальное состояние

```
При первом запуске бота:
- Service = []
- Master = []
- Client = []
- Appointment = []
- Admin создаёт первые Service и Master через /admin

Тестовый дефолт (для разработки): 1 Service ("Маникюр", 60 min, 1500₽), 1 Master ("Тест-мастер")
```

---

## 4. Роли

```
Role = "guest" | "client" | "admin"

roleOf(telegram_id) →
  ∃ session ∈ AdminSession: session.telegram_id = telegram_id ∧ now < session.expires_at  → "admin"
  ∃ client ∈ Client: client.telegram_id = telegram_id ∧ ¬client.is_blocked                → "client"
  иначе                                                                                     → "guest"
```

// бизнес-смысл: пользователь определяется по telegram_id; админ-статус действует на сессию

---

## 5. Lifecycle Appointment

```
Состояния и переходы:

confirmed → cancelled_by_client
  trigger:    клиент нажал «Отменить»
  guard:      now < starts_at − CANCEL_DEADLINE_HOURS
  side:       cancel pending notifications для этого appointment
              notify admin (см. §11.N4)

confirmed → cancelled_by_admin
  trigger:    админ отменил из /admin
  guard:      —
  side:       cancel pending notifications
              notify client (см. §11.N5)

confirmed → completed
  trigger:    админ нажал «Клиент пришёл»
  guard:      starts_at < now
  side:       —

confirmed → no_show
  trigger:    админ нажал «Не пришёл»
  guard:      starts_at < now ∧ now − starts_at < WORK_DAYS_LIMIT_PAST days
  side:       —

Из конечных состояний (cancelled_*, completed, no_show) переходов НЕТ.
```

// бизнес-смысл: запись подтверждена сразу при создании, дальше отменяется или завершается

---

## 6. Инварианты

```
I1: ∀ a1, a2 ∈ Appointment, a1.id ≠ a2.id, a1.master_id = a2.master_id,
    a1.status = "confirmed", a2.status = "confirmed" →
    [a1.starts_at, a1.ends_at) ∩ [a2.starts_at, a2.ends_at) = ∅
    // один мастер не ведёт два приёма одновременно

I2: ∀ a ∈ Appointment → a.ends_at = a.starts_at + duration(a.service_id)
    // конец = начало + длительность (см. §7.F1)

I3: ∀ a ∈ Appointment при создании → a.starts_at > now + BOOKING_LEAD_HOURS
    // нельзя записаться меньше чем за 2 часа

I4: ∀ a ∈ Appointment при создании → a.starts_at < now + BOOKING_HORIZON_DAYS days
    // нельзя записаться дальше чем на 30 дней

I5: ∀ a ∈ Appointment, a.service_id ∈ master(a.master_id).service_ids
    // мастер должен уметь делать эту услугу

I6: ∀ a ∈ Appointment при создании →
    a.starts_at попадает в working_hours(master(a.master_id), weekday(a.starts_at))
    ∧ a.ends_at попадает в то же окно (не выходит за конец рабочего дня)
    // запись внутри рабочих часов мастера

I7: ∀ a ∈ Appointment при создании →
    ¬isOnVacation(master(a.master_id), date(a.starts_at))
    // мастер не в отпуске на дату записи

I8: ∀ c1, c2 ∈ Client, c1.id ≠ c2.id → c1.telegram_id ≠ c2.telegram_id
    // один Telegram-аккаунт = один Client

I9: ∀ s1, s2 ∈ Service, s1.id ≠ s2.id → s1.name ≠ s2.name
    // имена услуг уникальны в рамках салона

I10: ∀ a ∈ Appointment, a.status ≠ "confirmed" → a.cancelled_at ≠ null
     ∨ a.status ∈ {"completed", "no_show"}
    // отменённые имеют дату отмены

I11: ∀ c ∈ Client, c.is_blocked = true → ¬∃ a ∈ Appointment created after block:
     a.client_id = c.id
    // заблокированные не создают новых записей

I12: ∀ n ∈ Notification, n.appointment_id refers to a ∈ Appointment,
     a.status ∈ {"cancelled_by_client", "cancelled_by_admin"} →
     n.status ∈ {"sent", "cancelled"}
    // напоминания отменяются вместе с отменой записи
```

---

## 7. Формулы

```
F1: ends_at = starts_at + duration_minutes(service_id) × 1 minute
    Пример: service.duration_minutes = 60, starts_at = 2025-05-15 14:00
            → ends_at = 2025-05-15 15:00

F2: validPhone(phone) ⟺ matches(phone, /^\+7\d{10}$/)
    Примеры: "+79991234567" ✓, "8-999-123-45-67" ✗, "+7999123456" ✗

F3: price_rub_snapshot = service.price_rub  (на момент создания записи)
    Пример: Service «Маникюр» на 15.05 имеет price_rub = 1500.
            Запись создана 15.05 → snapshot = 1500.
            16.05 админ меняет price_rub на 1800.
            Существующая запись: цена остаётся 1500. Новая запись после 16.05: snapshot = 1800.

F4: availableSlots(master_id, service_id, date) →
    1. service = Service[service_id]
    2. master = Master[master_id]
    3. Если ¬isAvailable(master, date) → []
    4. workWindow = working_hours(master, weekday(date))
       Если workWindow = null → []
    5. existing = { a ∈ Appointment : a.master_id = master_id ∧
                                       date(a.starts_at) = date ∧
                                       a.status = "confirmed" }
    6. busyIntervals = { [a.starts_at, a.ends_at) : a ∈ existing }
    7. freeIntervals = workWindow \ ⋃ busyIntervals
    8. candidates = { t ∈ freeIntervals : t — точка сетки шагом SLOT_GRID_MINUTES,
                                          t + service.duration_minutes ∈ freeIntervals }
    9. result = { t ∈ candidates : t > now + BOOKING_LEAD_HOURS ∧
                                   t < now + BOOKING_HORIZON_DAYS days }

    Пример: master Катя работает Wed 10:00-19:00, отпуск нет.
            Существующая запись 14:00-15:00 (status=confirmed).
            Услуга «Маникюр» duration=60.
            now = Wed 09:30.
            → freeIntervals = [10:00, 14:00) ∪ [15:00, 19:00)
            → candidates (60 min слоты с шагом 15):
              10:00, 10:15, ..., 13:00,  15:00, 15:15, ..., 18:00
            → result (фильтр > 11:30 = now+2h):
              11:30, 11:45, 12:00, 12:30, 12:45, 13:00,
              15:00, 15:15, ..., 18:00
```

---

## 8. Операции

Каждая операция: pre-условия (что должно быть истиной для выполнения), post-условия (что становится истиной после), side-effects (что ещё происходит).

### 8.1 createClient(telegram_id, name, phone)

```
pre:  roleOf(telegram_id) = "guest" ∧ validPhone(phone) ∧ name ≠ ""
post: ∃ c ∈ Client: c.telegram_id = telegram_id ∧ c.name = name ∧ c.phone = phone
      ∧ roleOf(telegram_id) = "client"
side: —
errors: PHONE_INVALID, ALREADY_REGISTERED
```

### 8.2 createAppointment(client_id, master_id, service_id, starts_at)

```
pre:  ¬Client[client_id].is_blocked
      ∧ service_id ∈ Master[master_id].service_ids                            (I5)
      ∧ starts_at > now + BOOKING_LEAD_HOURS                                  (I3)
      ∧ starts_at < now + BOOKING_HORIZON_DAYS days                           (I4)
      ∧ starts_at ∈ availableSlots(master_id, service_id, date(starts_at))    (I1, I6, I7)
post: ∃ a ∈ Appointment: a.client_id = client_id ∧ ... ∧ a.status = "confirmed"
      ∧ a.ends_at = a.starts_at + duration(service_id)                        (I2)
      ∧ a.price_rub_snapshot = Service[service_id].price_rub                  (F3)
      ∧ ∃ n_24, n_1 ∈ Notification: linked to a, scheduled at -24h и -1h
side: notify admin (см. §11.N1)
errors: SLOT_TAKEN, MASTER_UNAVAILABLE, OUTSIDE_HORIZON, CLIENT_BLOCKED
```

### 8.3 cancelByClient(appointment_id, by_client_id)

```
pre:  ∃ a ∈ Appointment: a.id = appointment_id
      ∧ a.client_id = by_client_id
      ∧ a.status = "confirmed"
      ∧ now < a.starts_at − CANCEL_DEADLINE_HOURS                             (Lifecycle guard)
post: a.status = "cancelled_by_client" ∧ a.cancelled_at = now
side: cancel pending Notifications для a (I12)
      notify admin (§11.N4)
errors: TOO_LATE_TO_CANCEL, NOT_OWN_APPOINTMENT, ALREADY_CANCELLED
```

### 8.4 cancelByAdmin(appointment_id, reason)

```
pre:  ∃ a ∈ Appointment: a.id = appointment_id ∧ a.status = "confirmed"
      ∧ roleOf(caller) = "admin"
post: a.status = "cancelled_by_admin" ∧ a.cancelled_at = now ∧ a.cancel_reason = reason
side: cancel pending Notifications для a
      notify client (§11.N5)
errors: NOT_FOUND, ALREADY_FINAL
```

### 8.5 markCompleted(appointment_id), markNoShow(appointment_id)

```
markCompleted:
  pre:  a.status = "confirmed" ∧ a.starts_at < now ∧ roleOf(caller) = "admin"
  post: a.status = "completed"

markNoShow:
  pre:  a.status = "confirmed" ∧ a.starts_at < now
        ∧ now − a.starts_at < WORK_DAYS_LIMIT_PAST days
        ∧ roleOf(caller) = "admin"
  post: a.status = "no_show"
```

### 8.6 adminLogin(telegram_id, password)

```
pre:  bcrypt.verify(password, ADMIN_PASSWORD_HASH) = true
post: ∃ s ∈ AdminSession: s.telegram_id = telegram_id
      ∧ s.expires_at = now + ADMIN_SESSION_DAYS days
      ∧ roleOf(telegram_id) = "admin"
side: log access
errors: WRONG_PASSWORD, RATE_LIMITED (после 5 неудачных за 10 минут)
```

### 8.7 CRUD для Service и Master

```
createService, updateService, archiveService (set is_active=false)
createMaster, updateMaster, deactivateMaster

pre:  roleOf(caller) = "admin"
      + конкретные ограничения (I9 для имён услуг)

archiveService:
  side: НЕ удаляет существующие Appointment с этим service_id
        (price_rub_snapshot защищает от изменений)
```

---

## 9. Сценарии пользователя

Сценарии описывают **UX-обёртку** над операциями §8. Здесь — что пользователь видит и нажимает.

### UC-01 Запись на услугу

```
Актор: guest или client
Цель: создать Appointment

Шаги:
1. Открыл бота → главное меню («Записаться», «Мои записи», «О салоне»)
2. «Записаться» → список Service где is_active=true
3. Выбрал service → список Master где service ∈ service_ids ∧ isAvailable(master, today..today+30)
4. Выбрал master → календарь: для каждого дня показываем availableSlots(master, service, date)
5. Выбрал date+time (slot) → если roleOf=guest, ввод имени и телефона → createClient
6. Подтверждение: «<service> у <master>, <date> <time>. Цена: <price>. Подтвердить?»
7. «Подтвердить» → createAppointment

Edge cases:
- Slot занят пока думал: при createAppointment вернётся SLOT_TAKEN
  → бот: «упс, время только что заняли, выбери другое» → шаг 4
- Связь оборвалась после нажатия «Подтвердить»: при следующем заходе клиент видит,
  что в /мои записи новой записи нет → повторяет
- Невалидный телефон: PHONE_INVALID → «формат +7XXXXXXXXXX» → повтор ввода
```

### UC-02 Просмотр и отмена своих записей

```
Актор: client
Цель: отменить будущую запись

Шаги:
1. Главное меню → «Мои записи»
2. Список Appointment где client_id = caller ∧ status = "confirmed" ∧ starts_at > now
3. Выбрал → детали + кнопка «Отменить»
4. «Отменить»:
   Если now < starts_at − CANCEL_DEADLINE_HOURS:
     спрашивает «уверены?» → cancelByClient → «Запись отменена»
   Иначе:
     «Отмена возможна не позднее чем за 24 часа. Свяжитесь с салоном.»
     Кнопка не активна.
```

### UC-03 Напоминания

```
Реактивное правило, не интерактивный сценарий.

ON tick (раз в минуту):
  ∀ n ∈ Notification: n.status = "pending" ∧ n.scheduled_at ≤ now →
    send via Telegram Bot API to client of n.appointment_id
    n.status := "sent" если успех, иначе "failed" с retry до 3 раз
```

### UC-04 Админ смотрит расписание

```
Актор: admin (roleOf = "admin")
Цель: видеть записи

Шаги:
1. Команда /admin → если roleOf ≠ "admin", запрос пароля → adminLogin
2. Админ-меню: «Сегодня», «Завтра», «Неделя», «Услуги», «Мастера», «Отмены»
3. «Сегодня» → все Appointment где date(starts_at) = today, отсортированы по starts_at, сгруппированы по master_id
4. На каждой записи: кнопки «Отменить», «Связаться» (показывает phone), «Пришёл» (markCompleted), «Не пришёл» (markNoShow)
```

### UC-05 Админ управляет каталогом

```
Актор: admin
Цель: добавить/изменить услуги и мастеров

Услуги:
- Список активных и архивных
- Добавить: name, duration_minutes, price_rub
- Редактировать: можно менять name (проверка I9), duration, price
  ⚠️ Изменение цены не влияет на существующие записи (F3, price_rub_snapshot)
- Архивировать (is_active=false): не показывается клиентам, существующие записи остаются

Мастера:
- name, photo_url (загрузка → S3 Beget), service_ids (чекбоксы), working_hours (по дням недели)
- Отпуск: vacation_from..vacation_to
- Деактивация (is_active=false): не показывается клиентам, существующие записи остаются
```

---

## 10. Внешние интерфейсы

### 10.1 Telegram Bot API

```
Транспорт: long-polling (v1), webhook (v2 при росте)
Команды:
  /start  → главное меню (UC-01 шаг 1)
  /admin  → админ-вход (UC-04 шаг 1)
  /cancel → отмена ввода
Все остальные взаимодействия — inline keyboards.
```

### 10.2 S3 Beget (фото мастеров)

```
Endpoint: https://s3.ru1.storage.beget.cloud
Region: ru1
Bucket: <S3_BUCKET из .env>
Формат: <bucket>/masters/<master_id>.jpg
Загрузка: при createMaster/updateMaster, размер ≤ 2 MB, формат jpg/png
```

---

## 11. Уведомления

```
Notification           Trigger                                Recipient   Channel
N1 booking_created     createAppointment (§8.2)               admin       Telegram
N2 reminder_24h        n.scheduled_at = a.starts_at − 24h     client      Telegram
N3 reminder_1h         n.scheduled_at = a.starts_at − 1h      client      Telegram
N4 cancel_by_client    cancelByClient (§8.3)                  admin       Telegram
N5 cancel_by_admin     cancelByAdmin (§8.4)                   client      Telegram

Тексты — в коде, не в мат-модели. Все локализованы на ru.
```

---

## 12. Безопасность и доступ

```
S1: Пароль администратора хранится как bcrypt(cost≥12) в .env (не в БД, не в коде)
S2: AdminSession хранится in-memory или в Redis с TTL = ADMIN_SESSION_DAYS
S3: Rate-limit на adminLogin: ≤ 5 попыток за 10 минут на telegram_id
S4: Все Telegram-сообщения от пользователей проходят валидацию длины и формата
    перед записью в БД (защита от injection через имя клиента и т.п.)
S5: SQL только через ORM с параметризацией (см. TECH_STACK.md)
S6: HTTPS обязателен для webhook (когда перейдём на webhook)
S7: Данные клиентов на серверах в РФ (152-ФЗ): Beget в РФ ✓
```

---

## 13. Метрики

```
M1 (главная): count(Appointment created last 30d, status ∈ {confirmed, completed}) ≥ 30
M2 (качество): rate(no_show / completed in last 30d) ≤ 0.10
M3 (UX): median(time from /start to «Подтвердить» в UC-01) ≤ 90 sec
M4 (стабильность): count(failed Notifications / total Notifications) ≤ 0.02 weekly
```

---

## 14. Открытые вопросы

```
🔴 BLOCKER (нужно решить до v1):
  Q1: Что делать с будущими Appointment при deactivateMaster?
      Варианты: (a) автоматический cancel всех с уведомлением клиентам;
                (b) админ должен переместить руками;
                (c) Appointment остаются, но мастер виден как «уволен».

🟡 NEEDED (нужно к v2):
  Q2: Возможность переноса записи (а не cancel + create new)?
      Сейчас I3 (BOOKING_LEAD_HOURS) применяется к новой дате — это норм или
      нужны более мягкие правила для переноса?

  Q3: Несколько администраторов? Сейчас один пароль на всех — это «один администратор».
      Если их 2-3 (мастер-владелец), нужны индивидуальные пароли.

🟢 LATER (потом):
  Q4: Программа лояльности (бонусы за визиты)?
  Q5: Запись на несколько услуг одним приёмом (Маникюр + Брови подряд)?
  Q6: Онлайн-оплата?
  Q7: Веб-интерфейс параллельно с Telegram?
```

---

## 15. Антипаттерны (что НЕ делать)

```
A1: Не делать сложный конструктор расписания — рабочие часы по дням недели хватит на 95% салонов
A2: Не давать клиенту видеть чужие записи или контакты других клиентов (даже своему мастеру)
A3: Не считать «свободные слоты» через перебор всех минут — только сетка SLOT_GRID_MINUTES (F4)
A4: Не хранить пароль администратора в БД — только bcrypt в .env (S1)
A5: Не уведомлять клиента о факте создания записи (только админу) — клиент уже видел подтверждение в боте
A6: Не разрешать админу удалять Appointment физически — только status переходы (для аудита)
```
