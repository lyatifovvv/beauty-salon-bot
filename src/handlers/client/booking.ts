import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../../core/session';
import { PrismaClient } from '@prisma/client';
import { getAvailableSlots, createAppointment } from '../../services/appointmentService';
import { getClientByTelegramId, registerClient } from '../../services/clientService';
import { renderBookingDates, showBookingConfirmation } from '../../utils/clientUtils';
import { format, parse } from 'date-fns';
import { ru } from 'date-fns/locale';

const prisma = new PrismaClient();

export const clientBookingComposer = new Composer<MyContext>();

// Начало записи
clientBookingComposer.hears('💅 Записаться на услугу', async (ctx) => {
  ctx.session.booking = {};
  ctx.session.step = 'idle';

  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  });

  if (services.length === 0) {
    await ctx.reply('Извини, список услуг временно пуст. Пожалуйста, попробуй позже.');
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const service of services) {
    keyboard.text(`${service.name} (${service.priceRub} ₽)`, `book_service:${service.id}`).row();
  }
  keyboard.text('❌ Отменить запись', 'client_cancel_booking').row();

  await ctx.reply('Выбери услугу, на которую хочешь записаться:', {
    reply_markup: keyboard
  });
});

clientBookingComposer.callbackQuery('book_services_list', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.booking = {};
  ctx.session.step = 'idle';

  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  });

  if (services.length === 0) {
    await ctx.editMessageText('Извини, список услуг временно пуст. Пожалуйста, попробуй позже.');
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const service of services) {
    keyboard.text(`${service.name} (${service.priceRub} ₽)`, `book_service:${service.id}`).row();
  }
  keyboard.text('❌ Отменить запись', 'client_cancel_booking').row();

  await ctx.editMessageText('Выбери услугу, на которую хочешь записаться:', {
    reply_markup: keyboard
  });
});

// Выбор мастера
clientBookingComposer.callbackQuery(/^book_service:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const serviceId = ctx.match[1];
  ctx.session.booking = { serviceId };

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { masters: { where: { isActive: true } } }
  });

  if (!service || service.masters.length === 0) {
    await ctx.editMessageText('К сожалению, сейчас нет активных мастеров для этой услуги.', {
      reply_markup: new InlineKeyboard().text('⬅️ Назад к услугам', 'book_services_list')
    });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const master of service.masters) {
    keyboard.text(master.name, `book_master:${master.id}`).row();
  }
  keyboard.text('🧑‍🎨 Любой свободный мастер', `book_master:any`).row();
  keyboard.text('⬅️ Назад к услугам', 'book_services_list').row();

  await ctx.editMessageText('Отлично! Теперь выбери мастера:', {
    reply_markup: keyboard
  });
});

// Переход к датам
clientBookingComposer.callbackQuery(/^book_master:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const masterId = ctx.match[1];
  if (!ctx.session.booking) ctx.session.booking = {};
  
  ctx.session.booking.masterId = masterId;
  const serviceId = ctx.session.booking.serviceId;

  if (!serviceId) {
    await ctx.editMessageText('Произошла ошибка сессии. Начни запись заново.');
    return;
  }

  await renderBookingDates(ctx, masterId, serviceId);
});

// Выбор даты
clientBookingComposer.callbackQuery(/^book_date:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const dateStr = ctx.match[1];
  if (!ctx.session.booking) return;
  ctx.session.booking.date = dateStr;

  const { serviceId, masterId } = ctx.session.booking;
  if (!serviceId || !masterId) {
    await ctx.editMessageText('Произошла ошибка сессии. Начни запись заново.');
    return;
  }

  let targetMasterId = masterId;
  if (masterId === 'any') {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { masters: { where: { isActive: true } } }
    });
    if (!service) return;

    let foundMasterId = null;

    for (const m of service.masters) {
      const s = await getAvailableSlots(m.id, serviceId, dateStr);
      if (s.length > 0) {
        foundMasterId = m.id;
        break;
      }
    }

    if (!foundMasterId) {
      await ctx.editMessageText('К сожалению, на этот день свободного времени у мастеров нет. Выбери другую дату.', {
        reply_markup: new InlineKeyboard().text('⬅️ Вернуться к датам', `book_master:${masterId}`)
      });
      return;
    }
    targetMasterId = foundMasterId;
    ctx.session.booking.masterId = targetMasterId;
  }

  const slots = await getAvailableSlots(targetMasterId, serviceId, dateStr);

  if (slots.length === 0) {
    await ctx.editMessageText('К сожалению, на этот день свободного времени нет. Выбери другую дату.', {
      reply_markup: new InlineKeyboard().text('⬅️ Вернуться к датам', `book_master:${masterId}`)
    });
    return;
  }
  
  const targetMasterObj = await prisma.master.findUnique({ where: { id: targetMasterId } });
  const masterNameStr = targetMasterObj ? targetMasterObj.name : 'Мастер';

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < slots.length; i++) {
    keyboard.text(slots[i], `book_time:${slots[i]}`);
    if ((i + 1) % 4 === 0) keyboard.row();
  }

  if (slots.length % 4 !== 0) keyboard.row();
  keyboard.text('⬅️ Назад к датам', `book_master:${masterId}`).row();

  const msgText = masterId === 'any' 
    ? `Отлично! Свободные слоты мастера *${masterNameStr}* на ${dateStr}:`
    : `Выбери удобное время:`;

  await ctx.editMessageText(msgText, {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  });
});

