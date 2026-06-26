import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../../core/session';
import { isAdmin, sendNewPrompt, deletePreviousPrompt, deleteAdminInputMessage, getSalonCardDetails, renderSalonWorkingHoursDaysMenu } from '../../utils/adminUtils';
import { getSalonConfig, updateSalonConfig } from '../../services/salonService';

export const adminSalonComposer = new Composer<MyContext>();

// Текстовые обработчики для салона
adminSalonComposer.on('message:text', async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const authorized = await isAdmin(tgId);
  if (!authorized) {
    return next();
  }

  if (ctx.session.step === 'admin_edit_salon_field') {
    const value = ctx.message.text.trim();
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    const field = ctx.session.adminState?.fieldToEdit;

    if (!field) {
      ctx.session.step = 'idle';
      return;
    }

    try {
      if (field === 'name') {
        updateSalonConfig({ name: value });
      } else if (field === 'address') {
        updateSalonConfig({ address: value });
      } else if (field === 'phone') {
        updateSalonConfig({ phone: value });
      } else if (field === 'howToGet') {
        updateSalonConfig({ howToGet: value });
      } else if (field === 'rules') {
        updateSalonConfig({ rules: value });
      }

      ctx.session.step = 'idle';
      ctx.session.adminState = {};
      const { text, keyboard } = getSalonCardDetails();
      await ctx.reply(`✅ Карточка салона успешно обновлена!\n\n${text}`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (err: any) {
      const kb = new InlineKeyboard().text('❌ Отмена', 'adm_can_sal');
      const msg = await ctx.reply(`Ошибка обновления салона: ${err.message}. Попробуйте ввести значение заново:`, { reply_markup: kb });
      ctx.session.adminState = { fieldToEdit: field, promptMessageId: msg.message_id };
    }
    return;
  }

  if (ctx.session.step === 'admin_edit_salon_wh_custom') {
    const value = ctx.message.text.trim().replace(/\s+/g, '');
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    const day = ctx.session.adminState?.editingDay;

    if (!day) {
      ctx.session.step = 'idle';
      return;
    }

    const whRegex = /^([0-1]\d|2[0-3]):[0-5]\d-([0-1]\d|2[0-3]):[0-5]\d$/;
    if (!whRegex.test(value)) {
      const kb = new InlineKeyboard().text('❌ Отмена', `adm_sal_wh_d:${day}`);
      const msg = await ctx.reply('❌ Неверный формат времени. Введите время в формате `ЧЧ:ММ-ЧЧ:ММ` (например, `10:00-21:00`):', { reply_markup: kb });
      ctx.session.adminState = { editingDay: day, promptMessageId: msg.message_id };
      return;
    }

    const [from, to] = value.split('-');
    if (from >= to) {
      const kb = new InlineKeyboard().text('❌ Отмена', `adm_sal_wh_d:${day}`);
      const msg = await ctx.reply('❌ Время начала должно быть раньше времени окончания. Введите время заново (например, `10:00-21:00`):', { reply_markup: kb });
      ctx.session.adminState = { editingDay: day, promptMessageId: msg.message_id };
      return;
    }

    try {
      const config = getSalonConfig();
      const wh = { ...config.workingHours };
      wh[day] = { from: `${from}:00`, to: `${to}:00` };

      updateSalonConfig({ workingHours: wh });

      const whCardId = ctx.session.adminState?.whCardMessageId;
      ctx.session.step = 'idle';
      ctx.session.adminState = {};

      if (whCardId && ctx.chat) {
        try {
          const updatedConfig = getSalonConfig();
          const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
          const updatedWh = updatedConfig.workingHours;
          const scheduleLabel = days.map((d, idx) => {
            const schedule = updatedWh[(idx + 1).toString()];
            return `  ${d}: ${schedule ? `${schedule.from} - ${schedule.to}` : 'Выходной'}`;
          }).join('\n');

          const text =
            `⏰ *Настройка расписания салона:* ${updatedConfig.name}\n\n` +
            `*Текущее расписание салона:*\n${scheduleLabel}\n\n` +
            `✅ Время успешно обновлено на *${value}*.\nВыберите день для настройки:`;

          const fullDaysNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
          const keyboard = new InlineKeyboard();
          fullDaysNames.forEach((d, idx) => {
            keyboard.text(d, `adm_sal_wh_d:${idx + 1}`).row();
          });
          keyboard.text('✅ Готово (к карточке салона)', 'admin_salon');

          await ctx.api.editMessageText(ctx.chat.id, whCardId, text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        } catch (e) {
          await renderSalonWorkingHoursDaysMenu(ctx, false);
        }
      } else {
        await renderSalonWorkingHoursDaysMenu(ctx, false);
      }
    } catch (err: any) {
      const kb = new InlineKeyboard().text('❌ Отмена', `adm_sal_wh_d:${day}`);
      const msg = await ctx.reply(`Ошибка при обновлении расписания: ${err.message}. Попробуйте ввести еще раз:`, { reply_markup: kb });
      ctx.session.adminState = { editingDay: day, promptMessageId: msg.message_id };
    }
    return;
  }

  await next();
});

// Callbacks для салона
adminSalonComposer.callbackQuery('admin_salon', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  ctx.session.step = 'idle';
  ctx.session.adminState = {};

  const { text, keyboard } = getSalonCardDetails();
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminSalonComposer.callbackQuery(/^adm_ed_sal:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();

  const field = ctx.match[1];
  
  if (field === 'workingHours') {
    ctx.session.step = 'idle';
    await renderSalonWorkingHoursDaysMenu(ctx, true);
    return;
  }

  ctx.session.step = 'admin_edit_salon_field';
  ctx.session.adminState = { fieldToEdit: field as any };

  const kb = new InlineKeyboard().text('❌ Отмена', 'adm_can_sal');

  if (field === 'name') {
    await sendNewPrompt(ctx, '✍️ Введите новое имя салона:', { reply_markup: kb });
  } else if (field === 'address') {
    await sendNewPrompt(ctx, '✍️ Введите новый адрес:', { reply_markup: kb });
  } else if (field === 'phone') {
    await sendNewPrompt(ctx, '✍️ Введите новый контактный телефон:', { reply_markup: kb });
  } else if (field === 'howToGet') {
    await sendNewPrompt(ctx, '✍️ Введите новое описание "Как добраться":', { reply_markup: kb });
  } else if (field === 'rules') {
    await sendNewPrompt(ctx, '✍️ Введите новые правила:', { reply_markup: kb });
  }
});

adminSalonComposer.callbackQuery('adm_can_sal', async (ctx) => {
  await deletePreviousPrompt(ctx);
  ctx.session.step = 'idle';
  ctx.session.adminState = {};
  await ctx.answerCallbackQuery('Отменено');
  const { text, keyboard } = getSalonCardDetails();
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  } catch(e) {}
});

adminSalonComposer.callbackQuery(/^adm_sal_wh_d:(\d)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const day = ctx.match[1];
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const dayName = days[parseInt(day) - 1];

  const keyboard = new InlineKeyboard()
    .text('🕒 Стандартно (10:00 - 19:00)', `adm_sal_wh_s:${day}:10-19`).row()
    .text('✍️ Ввести вручную', `adm_sal_wh_c:${day}`).row()
    .text('🏖️ Выходной', `adm_sal_wh_s:${day}:off`).row()
    .text('⬅️ Назад к дням недели', `adm_sal_wh_back_days`);

  await ctx.editMessageText(`⏰ *Настройка часов салона* на *${dayName}*:\nВыберите действие:`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminSalonComposer.callbackQuery('adm_sal_wh_back_days', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await renderSalonWorkingHoursDaysMenu(ctx, true);
});

adminSalonComposer.callbackQuery(/^adm_sal_wh_c:(\d)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  const day = ctx.match[1];
  ctx.session.step = 'admin_edit_salon_wh_custom';
  ctx.session.adminState = { 
    editingDay: day,
    whCardMessageId: ctx.callbackQuery.message?.message_id
  };

  const kb = new InlineKeyboard().text('❌ Отмена', `adm_sal_wh_d:${day}`);
  await sendNewPrompt(ctx, '✍️ Введите расписание салона в формате `ЧЧ:ММ-ЧЧ:ММ` (например, `10:00-21:00`):', {
    parse_mode: 'Markdown',
    reply_markup: kb
  });
});

adminSalonComposer.callbackQuery(/^adm_sal_wh_s:(\d):(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const day = ctx.match[1];
  const pattern = ctx.match[2];

  const config = getSalonConfig();
  const wh = { ...config.workingHours };
  if (pattern === 'off') {
    wh[day] = null;
  } else {
    const [fromH, toH] = pattern.split('-');
    wh[day] = { from: `${fromH}:00`, to: `${toH}:00` };
  }

  updateSalonConfig({ workingHours: wh });
  await renderSalonWorkingHoursDaysMenu(ctx, true);
});
