import { PrismaClient, Appointment } from '@prisma/client';
import { addMinutes, isAfter, isBefore, addHours, addDays, startOfDay, getDay, format, parse } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { intersectHours } from './salonService';

const prisma = new PrismaClient();
const TIMEZONE = 'Europe/Moscow';

// Константы из MATH_MODEL.md
export const BOOKING_HORIZON_DAYS = 14;
export const BOOKING_LEAD_HOURS = 2;
export const CANCEL_DEADLINE_HOURS = 3;
export const SLOT_GRID_MINUTES = 30;

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  endsAt?: Date;
  priceRubSnapshot?: number;
}

/**
 * Получить текущее время в часовом поясе Москвы
 */
export function getLocalNow(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

/**
 * Валидация возможности создания или переноса записи
 */
export async function validateAppointmentCreation(
  clientId: string,
  masterId: string,
  serviceId: string,
  startsAtLocal: Date,
  excludeAppointmentId?: string
): Promise<ValidationResult> {
  const localNow = getLocalNow();

  // 1. Проверяем I8 (клиент заблокирован?)
  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });
  if (!client) {
    return { valid: false, reason: 'Клиент не найден' };
  }
  if (client.isBlocked) {
    return { valid: false, reason: 'Клиент заблокирован в системе' };
  }

  // 2. Получаем услугу и мастера
  const service = await prisma.service.findUnique({
    where: { id: serviceId }
  });
  if (!service || !service.isActive) {
    return { valid: false, reason: 'Услуга не найдена или неактивна (I2)' };
  }

  const master = await prisma.master.findUnique({
    where: { id: masterId },
    include: { services: true }
  });
  if (!master || !master.isActive) {
    return { valid: false, reason: 'Мастер не найден или неактивен (I2)' };
  }

  // Проверяем, делает ли мастер эту услугу
  const doesMasterDoService = master.services.some(s => s.id === service.id);
  if (!doesMasterDoService) {
    return { valid: false, reason: 'Мастер не оказывает эту услугу' };
  }

  // 3. Проверка отпуска мастера (I2)
  if (master.vacationFrom && master.vacationTo) {
    const checkDate = startOfDay(startsAtLocal);
    const vacFrom = startOfDay(toZonedTime(master.vacationFrom, TIMEZONE));
    const vacTo = startOfDay(toZonedTime(master.vacationTo, TIMEZONE));
    if (checkDate >= vacFrom && checkDate <= vacTo) {
      return { valid: false, reason: 'Мастер находится в отпуске на выбранную дату (I2)' };
    }
  }

  // 4. Проверка I5 (Границы бронирования: от now + BOOKING_LEAD_HOURS до now + BOOKING_HORIZON_DAYS)
  const minBookingTime = addHours(localNow, BOOKING_LEAD_HOURS);
  const maxBookingTime = addDays(localNow, BOOKING_HORIZON_DAYS);

  if (isBefore(startsAtLocal, minBookingTime)) {
    return { valid: false, reason: `Запись должна быть минимум за ${BOOKING_LEAD_HOURS} часа до начала (I5)` };
  }
  if (isAfter(startsAtLocal, maxBookingTime)) {
    return { valid: false, reason: `Запись возможна максимум на ${BOOKING_HORIZON_DAYS} дней вперед (I5)` };
  }

  // Вычисляем время завершения записи
  const endsAtLocal = addMinutes(startsAtLocal, service.durationMinutes);

  // 5. Проверка рабочих часов мастера с учетом расписания салона (I3, I16)
  const jsDay = getDay(startsAtLocal);
  const dbDayStr = jsDay === 0 ? '7' : jsDay.toString();

  // Десериализуем JSON-строку рабочих часов мастера
  const workingHoursJson = JSON.parse(master.workingHours) as Record<string, { from: string; to: string } | null>;
  const masterDaySchedule = workingHoursJson[dbDayStr];
  
  // Пересекаем расписание мастера с расписанием салона
  const daySchedule = intersectHours(masterDaySchedule, dbDayStr);

  if (!daySchedule) {
    return { valid: false, reason: 'Выбранный день является выходным (салон закрыт или у мастера выходной) (I3, I16)' };
  }

  // Сравниваем время
  const timeFormat = 'HH:mm';
  const startStr = format(startsAtLocal, timeFormat);
  const endStr = format(endsAtLocal, timeFormat);

  const schedFrom = daySchedule.from;
  const schedTo = daySchedule.to;

  if (startStr < schedFrom || endStr > schedTo) {
    return { valid: false, reason: `Запись выходит за рамки рабочих часов (${schedFrom} - ${schedTo}) (I3, I16)` };
  }

  // 6. Проверка I1 (Без наложений с другими confirmed записями мастера)
  const startsAtUtc = fromZonedTime(startsAtLocal, TIMEZONE);
  const endsAtUtc = fromZonedTime(endsAtLocal, TIMEZONE);

  const overlappingAppointments = await prisma.appointment.findFirst({
    where: {
      masterId: master.id,
      status: 'confirmed',
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined, // исключаем саму себя при переносе
      OR: [
        {
          startsAt: { lte: startsAtUtc },
          endsAt: { gt: startsAtUtc }
        },
        {
          startsAt: { lt: endsAtUtc },
          endsAt: { gte: endsAtUtc }
        },
        {
          startsAt: { gte: startsAtUtc },
          endsAt: { lte: endsAtUtc }
        }
      ]
    }
  });

  if (overlappingAppointments) {
    return { valid: false, reason: 'Выбранное время уже занято другой записью (I1)' };
  }

  return {
    valid: true,
    endsAt: endsAtLocal,
    priceRubSnapshot: service.priceRub
  };
}