// Выбор времени
clientBookingComposer.callbackQuery(/^book_time:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const timeStr = ctx.match[1];
  if (!ctx.session.booking) return;
  ctx.session.booking.time = timeStr;

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const client = await getClientByTelegramId(tgId);
  if (!client) {
    ctx.session.step = 'input_name';
    ctx.session.clientForm = {};
    const kb = new InlineKeyboard().text('❌ Отмена', 'client_cancel_booking');
    await ctx.editMessageText('Для завершения записи, пожалуйста, укажи свои данные.\n\n✍️ *Напиши свое имя и фамилию:*', {
      parse_mode: 'Markdown',
      reply_markup: kb
    });
    return;
  }

  await showBookingConfirmation(ctx, client.name, client.phone);
});

// Подтверждение бронирования
clientBookingComposer.callbackQuery('confirm_booking', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.booking) return;

  const { serviceId, masterId, date, time } = ctx.session.booking;
  if (!serviceId || !masterId || !date || !time) {
    await ctx.reply('Ошибка сессии. Начни запись заново.');
    return;
  }

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const client = await getClientByTelegramId(tgId);
  if (!client) return;

  const localDateTimeStr = `${date}T${time}:00`;
  const startsAtLocal = parse(localDateTimeStr, "yyyy-MM-dd'T'HH:mm:ss", new Date());

  try {
    const appointment = await createAppointment(client.id, masterId, serviceId, startsAtLocal);
    
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    const master = await prisma.master.findUnique({ where: { id: masterId } });
    
    const dateLabel = format(startsAtLocal, 'd MMMM (EEEE) yyyy', { locale: ru });

    const successText = 
      `🎉 *Запись успешно подтверждена!*\n\n` +
      `💅 *Услуга:* ${service?.name}\n` +
      `🧑‍🎨 *Мастер:* ${master?.name}\n` +
      `📅 *Дата и время:* ${dateLabel} в *${time}*\n` +
      `💰 *Стоимость:* ${appointment.priceRubSnapshot} ₽\n\n` +
      `Ждем вас! Мы напомним о визите за 24 часа и за 2 часа до процедуры. ❤️`;

    await ctx.editMessageText(successText, { parse_mode: 'Markdown' });

    ctx.session.booking = {};

    const adminSessions = await prisma.adminSession.findMany();
    for (const session of adminSessions) {
      try {
        await ctx.api.sendMessage(
          Number(session.telegramId),
          `📅 *Новая запись в салоне!*\n\n` +
          `👤 *Клиент:* ${client.name} (${client.phone})\n` +
          `💅 *Услуга:* ${service?.name}\n` +
          `🧑‍🎨 *Мастер:* ${master?.name}\n` +
          `⏰ *Время:* ${dateLabel} в ${time}`
        );
      } catch (err) {
        console.error(err);
      }
    }

  } catch (err: any) {
    await ctx.reply(`Ошибка при создании записи: ${err.message}. Попробуй другое время.`);
  }
});

// Отмена процесса записи клиентом
clientBookingComposer.callbackQuery('client_cancel_booking', async (ctx) => {
  ctx.session.step = 'idle';
  ctx.session.booking = {};
  ctx.session.clientForm = {};
  await ctx.answerCallbackQuery('Запись отменена');
  await ctx.editMessageText('❌ Процесс записи отменен.');
});

// Регистрация: Ввод имени и телефона
clientBookingComposer.on('message:text', async (ctx, next) => {
  if (ctx.session.step === 'input_name') {
    const name = ctx.message.text.trim();
    if (name.length < 2) {
      await ctx.reply('Имя слишком короткое. Напиши, пожалуйста, имя и фамилию полностью:');
      return;
    }
    ctx.session.clientForm = { name };
    ctx.session.step = 'input_phone';
    const kb = new InlineKeyboard().text('❌ Отмена', 'client_cancel_booking');
    
    await ctx.reply('📞 Теперь укажи свой номер телефона в формате `+7XXXXXXXXXX`:', {
      parse_mode: 'Markdown',
      reply_markup: kb
    });
    
    try {
      await ctx.deleteMessage();
    } catch (e) {}
    
    return;
  }

  if (ctx.session.step === 'input_phone') {
    const phone = ctx.message.text.trim().replace(/\s+/g, '');
    const phoneRegex = /^\+7\d{10}$/;
    if (!phoneRegex.test(phone)) {
      await ctx.reply('Некорректный формат телефона. Пожалуйста, напиши номер в формате `+7XXXXXXXXXX` (например, `+79991234567`):');
      return;
    }

    const tgId = ctx.from?.id;
    if (!tgId) return;

    const name = ctx.session.clientForm?.name || ctx.from.first_name || 'Клиент';
    
    try {
      await registerClient(tgId, name, phone);
      ctx.session.step = 'idle';
      
      try { await ctx.deleteMessage(); } catch (e) {}
      
      await showBookingConfirmation(ctx, name, phone);
    } catch (err: any) {
      await ctx.reply(`Ошибка при регистрации: ${err.message}. Попробуй еще раз.`);
    }
    return;
  }

  await next();
});
