import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../../core/session';
import { isAdmin, sendNewPrompt, deletePreviousPrompt, deleteAdminInputMessage } from '../../utils/adminUtils';
import { getAdminMenuKeyboard } from '../../keyboards/adminKeyboards';
import { createService, updateService, listServices, getServiceById } from '../../services/serviceService';

export const adminServicesComposer = new Composer<MyContext>();

// Обработчики текстового ввода для услуг
adminServicesComposer.on('message:text', async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const authorized = await isAdmin(tgId);
  if (!authorized) {
    return next();
  }

  if (ctx.session.step === 'admin_add_service_name') {
    const name = ctx.message.text.trim();
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    ctx.session.adminState = {
      newServiceForm: { name }
    };
    ctx.session.step = 'admin_add_service_duration';
    const msg = await ctx.reply('⏳ Теперь напиши длительность услуги в минутах (например, `60` или `90`, должна быть кратна 15):', { parse_mode: 'Markdown' });
    ctx.session.adminState.promptMessageId = msg.message_id;
    return;
  }

  if (ctx.session.step === 'admin_add_service_duration') {
    const duration = parseInt(ctx.message.text.trim(), 10);
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    if (isNaN(duration) || duration <= 0 || duration % 15 !== 0) {
      const msg = await ctx.reply('Некорректная длительность. Введите число минут, кратное 15 (например, 30, 45, 60):');
      if (!ctx.session.adminState) ctx.session.adminState = {};
      ctx.session.adminState.promptMessageId = msg.message_id;
      return;
    }
    if (ctx.session.adminState?.newServiceForm) {
      ctx.session.adminState.newServiceForm.durationMinutes = duration;
    }
    ctx.session.step = 'admin_add_service_price';
    const msg = await ctx.reply('💰 Теперь укажи стоимость услуги в рублях (например, `1500`):', { parse_mode: 'Markdown' });
    if (ctx.session.adminState) {
      ctx.session.adminState.promptMessageId = msg.message_id;
    }
    return;
  }

  if (ctx.session.step === 'admin_add_service_price') {
    const price = parseInt(ctx.message.text.trim(), 10);
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    if (isNaN(price) || price < 0) {
      const msg = await ctx.reply('Некорректная цена. Введите цену в рублях (например, 1500):');
      if (!ctx.session.adminState) ctx.session.adminState = {};
      ctx.session.adminState.promptMessageId = msg.message_id;
      return;
    }
    const form = ctx.session.adminState?.newServiceForm;
    if (form && form.name && form.durationMinutes !== undefined) {
      try {
        const service = await createService(form.name, form.durationMinutes, price);
        ctx.session.step = 'idle';
        ctx.session.adminState = {};
        await ctx.reply(`✅ Услуга *${service.name}* (${service.priceRub} ₽, ${service.durationMinutes} мин) успешно добавлена!`, {
          parse_mode: 'Markdown',
          reply_markup: getAdminMenuKeyboard()
        });
      } catch (err: any) {
        await ctx.reply(`Ошибка при создании услуги: ${err.message}. Попробуйте начать сначала через панель.`);
      }
    }
    return;
  }

  if (ctx.session.step === 'admin_edit_service_field') {
    const value = ctx.message.text.trim();
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    const serviceId = ctx.session.adminState?.selectedServiceId;
    const field = ctx.session.adminState?.fieldToEdit;

    if (!serviceId || !field) {
      ctx.session.step = 'idle';
      return;
    }

    try {
      if (field === 'name') {
        await updateService(serviceId, { name: value });
      } else if (field === 'priceRub') {
        const price = parseInt(value, 10);
        if (isNaN(price) || price < 0) throw new Error('Некорректная цена');
        await updateService(serviceId, { priceRub: price });
      } else if (field === 'durationMinutes') {
        const duration = parseInt(value, 10);
        if (isNaN(duration) || duration <= 0 || duration % 15 !== 0) throw new Error('Длительность должна быть кратна 15 минутам');
        await updateService(serviceId, { durationMinutes: duration });
      }

      ctx.session.step = 'idle';
      ctx.session.adminState = {};
      await ctx.reply('✅ Каталог услуг успешно обновлен!', {
        reply_markup: getAdminMenuKeyboard()
      });
    } catch (err: any) {
      const msg = await ctx.reply(`Ошибка обновления услуги: ${err.message}. Попробуйте ввести значение заново:`);
      ctx.session.adminState = { selectedServiceId: serviceId, fieldToEdit: field, promptMessageId: msg.message_id };
    }
    return;
  }

  await next();
});

// Callback обработчики для услуг
adminServicesComposer.callbackQuery('admin_services', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  ctx.session.step = 'idle';
  ctx.session.adminState = {};

  const services = await listServices(false);
  const keyboard = new InlineKeyboard();

  for (const s of services) {
    keyboard.text(`${s.isActive ? '✅' : '❌'} ${s.name} (${s.priceRub} ₽)`, `adm_v_s:${s.id}`).row();
  }
  keyboard.text('➕ Добавить услугу', 'admin_add_service').row();
  keyboard.text('⬅️ В главное меню', 'admin_menu').row();

  await ctx.editMessageText('💅 *Управление услугами:*\nВыберите услугу для редактирования или добавьте новую:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminServicesComposer.callbackQuery('admin_add_service', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  
  ctx.session.step = 'admin_add_service_name';
  const kb = new InlineKeyboard().text('❌ Отмена', 'adm_can_svs');
  await sendNewPrompt(ctx, '✍️ Напиши *название* новой услуги (например, `Маникюр с покрытием гель-лак`):', {
    parse_mode: 'Markdown',
    reply_markup: kb
  });
});