/**
 * Создание записи
 */
export async function createAppointment(
  clientId: string,
  masterId: string,
  serviceId: string,
  startsAtLocal: Date
): Promise<Appointment> {
  const validation = await validateAppointmentCreation(clientId, masterId, serviceId, startsAtLocal);
  if (!validation.valid || !validation.endsAt || validation.priceRubSnapshot === undefined) {
    throw new Error(validation.reason || 'Ошибка валидации записи');
  }

  const startsAtUtc = fromZonedTime(startsAtLocal, TIMEZONE);
  const endsAtUtc = fromZonedTime(validation.endsAt, TIMEZONE);

  const appointment = await prisma.appointment.create({
    data: {
      clientId,
      masterId,
      serviceId,
      startsAt: startsAtUtc,
      endsAt: endsAtUtc,
      priceRubSnapshot: validation.priceRubSnapshot,
      status: 'confirmed'
    }
  });

  // Создаем отложенные напоминания
  // Напоминание 1: за 24 часа до визита
  const scheduled24h = addHours(startsAtLocal, -24);
  const localNow = getLocalNow();
  if (isAfter(scheduled24h, localNow)) {
    await prisma.notification.create({
      data: {
        appointmentId: appointment.id,
        type: 'reminder_24h',
        scheduledAt: fromZonedTime(scheduled24h, TIMEZONE),
        status: 'pending'
      }
    });
  }

  // Напоминание 2: за 2 часа до визита
  const scheduled2h = addHours(startsAtLocal, -2);
  if (isAfter(scheduled2h, localNow)) {
    await prisma.notification.create({
      data: {
        appointmentId: appointment.id,
        type: 'reminder_2h',
        scheduledAt: fromZonedTime(scheduled2h, TIMEZONE),
        status: 'pending'
      }
    });
  }

  // Запрос отзыва: через 2 часа после окончания визита
  const scheduledFeedback = addHours(validation.endsAt, 2);
  await prisma.notification.create({
    data: {
      appointmentId: appointment.id,
      type: 'feedback_request',
      scheduledAt: fromZonedTime(scheduledFeedback, TIMEZONE),
      status: 'pending'
    }
  });

  return appointment;
}

/**
 * Перенос записи (I12)
 */
export async function rescheduleAppointment(
  appointmentId: string,
  newStartsAtLocal: Date
): Promise<Appointment> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });
  if (!appointment) {
    throw new Error('Запись не найдена');
  }

  if (appointment.status !== 'confirmed') {
    throw new Error('Можно перенести только подтвержденную запись');
  }

  // Запускаем валидацию с исключением текущей записи
  const validation = await validateAppointmentCreation(
    appointment.clientId,
    appointment.masterId,
    appointment.serviceId,
    newStartsAtLocal,
    appointmentId
  );

  if (!validation.valid || !validation.endsAt) {
    throw new Error(validation.reason || 'Ошибка валидации при переносе записи');
  }

  const startsAtUtc = fromZonedTime(newStartsAtLocal, TIMEZONE);
  const endsAtUtc = fromZonedTime(validation.endsAt, TIMEZONE);

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      startsAt: startsAtUtc,
      endsAt: endsAtUtc
    }
  });

  // Пересчитываем и обновляем запланированные уведомления
  await prisma.notification.deleteMany({
    where: {
      appointmentId,
      status: 'pending'
    }
  });

  const localNow = getLocalNow();

  const scheduled24h = addHours(newStartsAtLocal, -24);
  if (isAfter(scheduled24h, localNow)) {
    await prisma.notification.create({
      data: {
        appointmentId,
        type: 'reminder_24h',
        scheduledAt: fromZonedTime(scheduled24h, TIMEZONE),
        status: 'pending'
      }
    });
  }

  const scheduled2h = addHours(newStartsAtLocal, -2);
  if (isAfter(scheduled2h, localNow)) {
    await prisma.notification.create({
      data: {
        appointmentId,
        type: 'reminder_2h',
        scheduledAt: fromZonedTime(scheduled2h, TIMEZONE),
        status: 'pending'
      }
    });
  }

  const scheduledFeedback = addHours(validation.endsAt, 2);
  await prisma.notification.create({
    data: {
      appointmentId,
      type: 'feedback_request',
      scheduledAt: fromZonedTime(scheduledFeedback, TIMEZONE),
      status: 'pending'
    }
  });

  return updatedAppointment;
}

