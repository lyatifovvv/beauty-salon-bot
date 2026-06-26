import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../../core/session';
import { isAdmin, sendNewPrompt, deletePreviousPrompt, deleteAdminInputMessage, renderWorkingHoursDaysMenu, renderMasterServicesKeyboard } from '../../utils/adminUtils';
import { getAdminMenuKeyboard } from '../../keyboards/adminKeyboards';
import { listMasters, createMaster, updateMaster, getMasterById } from '../../services/masterService';
import { getServiceById } from '../../services/serviceService';

export const adminMastersComposer = new Composer<MyContext>();

// Текстовые обработчики
adminMastersComposer.on('message:text', async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const authorized = await isAdmin(tgId);
  if (!authorized) {
    return next();
  }

  if (ctx.session.step === 'admin_add_master_name') {
    const name = ctx.message.text.trim();
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    const defaultHours = {
      "1": { "from": "10:00", "to": "19:00" },
      "2": { "from": "10:00", "to": "19:00" },
      "3": { "from": "10:00", "to": "19:00" },
      "4": { "from": "10:00", "to": "19:00" },
      "5": { "from": "10:00", "to": "19:00" },
      "6": null,
      "7": null
    };

    try {
      const master = await createMaster(name, defaultHours);
      ctx.session.step = 'idle';
      const keyboard = new InlineKeyboard().text('👀 Открыть карточку мастера', `adm_v_m:${master.id}`);
      await ctx.reply(`✅ Мастер *${master.name}* успешно добавлен!\nПо умолчанию настроено расписание: Пн-Пт с 10:00 до 19:00.\nПерейдите в карточку мастера для настройки фото и услуг.`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (err: any) {
      const kb = new InlineKeyboard().text('❌ Отмена', 'admin_cancel');
      const msg = await ctx.reply(`Ошибка: ${err.message}. Попробуйте еще раз:`, { reply_markup: kb });
      ctx.session.adminState = { promptMessageId: msg.message_id };
    }
    return;
  }

  if (ctx.session.step === 'admin_edit_master_field') {
    const value = ctx.message.text.trim();
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    const masterId = ctx.session.adminState?.selectedMasterId;
    const field = ctx.session.adminState?.fieldToEdit;

    if (!masterId || !field) {
      ctx.session.step = 'idle';
      return;
    }

    try {
      if (field === 'name') {
        await updateMaster(masterId, { name: value });
      } else if (field === 'photoUrl') {
        await updateMaster(masterId, { photoUrl: value === '-' ? null : value });
      }

      ctx.session.step = 'idle';
      ctx.session.adminState = {};
      const kb = new InlineKeyboard().text('👀 Вернуться к мастеру', `adm_v_m:${masterId}`);
      await ctx.reply('✅ Карточка мастера успешно обновлена!', {
        reply_markup: kb
      });
    } catch (err: any) {
      const kb = new InlineKeyboard().text('❌ Отмена', 'admin_cancel');
      const msg = await ctx.reply(`Ошибка обновления мастера: ${err.message}. Попробуйте ввести значение заново:`, { reply_markup: kb });
      ctx.session.adminState = { selectedMasterId: masterId, fieldToEdit: field, promptMessageId: msg.message_id };
    }
    return;
  }

  if (ctx.session.step === 'admin_edit_master_wh_custom') {
    const value = ctx.message.text.trim().replace(/\s+/g, '');
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    const masterId = ctx.session.adminState?.selectedMasterId;
    const day = ctx.session.adminState?.editingDay;

    if (!masterId || !day) {
      ctx.session.step = 'idle';
      return;
    }

    const whRegex = /^([0-1]\d|2[0-3]):[0-5]\d-([0-1]\d|2[0-3]):[0-5]\d$/;
    if (!whRegex.test(value)) {
      const kb = new InlineKeyboard().text('❌ Отмена', `adm_wh_d:${masterId}:${day}`);
      const msg = await ctx.reply('❌ Неверный формат времени. Введите время в формате `ЧЧ:ММ-ЧЧ:ММ` (например, `12:00-19:00`):', { reply_markup: kb });
      ctx.session.adminState = { selectedMasterId: masterId, editingDay: day, promptMessageId: msg.message_id };
      return;
    }

    const [from, to] = value.split('-');
    if (from >= to) {
      const kb = new InlineKeyboard().text('❌ Отмена', `adm_wh_d:${masterId}:${day}`);
      const msg = await ctx.reply('❌ Время начала должно быть раньше времени окончания. Введите время заново (например, `12:00-19:00`):', { reply_markup: kb });
      ctx.session.adminState = { selectedMasterId: masterId, editingDay: day, promptMessageId: msg.message_id };
      return;
    }

    try {
      const master = await getMasterById(masterId);
      if (!master) throw new Error('Мастер не найден');

      const wh = JSON.parse(master.workingHours);
      wh[day] = { from: `${from}:00`, to: `${to}:00` };

      await updateMaster(masterId, { workingHours: wh });

      const whCardId = ctx.session.adminState?.whCardMessageId;
      ctx.session.step = 'idle';
      ctx.session.adminState = {};

      if (whCardId && ctx.chat) {
        try {
          const m = await getMasterById(masterId);
          if (m) {
            const wh = m.isActive
              ? JSON.parse(m.workingHours) as Record<string, { from: string; to: string } | null>
              : { "1": null, "2": null, "3": null, "4": null, "5": null, "6": null, "7": null };

            const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
            const scheduleLabel = days.map((d, idx) => {
              const schedule = wh[(idx + 1).toString()];
              return `  ${d}: ${schedule ? `${schedule.from} - ${schedule.to}` : 'Выходной'}`;
            }).join('\n');

            const text =
              `⏰ *Настройка расписания мастера:* ${m.name}\n\n` +
              `*Текущее расписание на неделю:*\n${scheduleLabel}\n\n` +
              `✅ Время успешно обновлено на *${value}*.\nВыберите день для дальнейшей настройки:`;

            const fullDaysNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
            const keyboard = new InlineKeyboard();
            fullDaysNames.forEach((d, idx) => {
              keyboard.text(d, `adm_wh_d:${masterId}:${idx + 1}`).row();
            });
            keyboard.text('✅ Готово (к карточке)', `adm_v_m:${masterId}`);

            await ctx.api.editMessageText(ctx.chat.id, whCardId, text, {
              parse_mode: 'Markdown',
              reply_markup: keyboard
            });
          }
        } catch (e) {
          await renderWorkingHoursDaysMenu(ctx, masterId, false);
        }
      } else {
        await renderWorkingHoursDaysMenu(ctx, masterId, false);
      }
    } catch (err: any) {
      const kb = new InlineKeyboard().text('❌ Отмена', `adm_wh_d:${masterId}:${day}`);
      const msg = await ctx.reply(`Ошибка при обновлении расписания: ${err.message}. Попробуйте ввести еще раз:`, { reply_markup: kb });
      ctx.session.adminState = { selectedMasterId: masterId, editingDay: day, promptMessageId: msg.message_id };
    }
    return;
  }

  await next();
});

// Обработчик фото
adminMastersComposer.on('message:photo', async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const authorized = await isAdmin(tgId);
  if (!authorized) {
    return next();
  }

  if (ctx.session.step === 'admin_edit_master_field') {
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    const masterId = ctx.session.adminState?.selectedMasterId;
    const field = ctx.session.adminState?.fieldToEdit;

    if (!masterId || field !== 'photoUrl') {
      ctx.session.step = 'idle';
      return;
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;

    try {
      await updateMaster(masterId, { photoUrl: fileId });
      ctx.session.step = 'idle';
      ctx.session.adminState = {};
      
      const kb = new InlineKeyboard().text('👀 Вернуться к мастеру', `adm_v_m:${masterId}`);
      await ctx.reply('✅ Фото мастера успешно обновлено!', {
        reply_markup: kb
      });
    } catch (err: any) {
      const kb = new InlineKeyboard().text('❌ Отмена', 'admin_cancel');
      const msg = await ctx.reply(`Ошибка обновления фото мастера: ${err.message}. Попробуйте отправить заново:`, { reply_markup: kb });
      ctx.session.adminState = { selectedMasterId: masterId, fieldToEdit: field, promptMessageId: msg.message_id };
    }
    return;
  }
  
  await next();
});

// Callbacks
adminMastersComposer.callbackQuery('admin_masters', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  ctx.session.step = 'idle';
  ctx.session.adminState = {};

  const masters = await listMasters(false);
  const keyboard = new InlineKeyboard();

  for (const m of masters) {
    keyboard.text(`${m.isActive ? '🟢' : '🔴'} ${m.name}`, `adm_v_m:${m.id}`).row();
  }
  keyboard.text('➕ Добавить мастера', 'admin_add_master').row();
  keyboard.text('⬅️ В главное меню', 'admin_menu').row();

  await ctx.editMessageText('🧑‍🎨 *Управление мастерами:*\nВыбери мастера для редактирования:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminMastersComposer.callbackQuery('admin_add_master', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  
  ctx.session.step = 'admin_add_master_name';
  const kb = new InlineKeyboard().text('❌ Отмена', 'admin_cancel');
  await sendNewPrompt(ctx, '✍️ Напиши имя нового мастера:', {
    reply_markup: kb
  });
});

adminMastersComposer.callbackQuery(/^adm_v_m:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const masterId = ctx.match[1];
  ctx.session.step = 'idle';
  ctx.session.adminState = { selectedMasterId: masterId };

  const master = await getMasterById(masterId);
  if (!master) return;

  const serviceNames = master.services.map(s => s.name).join(', ') || 'Нет привязанных услуг';

  const text = 
    `🧑‍🎨 *Мастер:* ${master.name}\n\n` +
    `💅 *Услуги:* ${serviceNames}\n` +
    `🟢 *Статус:* ${master.isActive ? 'Активен' : 'Скрыт (неактивен)'}\n\n` +
    `🖼️ *Фото:* ${master.photoUrl ? 'Загружено' : 'Нет'}`;

  const keyboard = new InlineKeyboard()
    .text('✏️ Имя', `adm_ed_m_f:${masterId}:name`)
    .text('🖼️ Фото', `adm_ed_m_f:${masterId}:photoUrl`).row()
    .text('💅 Привязать услуги', `adm_ed_m_srv:${masterId}`).row()
    .text('⏰ Настроить часы работы', `adm_wh_m:${masterId}`).row()
    .text(master.isActive ? '🔴 Скрыть мастера' : '🟢 Активировать мастера', `adm_tgl_m:${masterId}`).row()
    .text('⬅️ К списку мастеров', 'admin_masters');

  try {
    if (master.photoUrl) {
      await ctx.deleteMessage();
      await ctx.replyWithPhoto(master.photoUrl, {
        caption: text,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } else {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
  } catch(e) {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
});

// Добавим недостающие колбэки (из-за лимита места в prompt)
adminMastersComposer.callbackQuery(/^adm_ed_m_f:(.+):(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();

  const masterId = ctx.match[1];
  const field = ctx.match[2] as 'name' | 'photoUrl';

  ctx.session.step = 'admin_edit_master_field';
  ctx.session.adminState = { selectedMasterId: masterId, fieldToEdit: field };

  const kb = new InlineKeyboard().text('❌ Отмена', `adm_v_m:${masterId}`);
  if (field === 'name') {
    await sendNewPrompt(ctx, '✍️ Введите новое имя мастера:', { reply_markup: kb });
  } else if (field === 'photoUrl') {
    await sendNewPrompt(ctx, '📸 Отправьте новое фото мастера (или пришлите `-` чтобы удалить фото):', { reply_markup: kb });
  }
});

adminMastersComposer.callbackQuery(/^adm_ed_m_srv:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const masterId = ctx.match[1];
  const { master, keyboard } = await renderMasterServicesKeyboard(masterId);

  try {
    await ctx.editMessageText(`💅 Настройка услуг для мастера *${master.name}*:\n(Нажмите на услугу, чтобы привязать/отвязать)`, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (e) {
    if (ctx.chat) {
      await ctx.api.sendMessage(ctx.chat.id, `💅 Настройка услуг для мастера *${master.name}*:\n(Нажмите на услугу, чтобы привязать/отвязать)`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
  }
});

adminMastersComposer.callbackQuery(/^adm_m_s:(.+):(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;

  const serviceId = ctx.match[1];
  const action = ctx.match[2]; // 'c' = connect, 'd' = disconnect
  const masterId = ctx.session.adminState?.selectedMasterId;
  
  if (!masterId) {
    await ctx.answerCallbackQuery('Ошибка: Мастер не выбран');
    return;
  }

  const master = await getMasterById(masterId);
  if (!master) return;

  const service = await getServiceById(serviceId);
  if (!service) return;

  const currentServices = master.services.map(s => s.id);

  let newServices;
  if (action === 'c') {
    if (!currentServices.some(id => id === serviceId)) {
      newServices = [...currentServices, serviceId];
    } else {
      newServices = currentServices;
    }
  } else {
    newServices = currentServices.filter(id => id !== serviceId);
  }

  await updateMaster(masterId, { serviceIds: newServices });
  await ctx.answerCallbackQuery(action === 'c' ? 'Услуга привязана' : 'Услуга отвязана');

  const { keyboard } = await renderMasterServicesKeyboard(masterId);
  await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
});

adminMastersComposer.callbackQuery(/^adm_wh_m:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const masterId = ctx.match[1];
  ctx.session.step = 'idle';
  ctx.session.adminState = { selectedMasterId: masterId };

  await renderWorkingHoursDaysMenu(ctx, masterId, true);
});

adminMastersComposer.callbackQuery(/^adm_wh_d:(.+):(\d)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const masterId = ctx.match[1];
  const day = ctx.match[2]; 
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const dayName = days[parseInt(day) - 1];

  const keyboard = new InlineKeyboard()
    .text('🕒 Стандартно (10:00 - 19:00)', `adm_wh_s:${masterId}:${day}:10-19`).row()
    .text('✍️ Ввести вручную', `adm_wh_c:${masterId}:${day}`).row()
    .text('🏖️ Выходной', `adm_wh_s:${masterId}:${day}:off`).row()
    .text('⬅️ Назад к дням недели', `adm_wh_back_days:${masterId}`);

  await ctx.editMessageText(`⏰ *Настройка расписания* на *${dayName}*:\nВыберите действие:`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminMastersComposer.callbackQuery(/^adm_wh_back_days:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  const masterId = ctx.match[1];
  await renderWorkingHoursDaysMenu(ctx, masterId, true);
});

adminMastersComposer.callbackQuery(/^adm_wh_c:(.+):(\d)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  const masterId = ctx.match[1];
  const day = ctx.match[2];
  ctx.session.step = 'admin_edit_master_wh_custom';
  ctx.session.adminState = { 
    selectedMasterId: masterId,
    editingDay: day,
    whCardMessageId: ctx.callbackQuery.message?.message_id
  };

  const kb = new InlineKeyboard().text('❌ Отмена', `adm_wh_d:${masterId}:${day}`);
  await sendNewPrompt(ctx, '✍️ Введите время работы в формате `ЧЧ:ММ-ЧЧ:ММ` (например, `12:00-20:00`):', {
    parse_mode: 'Markdown',
    reply_markup: kb
  });
});

adminMastersComposer.callbackQuery(/^adm_wh_s:(.+):(\d):(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const masterId = ctx.match[1];
  const day = ctx.match[2];
  const pattern = ctx.match[3];

  const master = await getMasterById(masterId);
  if (!master) return;

  const wh = JSON.parse(master.workingHours);
  if (pattern === 'off') {
    wh[day] = null;
  } else {
    const [fromH, toH] = pattern.split('-');
    wh[day] = { from: `${fromH}:00`, to: `${toH}:00` };
  }

  await updateMaster(masterId, { workingHours: wh });
  await renderWorkingHoursDaysMenu(ctx, masterId, true);
});

adminMastersComposer.callbackQuery(/^adm_tgl_m:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const masterId = ctx.match[1];
  const master = await getMasterById(masterId);
  if (!master) return;

  await updateMaster(masterId, { isActive: !master.isActive });

  await ctx.reply(`Статус мастера ${master.name} изменен. Вернитесь в меню:`, {
    reply_markup: new InlineKeyboard().text('⬅️ К списку мастеров', 'admin_masters')
  });
});

adminMastersComposer.callbackQuery('admin_cancel', async (ctx) => {
  await deletePreviousPrompt(ctx);
  ctx.session.step = 'idle';
  ctx.session.adminState = {};
  await ctx.answerCallbackQuery('Действие отменено');
  try {
    await ctx.editMessageText('Действие отменено.', { reply_markup: getAdminMenuKeyboard() });
  } catch(e) {}
});