adminServicesComposer.callbackQuery(/^adm_v_s:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const serviceId = ctx.match[1];
  ctx.session.step = 'idle';
  ctx.session.adminState = { selectedServiceId: serviceId };

  const service = await getServiceById(serviceId);
  if (!service) return;

  const text = 
    `💅 *Услуга:* ${service.name}\n\n` +
    `💰 *Стоимость:* ${service.priceRub} ₽\n` +
    `⏳ *Длительность:* ${service.durationMinutes} минут\n` +
    `📌 *Статус:* ${service.isActive ? 'Активна (доступна для записи)' : 'Скрыта'}`;

  const keyboard = new InlineKeyboard()
    .text('✏️ Имя', `adm_ed_s_f:${serviceId}:name`)
    .text('✏️ Стоимость', `adm_ed_s_f:${serviceId}:priceRub`).row()
    .text('✏️ Длительность', `adm_ed_s_f:${serviceId}:durationMinutes`).row()
    .text(service.isActive ? '❌ Скрыть' : '✅ Активировать', `adm_tgl_s:${serviceId}`).row()
    .text('⬅️ К списку услуг', 'admin_services');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminServicesComposer.callbackQuery(/^adm_ed_s_f:(.+):(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();

  const serviceId = ctx.match[1];
  const field = ctx.match[2] as 'name' | 'priceRub' | 'durationMinutes';

  ctx.session.step = 'admin_edit_service_field';
  ctx.session.adminState = { selectedServiceId: serviceId, fieldToEdit: field };

  const kb = new InlineKeyboard().text('❌ Отмена', `adm_can_s:${serviceId}`);
  if (field === 'name') {
    await sendNewPrompt(ctx, '✍️ Введите новое имя услуги:', { reply_markup: kb });
  } else if (field === 'priceRub') {
    await sendNewPrompt(ctx, '💰 Введите новую стоимость услуги в рублях (например, 1500):', { reply_markup: kb });
  } else if (field === 'durationMinutes') {
    await sendNewPrompt(ctx, '⏳ Введите новую длительность в минутах (кратно 15):', { reply_markup: kb });
  }
});

adminServicesComposer.callbackQuery(/^adm_tgl_s:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  
  const serviceId = ctx.match[1];
  const service = await getServiceById(serviceId);
  if (!service) return;

  await updateService(serviceId, { isActive: !service.isActive });
  await ctx.answerCallbackQuery(service.isActive ? 'Услуга скрыта' : 'Услуга активирована');

  const updatedService = await getServiceById(serviceId);
  if (!updatedService) return;

  const text = 
    `💅 *Услуга:* ${updatedService.name}\n\n` +
    `💰 *Стоимость:* ${updatedService.priceRub} ₽\n` +
    `⏳ *Длительность:* ${updatedService.durationMinutes} минут\n` +
    `📌 *Статус:* ${updatedService.isActive ? 'Активна (доступна для записи)' : 'Скрыта'}`;

  const keyboard = new InlineKeyboard()
    .text('✏️ Имя', `adm_ed_s_f:${serviceId}:name`)
    .text('✏️ Стоимость', `adm_ed_s_f:${serviceId}:priceRub`).row()
    .text('✏️ Длительность', `adm_ed_s_f:${serviceId}:durationMinutes`).row()
    .text(updatedService.isActive ? '❌ Скрыть' : '✅ Активировать', `adm_tgl_s:${serviceId}`).row()
    .text('⬅️ К списку услуг', 'admin_services');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminServicesComposer.callbackQuery('adm_can_svs', async (ctx) => {
  await deletePreviousPrompt(ctx);
  ctx.session.step = 'idle';
  ctx.session.adminState = {};
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('Действие отменено.', { reply_markup: getAdminMenuKeyboard() });
});

adminServicesComposer.callbackQuery(/^adm_can_s:(.+)$/, async (ctx) => {
  await deletePreviousPrompt(ctx);
  ctx.session.step = 'idle';
  const serviceId = ctx.match[1];
  ctx.session.adminState = { selectedServiceId: serviceId };
  await ctx.answerCallbackQuery('Отменено');
  
  const service = await getServiceById(serviceId);
  if (!service) return;

  const text = 
    `💅 *Услуга:* ${service.name}\n\n` +
    `💰 *Стоимость:* ${service.priceRub} ₽\n` +
    `⏳ *Длительность:* ${service.durationMinutes} минут\n` +
    `📌 *Статус:* ${service.isActive ? 'Активна (доступна для записи)' : 'Скрыта'}`;

  const keyboard = new InlineKeyboard()
    .text('✏️ Имя', `adm_ed_s_f:${serviceId}:name`)
    .text('✏️ Стоимость', `adm_ed_s_f:${serviceId}:priceRub`).row()
    .text('✏️ Длительность', `adm_ed_s_f:${serviceId}:durationMinutes`).row()
    .text(service.isActive ? '❌ Скрыть' : '✅ Активировать', `adm_tgl_s:${serviceId}`).row()
    .text('⬅️ К списку услуг', 'admin_services');

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch(e) {}
});