/**
 * Отмена записи
 */
export async function cancelAppointment(
  appointmentId: string,
  isByAdmin: boolean,
  reason?: string
): Promise<Appointment> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }
  });
  if (!appointment) {
    throw new Error('Запись не найдена');
  }

  if (appointment.status !== 'confirmed') {
    throw new Error('Можно отменить только подтвержденную запись');
  }

  // Проверка I4 для клиентов (отмена не позже чем за CANCEL_DEADLINE_HOURS до начала)
  if (!isByAdmin) {
    const localNow = getLocalNow();
    const startsAtLocal = toZonedTime(appointment.startsAt, TIMEZONE);
    const limitTime = addHours(localNow, CANCEL_DEADLINE_HOURS);
    if (isBefore(startsAtLocal, limitTime)) {
      throw new Error(`Отмена невозможна: до визита осталось менее ${CANCEL_DEADLINE_HOURS} часов (I4)`);
    }
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: isByAdmin ? 'cancelled_by_admin' : 'cancelled_by_client',
      cancelledAt: new Date(),
      cancelReason: reason || null
    }
  });

  // Отменяем все запланированные уведомления для этой записи
  await prisma.notification.updateMany({
    where: {
      appointmentId,
      status: 'pending'
    },
    data: {
      status: 'cancelled'
    }
  });

  return updatedAppointment;
}

/**
 * Получить список доступных временных слотов для записи
 */
export async function getAvailableSlots(
  masterId: string,
  serviceId: string,
  dateStr: string // YYYY-MM-DD
): Promise<string[]> {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  const master = await prisma.master.findUnique({ where: { id: masterId } });
  if (!service || !master || !service.isActive || !master.isActive) {
    return [];
  }

  const parsedDate = parse(dateStr, 'yyyy-MM-dd', new Date());
  
  const jsDay = getDay(parsedDate);
  const dbDayStr = jsDay === 0 ? '7' : jsDay.toString();

  // Десериализуем JSON-строку рабочих часов мастера
  const workingHoursJson = JSON.parse(master.workingHours) as Record<string, { from: string; to: string } | null>;
  const masterDaySchedule = workingHoursJson[dbDayStr];
  
  // Пересекаем с рабочими часами салона (I16)
  const daySchedule = intersectHours(masterDaySchedule, dbDayStr);
  if (!daySchedule) {
    return [];
  }

  // Проверка отпуска
  if (master.vacationFrom && master.vacationTo) {
    const checkDate = startOfDay(parsedDate);
    const vacFrom = startOfDay(toZonedTime(master.vacationFrom, TIMEZONE));
    const vacTo = startOfDay(toZonedTime(master.vacationTo, TIMEZONE));
    if (checkDate >= vacFrom && checkDate <= vacTo) {
      return [];
    }
  }

  const slots: string[] = [];
  const [startHour, startMin] = daySchedule.from.split(':').map(Number);
  const [endHour, endMin] = daySchedule.to.split(':').map(Number);

  let currentLocal = new Date(parsedDate);
  currentLocal.setHours(startHour, startMin, 0, 0);

  const endLocal = new Date(parsedDate);
  endLocal.setHours(endHour, endMin, 0, 0);

  const localNow = getLocalNow();
  const minBookingTime = addHours(localNow, BOOKING_LEAD_HOURS);

  const dayStartUtc = fromZonedTime(currentLocal, TIMEZONE);
  const dayEndUtc = fromZonedTime(endLocal, TIMEZONE);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      masterId: master.id,
      status: 'confirmed',
      startsAt: { lt: dayEndUtc },
      endsAt: { gt: dayStartUtc }
    }
  });

  while (isBefore(currentLocal, endLocal)) {
    const slotEnds = addMinutes(currentLocal, service.durationMinutes);
    if (isAfter(slotEnds, endLocal)) {
      break;
    }

    if (isAfter(currentLocal, minBookingTime)) {
      const startsAtUtc = fromZonedTime(currentLocal, TIMEZONE);
      const endsAtUtc = fromZonedTime(slotEnds, TIMEZONE);

      const overlapping = existingAppointments.some(app => {
        return (
          (app.startsAt <= startsAtUtc && app.endsAt > startsAtUtc) ||
          (app.startsAt < endsAtUtc && app.endsAt >= endsAtUtc) ||
          (app.startsAt >= startsAtUtc && app.endsAt <= endsAtUtc)
        );
      });

      if (!overlapping) {
        slots.push(format(currentLocal, 'HH:mm'));
      }
    }

    currentLocal = addMinutes(currentLocal, SLOT_GRID_MINUTES);
  }

  return slots;
}
