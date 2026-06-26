import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../../core/session';
import { PrismaClient } from '@prisma/client';
import { getClientByTelegramId, updateClientProfile, validatePhone } from '../../services/clientService';
import { getLocalNow, cancelAppointment } from '../../services/appointmentService';
import { getMainMenuKeyboard } from '../../keyboards/clientKeyboards';
import { showClientProfile } from '../../utils/clientUtils';
import { format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { ru } from 'date-fns/locale';

const prisma = new PrismaClient();
const TIMEZONE = 'Europe/Moscow';

export const clientProfileComposer = new Composer<MyContext>();

// Мой профиль
clientProfileComposer.hears('👤 Мой профиль', async (ctx) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const client = await getClientByTelegramId(tgId);
  if (!client) {
    await ctx.reply(
      'У тебя еще нет сохраненного профиля, так как ты еще не создавала записи. 🌸\n\n' +
      'Ты можешь заполнить профиль при первой записи на услугу.',
      { reply_markup: getMainMenuKeyboard() }
    );
    return;
  }

  await showClientProfile(ctx, client);
});

clientProfileComposer.callbackQuery('client_profile_view', async (ctx) => {
  await ctx.answerCallbackQuery();
  const tgId = ctx.from?.id;
  if (!tgId) return;
  const client = await getClientByTelegramId(tgId);
  if (!client) return;
  ctx.session.step = 'idle';
  await showClientProfile(ctx, client);
});

clientProfileComposer.callbackQuery('client_profile_close', async (ctx) => {
  await ctx.answerCallbackQuery('Профиль закрыт');
  ctx.session.step = 'idle';
  await ctx.editMessageText('👤 *Профиль закрыт.*', { parse_mode: 'Markdown' });
});

clientProfileComposer.callbackQuery(/^client_edit_f:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const field = ctx.match[1];
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const kb = new InlineKeyboard().text('❌ Отмена', 'client_profile_view');

  if (field === 'firstName') {
    ctx.session.step = 'client_edit_firstname';
    await ctx.editMessageText('✍️ *Введи свое новое имя:*', {
      parse_mode: 'Markdown',
      reply_markup: kb
    });
  } else if (field === 'lastName') {
    ctx.session.step = 'client_edit_lastname';
    await ctx.editMessageText('✍️ *Введи свою новую фамилию:*', {
      parse_mode: 'Markdown',
      reply_markup: kb
    });
  } else if (field === 'phone') {
    ctx.session.step = 'client_edit_phone';
    await ctx.editMessageText('📞 *Укажи свой новый телефон в формате `+7XXXXXXXXXX`:*', {
      parse_mode: 'Markdown',
      reply_markup: kb
    });
  }
});

clientProfileComposer.on('message:text', async (ctx, next) => {
  if (ctx.session.step === 'client_edit_firstname') {
    const firstName = ctx.message.text.trim();
    if (firstName.length < 2) {
      await ctx.reply('Имя слишком короткое. Пожалуйста, напиши имя полностью:');
      return;
    }

    const tgId = ctx.from?.id;
    if (!tgId) return;

    try {
      await updateClientProfile(tgId, { firstName });
      ctx.session.step = 'idle';
      
      try { await ctx.deleteMessage(); } catch (e) {}

      const updatedClient = await getClientByTelegramId(tgId);
      if (updatedClient) {
        await ctx.reply('✅ Имя успешно обновлено!');
        await showClientProfile(ctx, updatedClient);
      }
    } catch (err: any) {
      await ctx.reply(`Ошибка при обновлении имени: ${err.message}. Попробуй еще раз.`);
    }
    return;
  }

  if (ctx.session.step === 'client_edit_lastname') {
    const lastName = ctx.message.text.trim();
    if (lastName.length < 2) {
      await ctx.reply('Фамилия слишком короткая. Пожалуйста, напиши фамилию полностью:');
      return;
    }

    const tgId = ctx.from?.id;
    if (!tgId) return;

    try {
      await updateClientProfile(tgId, { lastName });
      ctx.session.step = 'idle';
      
      try { await ctx.deleteMessage(); } catch (e) {}

      const updatedClient = await getClientByTelegramId(tgId);
      if (updatedClient) {
        await ctx.reply('✅ Фамилия успешно обновлена!');
        await showClientProfile(ctx, updatedClient);
      }
    } catch (err: any) {
      await ctx.reply(`Ошибка при обновлении фамилии: ${err.message}. Попробуй еще раз.`);
    }
    return;
  }

  if (ctx.session.step === 'client_edit_phone') {
    const phone = ctx.message.text.trim().replace(/\s+/g, '');
    if (!validatePhone(phone)) {
      await ctx.reply('Некорректный формат телефона. Пожалуйста, напиши номер в формате `+7XXXXXXXXXX` (например, `+79991234567`):');
      return;
    }

    const tgId = ctx.from?.id;
    if (!tgId) return;

    try {
      await updateClientProfile(tgId, { phone });
      ctx.session.step = 'idle';
      
      try { await ctx.deleteMessage(); } catch (e) {}

      const updatedClient = await getClientByTelegramId(tgId);
      if (updatedClient) {
        await ctx.reply('✅ Номер телефона успешно обновлен!');
        await showClientProfile(ctx, updatedClient);
      }
    } catch (err: any) {
      await ctx.reply(`Ошибка при обновлении телефона: ${err.message}. Попробуй еще раз.`);
    }
    return;
  }

  await next();
});

