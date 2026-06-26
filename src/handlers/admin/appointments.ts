import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../../core/session';
import { isAdmin, deletePreviousPrompt } from '../../utils/adminUtils';
import { PrismaClient } from '@prisma/client';
import { format, parse, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ru } from 'date-fns/locale';
import { getLocalNow, rescheduleAppointment, cancelAppointment, getAvailableSlots } from '../../services/appointmentService';

const prisma = new PrismaClient();
const TIMEZONE = 'Europe/Moscow';

export const adminAppointmentsComposer = new Composer<MyContext>();

// Callbacks
adminAppointmentsComposer.callbackQuery('admin_appointments', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const localNow = getLocalNow();
  const startOfToday = new Date(localNow);
  startOfToday.setHours(0, 0, 0, 0);

  const appointments = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: startOfToday }
    },
    include: {
      client: true,
      master: true,
      service: true
    },
    orderBy: { startsAt: 'asc' },
    take: 10
  });

  const keyboard = new InlineKeyboard();

  for (const app of appointments) {
    const startsLocal = toZonedTime(app.startsAt, TIMEZONE);
    const timeLabel = format(startsLocal, 'd MMM HH:mm', { locale: ru });
    const statusIcon = app.status === 'confirmed' ? '✅' : '❌';
    
    keyboard.text(
      `${statusIcon} [${timeLabel}] ${app.client.name} 💅 ${app.service.name}`,
      `adm_v_ap:${app.id}`
    ).row();
  }
  keyboard.text('⬅️ В главное меню', 'admin_menu').row();

  await ctx.editMessageText('📅 *Ближайшие записи салона:*\nВыберите запись для просмотра или редактирования:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminAppointmentsComposer.callbackQuery(/^adm_v_ap:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const appointmentId = ctx.match[1];
  const app = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true, master: true, service: true }
  });

  if (!app) {
    await ctx.reply('Запись не найдена.');
    return;
  }

  const startsLocal = toZonedTime(app.startsAt, TIMEZONE);
  const dateLabel = format(startsLocal, 'd MMMM yyyy (EEEE) в HH:mm', { locale: ru });
  const statusLabel = 
    app.status === 'confirmed' ? '✅ Подтверждена' :
    app.status === 'cancelled' ? '❌ Отменена' : '❓ Неизвестно';

  const text = 
    `📅 *Детали записи:*\n\n` +
    `👤 *Клиент:* ${app.client.name} (${app.client.phone})\n` +
    `💅 *Услуга:* ${app.service.name}\n` +
    `🧑‍🎨 *Мастер:* ${app.master.name}\n` +
    `⏰ *Время:* ${dateLabel}\n` +
    `💰 *Стоимость:* ${app.priceRubSnapshot} ₽\n` +
    `📌 *Статус:* ${statusLabel}`;

  const keyboard = new InlineKeyboard();
  if (app.status === 'confirmed') {
    keyboard.text('📅 Перенести визит', `adm_rs_ap:${appointmentId}`).row();
    keyboard.text('❌ Отменить визит', `adm_c_ap_c:${appointmentId}`).row();
  }
  keyboard.text('⬅️ К списку записей', 'admin_appointments');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminAppointmentsComposer.callbackQuery(/^adm_c_ap_c:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const appointmentId = ctx.match[1];
  try {
    await cancelAppointment(appointmentId, true, 'Отменено администратором');
    
    const app = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, service: true }
    });
    if (app) {
      try {
        await ctx.api.sendMessage(
          Number(app.client.telegramId),
          `❌ *Твой визит отменен администратором!*\n\n` +
          `💅 *Услуга:* ${app.service.name}\n` +
          `⏰ *Было запланировано:* ${format(toZonedTime(app.startsAt, TIMEZONE), 'd MMMM в HH:mm', { locale: ru })}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.error(e);
      }
    }

    await ctx.reply('❌ Запись успешно отменена.', {
      reply_markup: new InlineKeyboard().text('⬅️ К списку записей', 'admin_appointments')
    });
  } catch (err: any) {
    await ctx.reply(`Ошибка отмены: ${err.message}`);
  }
});

adminAppointmentsComposer.callbackQuery(/^adm_rs_ap:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const appointmentId = ctx.match[1];
  ctx.session.adminState = { selectedAppointmentId: appointmentId };

  const localNow = getLocalNow();
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < 14; i++) {
    const date = addDays(localNow, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const dateLabel = format(date, 'd MMM (EEE)', { locale: ru });
    
    keyboard.text(dateLabel, `adm_rs_d:${appointmentId}:${dateStr}`);
    if (i % 2 === 1) keyboard.row();
  }
  keyboard.text('⬅️ Назад к карточке', `adm_v_ap:${appointmentId}`).row();

  await ctx.editMessageText('Выбери новую дату для визита:', {
    reply_markup: keyboard
  });
});

adminAppointmentsComposer.callbackQuery(/^adm_rs_d:(.+):(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const appointmentId = ctx.match[1];
  const dateStr = ctx.match[2];

  if (!ctx.session.adminState) ctx.session.adminState = {};
  ctx.session.adminState.rescheduleDate = dateStr;

  const app = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, master: true }
  });

  if (!app) return;

  const slots = await getAvailableSlots(app.masterId, app.serviceId, dateStr);

  if (slots.length === 0) {
    await ctx.editMessageText('К сожалению, на этот день свободного времени у мастера нет. Выбери другую дату.', {
      reply_markup: new InlineKeyboard().text('⬅️ Вернуться к датам', `adm_rs_ap:${appointmentId}`)
    });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < slots.length; i++) {
    keyboard.text(slots[i], `adm_rs_t:${appointmentId}:${slots[i]}`);
    if ((i + 1) % 4 === 0) keyboard.row();
  }
  keyboard.text('⬅️ Вернуться к датам', `adm_rs_ap:${appointmentId}`).row();

  await ctx.editMessageText(`Выбери новое время для даты *${dateStr}*:`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminAppointmentsComposer.callbackQuery(/^adm_rs_t:(.+):(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const appointmentId = ctx.match[1];
  const timeStr = ctx.match[2];
  const dateStr = ctx.session.adminState?.rescheduleDate;

  if (!dateStr) {
    await ctx.reply('Ошибка сессии переноса. Начните перенос заново.');
    return;
  }

  const localDateTimeStr = `${dateStr}T${timeStr}:00`;
  const newStartsAtLocal = parse(localDateTimeStr, "yyyy-MM-dd'T'HH:mm:ss", new Date());

  try {
    await rescheduleAppointment(appointmentId, newStartsAtLocal);
    
    const app = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, master: true, service: true }
    });

    const dateLabel = format(newStartsAtLocal, 'd MMMM (EEEE) yyyy', { locale: ru });

    if (app) {
      try {
        await ctx.api.sendMessage(
          Number(app.client.telegramId),
          `📅 *Твой визит перенесен администратором!*\n\n` +
          `💅 *Услуга:* ${app.service.name}\n` +
          `🧑‍🎨 *Мастер:* ${app.master.name}\n` +
          `⏰ *Новое время:* ${dateLabel} в *${timeStr}*\n\n` +
          `Ждем тебя! ❤️`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.error(e);
      }
    }

    ctx.session.adminState = {};
    await ctx.reply(`🎉 Визит успешно перенесен на *${dateLabel} в ${timeStr}*! Клиенту отправлено уведомление.`, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('📅 К списку записей', 'admin_appointments')
    });

  } catch (err: any) {
    await ctx.reply(`Ошибка при переносе: ${err.message}. Попробуйте выбрать другое время.`);
  }
});
