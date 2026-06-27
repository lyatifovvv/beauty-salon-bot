import { InlineKeyboard } from 'grammy';
import { MyContext } from '../core/session';
import { PrismaClient } from '@prisma/client';
import { getAvailableSlots, getLocalNow } from '../services/appointmentService';
import { format, parse, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';

const prisma = new PrismaClient();

export async function showBookingConfirmation(ctx: MyContext, name: string, phone: string) {
  const { serviceId, masterId, date, time } = ctx.session.booking || {};
  if (!serviceId || !masterId || !date || !time) return;

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  const master = await prisma.master.findUnique({ where: { id: masterId } });

  const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
  const dateLabel = format(parsedDate, 'd MMMM (EEEE)', { locale: ru });

  const confirmationText = 
    `📝 *Проверь детали записи:*\n\n` +
    `💅 *Услуга:* ${service?.name} (${service?.durationMinutes} мин)\n` +
    `🧑‍🎨 *Мастер:* ${master?.name}\n` +
    `📅 *Дата и время:* ${dateLabel} в *${time}*\n` +
    `💰 *Стоимость:* ${service?.priceRub} ₽\n\n` +
    `👤 *Твои контакты:* ${name}, ${phone}\n\n` +
    `Все верно? Нажми кнопку подтверждения ниже:`;

  const keyboard = new InlineKeyboard()
    .text('✅ Подтвердить запись', 'confirm_booking').row()
    .text('⬅️ Назад к выбору времени', `book_date:${date}`);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(confirmationText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } else {
    await ctx.reply(confirmationText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}

export async function showClientProfile(ctx: MyContext, client: any) {
  const parts = client.name.trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';

  const text = 
    `👤 *Мой профиль:*\n\n` +
    `✏️ *Имя:* ${firstName}\n` +
    `📝 *Фамилия:* ${lastName || 'не указана'}\n` +
    `📞 *Телефон:* ${client.phone}\n\n` +
    `Выбери поле для редактирования:`;

  const keyboard = new InlineKeyboard()
    .text('✏️ Изменить имя', 'client_edit_f:firstName').row()
    .text('📝 Изменить фамилию', 'client_edit_f:lastName').row()
    .text('📞 Изменить телефон', 'client_edit_f:phone').row()
    .text('❌ Закрыть', 'client_profile_close');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

export async function renderBookingDates(ctx: MyContext, masterId: string, serviceId: string) {
  const localNow = getLocalNow();
  const keyboard = new InlineKeyboard();
  let buttonsAdded = 0;

  let serviceWithMasters: any = null;
  if (masterId === 'any') {
    serviceWithMasters = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { masters: { where: { isActive: true } } }
    });
  }

  const datesData = await Promise.all(
    Array.from({ length: 14 }).map(async (_, i) => {
      const date = addDays(localNow, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dateLabel = format(date, 'd MMM (EEE)', { locale: ru });
      let hasSlots = false;

      if (masterId !== 'any') {
        const slots = await getAvailableSlots(masterId, serviceId, dateStr);
        hasSlots = slots.length > 0;
      } else if (serviceWithMasters) {
        for (const m of serviceWithMasters.masters) {
          const slots = await getAvailableSlots(m.id, serviceId, dateStr);
          if (slots.length > 0) {
            hasSlots = true;
            break;
          }
        }
      }

      return { dateStr, dateLabel, hasSlots };
    })
  );

  for (const data of datesData) {
    if (data.hasSlots) {
      keyboard.text(data.dateLabel, `book_date:${data.dateStr}`);
      buttonsAdded++;
      if (buttonsAdded % 2 === 0) keyboard.row();
    }
  }

  if (buttonsAdded % 2 !== 0) keyboard.row();

  keyboard.text('⬅️ Назад к выбору мастера', `book_service:${serviceId}`).row();

  const text = 'Выбери удобный день для визита:';

  if (buttonsAdded === 0) {
    const noSlotsText = 'К сожалению, на ближайшие 14 дней нет свободных мест. Попробуй выбрать другого мастера.';
    const noSlotsMarkup = { reply_markup: new InlineKeyboard().text('⬅️ Назад к выбору мастера', `book_service:${serviceId}`) };
    if (ctx.callbackQuery) {
      await ctx.editMessageText(noSlotsText, noSlotsMarkup);
    } else {
      await ctx.reply(noSlotsText, noSlotsMarkup);
    }
    return;
  }

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}
