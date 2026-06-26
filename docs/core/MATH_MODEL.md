# Математическая модель Sebastian

> v1.0 · Telegram-бот для записи в бьюти-салон «Sebastian» (1 салон, 1-5 мастеров) · Валюта: ₽ · Часовой пояс: Europe/Moscow
> Уровень данных: сущности, типы. Уровень правил: инварианты I1-I10. Уровень операций: команды с pre/post. Уровень UX: сценарии UC-01..UC-05.

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
  phone: String,                  соответствует регулярному выражению /^\+7\d{10}$/
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
  ends_at: DateTime,              вычисляется при создании (starts_at + Service.duration_minutes)
  price_rub_snapshot: ℕ₀,         цена на момент создания
  status: AppointmentStatus,
  feedback_rating: ℕ[1..5] | null,
  feedback_text: String | null,
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

NotificationType = "reminder_24h" | "reminder_2h" | "feedback_request"
NotificationStatus = "pending" | "sent" | "cancelled" | "failed"
```

### 1.6 AdminSession (сессия администратора)

```
AdminSession = {
  telegram_id: ℕ₊,
  authenticated_at: DateTime,
  expires_at: DateTime            = authenticated_at + 7 days
}
```

### 1.7 Salon (салон)

```
Salon = {
  name: String[1..100],
  address: String,
  phone: String,
  how_to_get: String,
  rules: String,
  working_hours: Map<Weekday, TimeRange | null>
}
```

---

## 2. Константы

```
Символ                  Значение      Описание
── Временные окна ──
BOOKING_HORIZON_DAYS    14            максимум насколько вперёд можно записаться
BOOKING_LEAD_HOURS      2             минимум за сколько часов до начала
CANCEL_DEADLINE_HOURS   3             клиент может отменить не позже этого срока
── Слоты ──
SLOT_GRID_MINUTES       30            шаг сетки слотов (например, 30 минут)
── Напоминания ──
REMINDER_24H            24h           за сколько шлём напоминание-1
REMINDER_2H             2h            за сколько шлём напоминание-2
FEEDBACK_DELAY_HOURS    2h            через сколько после визита запрашиваем отзыв
── Админ ──
ADMIN_SESSION_DAYS      7             длительность сессии после ввода пароля
ADMIN_PASSWORD_HASH     <bcrypt>      хеш пароля в .env (cost ≥ 12)
── Производные ──
TIMEZONE                Europe/Moscow часовой пояс расчётов
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
```

---

## 4. Инварианты (Бизнес-правила)

1. **I1 (Без наложений):** Никакие две активные записи (со статусом `confirmed` или `completed`) к одному и тому же мастеру не могут пересекаться по времени.
2. **I2 (Только активные мастера и услуги):** Новые записи создаются только к активным мастерам и на активные услуги.
3. **I3 (Рабочие часы):** Время начала и окончания записи должно укладываться в рабочие часы мастера на этот день недели.
4. **I4 (Срок отмены):** Клиент может отменить запись только если до её начала осталось не менее `CANCEL_DEADLINE_HOURS` часов.
5. **I5 (Границы бронирования):** Запись может быть создана на дату в пределах от `now + BOOKING_LEAD_HOURS` до `now + BOOKING_HORIZON_DAYS`.
6. **I6 (Корректность телефона):** Телефон клиента должен быть строго в формате `+7XXXXXXXXXX`.
7. **I7 (Единый часовой пояс):** Все даты и время обрабатываются и хранятся в часовом поясе `Europe/Moscow`.
8. **I8 (Уникальность Telegram ID):** Два разных клиента не могут иметь одинаковый `telegram_id`.
9. **I9 (Ограничение на отзывы):** Отзыв (`feedback_rating`) может быть оставлен только для записей со статусом `completed` и не более одного раза.
10. **I10 (Доступ к админке):** Любое действие по управлению и изменению данных (услуги, мастера, клиенты, расписание) разрешено только при наличии активной сессии `AdminSession`.
11. **I11 (Редактирование данных):** Любое изменение данных мастера или клиента со стороны администратора должно проходить ту же валидацию, что и создание (например, уникальность `telegram_id` и формат телефона `phone` для клиентов, корректность структуры `working_hours` для мастеров).
12. **I12 (Перенос записи):** Перенос записи на новое время администратором должен проходить ту же валидацию наложений (I1), рабочих часов мастера (I3) и доступности мастера (I2), что и при создании новой записи.
13. **I13 (Чистота чата админа):** Все вспомогательные текстовые сообщения с подсказками ввода и отправленные администратором текстовые команды ввода должны удаляться из чата после завершения операции или при переходе к другому меню (клик на кнопки).
14. **I14 (Навигационная доступность):** Любое интерактивное меню или шаг ввода данных (как для клиента, так и для администратора) должен содержать кнопку возврата на предыдущий шаг или отмены операции, возвращающую пользователя в предыдущее стабильное меню или карточку сущности, предотвращая тупиковые состояния.
15. **I15 (Деактивация мастера):** При деактивации мастера его рабочие часы во всех внешних вычислениях (генерация слотов, проверка при создании записи) и при отображении в карточке мастера приравниваются к выходным (все дни = null). При повторной активации исходно настроенное расписание автоматически восстанавливается.
16. **I16 (Синхронизация с салоном):** Время работы любого мастера на любой день недели автоматически ограничивается (пересекается) рабочими часами салона на этот же день. Если салон в конкретный день закрыт (выходной), этот день является выходным для всех мастеров. Клиенты могут записываться только в рабочие часы салона.