// Мои визиты
clientProfileComposer.hears('📅 Мои визиты', async (ctx) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const client = await getClientByTelegramId(tgId);
  if (!client) {
    await ctx.reply('У тебя еще нет активных записей. Давай запишемся! Нажми «💅 Записаться на услугу».');
    return;
  }

  const localNow = getLocalNow();
  const utcNow = fromZonedTime(localNow, TIMEZONE);

  const appointments = await prisma.appointment.findMany({
    where: {
      clientId: client.id,
      status: 'confirmed',
      startsAt: { gte: utcNow }
    },
    include: {
      service: true,
      master: true
    },
    orderBy: { startsAt: 'asc' }
  });

  if (appointments.length === 0) {
    await ctx.reply('У тебя нет запланированных визитов.');
    return;
  }

  await ctx.reply('Твои предстоящие визиты:');

  for (const app of appointments) {
    const startLocal = toZonedTime(app.startsAt, TIMEZONE);
    const dateLabel = format(startLocal, 'd MMMM (EEEE) в HH:mm', { locale: ru });

    const keyboard = new InlineKeyboard()
      .text('❌ Отменить запись', `cancel_app:${app.id}`);

    await ctx.reply(
      `💅 *${app.service.name}*\n` +
      `🧑‍🎨 Мастер: ${app.master.name}\n` +
      `⏰ Время: ${dateLabel}\n` +
      `💰 Стоимость: ${app.priceRubSnapshot} ₽`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }
});

clientProfileComposer.callbackQuery(/^cancel_app:(.+)$/, async (ctx) => {
  const appointmentId = ctx.match[1];
  const keyboard = new InlineKeyboard()
    .text('❌ Да, отменить', `cancel_app_confirm:${appointmentId}`).row()
    .text('Оставить запись', `cancel_app_reject:${appointmentId}`);
    
  await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
});

clientProfileComposer.callbackQuery(/^cancel_app_reject:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('Отмена прервана');
  const appointmentId = ctx.match[1];
  const keyboard = new InlineKeyboard()
    .text('❌ Отменить запись', `cancel_app:${appointmentId}`);
  await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
});

clientProfileComposer.callbackQuery(/^cancel_app_confirm:(.+)$/, async (ctx) => {
  const appointmentId = ctx.match[1];
  
  try {
    await cancelAppointment(appointmentId, false);
    await ctx.answerCallbackQuery('Запись успешно отменена');
    await ctx.editMessageText('❌ *Эта запись отменена.*', { parse_mode: 'Markdown' });
    
    const app = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, service: true, master: true }
    });

    const adminSessions = await prisma.adminSession.findMany();
    for (const session of adminSessions) {
      try {
        await ctx.api.sendMessage(
          Number(session.telegramId),
          `❌ *Клиент отменил запись!*\n\n` +
          `👤 *Клиент:* ${app?.client.name} (${app?.client.phone})\n` +
          `💅 *Услуга:* ${app?.service.name}\n` +
          `🧑‍🎨 *Мастер:* ${app?.master.name}\n` +
          `⏰ *Было запланировано:* ${app ? format(toZonedTime(app.startsAt, TIMEZONE), 'd MMMM в HH:mm', { locale: ru }) : ''}`
        );
      } catch (err) {
        console.error(err);
      }
    }
  } catch (err: any) {
    await ctx.answerCallbackQuery({
      text: `Ошибка: ${err.message}`,
      show_alert: true
    });
  }
});
