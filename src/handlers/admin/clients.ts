import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../../core/session';
import { isAdmin, sendNewPrompt, deletePreviousPrompt, deleteAdminInputMessage } from '../../utils/adminUtils';
import { listClients, updateClientByAdmin } from '../../services/clientService';
import { getAdminMenuKeyboard } from '../../keyboards/adminKeyboards';
import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ru } from 'date-fns/locale';

const prisma = new PrismaClient();
const TIMEZONE = 'Europe/Moscow';

export const adminClientsComposer = new Composer<MyContext>();

// Текстовые обработчики для клиентов
adminClientsComposer.on('message:text', async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const authorized = await isAdmin(tgId);
  if (!authorized) {
    return next();
  }

  if (ctx.session.step === 'admin_edit_client_field') {
    const value = ctx.message.text.trim();
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    const clientId = ctx.session.adminState?.selectedClientId;
    const field = ctx.session.adminState?.fieldToEdit;

    if (!clientId || !field) {
      ctx.session.step = 'idle';
      return;
    }

    try {
      if (field === 'name') {
        await updateClientByAdmin(clientId, { name: value });
      } else if (field === 'phone') {
        await updateClientByAdmin(clientId, { phone: value });
      }

      ctx.session.step = 'idle';
      ctx.session.adminState = {};
      await ctx.reply('✅ Карточка клиента успешно обновлена!', {
        reply_markup: getAdminMenuKeyboard()
      });
    } catch (err: any) {
      const kb = new InlineKeyboard().text('❌ Отмена', 'admin_cancel');
      const msg = await ctx.reply(`Ошибка обновления клиента: ${err.message}. Попробуйте ввести значение заново:`, { reply_markup: kb });
      ctx.session.adminState = { selectedClientId: clientId, fieldToEdit: field, promptMessageId: msg.message_id };
    }
    return;
  }

  await next();
});

// Callback обработчики для клиентов
adminClientsComposer.callbackQuery('admin_clients', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  ctx.session.step = 'idle';
  ctx.session.adminState = {};

  const clients = await listClients();
  const keyboard = new InlineKeyboard();

  for (const c of clients) {
    keyboard.text(`${c.isBlocked ? '🔴' : '🟢'} ${c.name} (${c.phone})`, `adm_v_c:${c.id}`).row();
  }
  keyboard.text('⬅️ В главное меню', 'admin_menu').row();

  await ctx.editMessageText('👥 *Управление клиентами:*\nВыбери клиента для редактирования:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminClientsComposer.callbackQuery(/^adm_v_c:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const clientId = ctx.match[1];
  ctx.session.step = 'idle';
  ctx.session.adminState = { selectedClientId: clientId };

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  const text = 
    `👥 *Карточка клиента:* ${client.name}\n\n` +
    `📞 *Телефон:* ${client.phone}\n` +
    `🆔 *Telegram ID:* \`${client.telegramId}\`\n` +
    `📅 *Зарегистрирован:* ${format(toZonedTime(client.createdAt, TIMEZONE), 'd MMMM yyyy в HH:mm', { locale: ru })}\n` +
    `🔴 *Статус блокировки:* ${client.isBlocked ? 'Заблокирован (запись недоступна)' : 'Активен (все в порядке)'}`;

  const keyboard = new InlineKeyboard()
    .text('✏️ Редактировать имя', `adm_ed_c_f:${clientId}:name`)
    .text('📞 Редактировать телефон', `adm_ed_c_f:${clientId}:phone`).row()
    .text(client.isBlocked ? '🟢 Разблокировать' : '🔴 Заблокировать', `adm_tgl_c:${clientId}`).row()
    .text('⬅️ К списку клиентов', 'admin_clients');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

adminClientsComposer.callbackQuery(/^adm_ed_c_f:(.+):(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();

  const clientId = ctx.match[1];
  const field = ctx.match[2] as 'name' | 'phone';

  ctx.session.step = 'admin_edit_client_field';
  ctx.session.adminState = { selectedClientId: clientId, fieldToEdit: field };

  const kb = new InlineKeyboard().text('❌ Отмена', `adm_can_c:${clientId}`);
  if (field === 'name') {
    await sendNewPrompt(ctx, '✍️ Введите новое ФИО клиента:', { reply_markup: kb });
  } else if (field === 'phone') {
    await sendNewPrompt(ctx, '📞 Введите новый телефон клиента в формате `+7XXXXXXXXXX`:', { reply_markup: kb });
  }
});

adminClientsComposer.callbackQuery(/^adm_can_c:(.+)$/, async (ctx) => {
  await deletePreviousPrompt(ctx);
  ctx.session.step = 'idle';
  const clientId = ctx.match[1];
  ctx.session.adminState = { selectedClientId: clientId };
  await ctx.answerCallbackQuery('Отменено');

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  const text = 
    `👥 *Карточка клиента:* ${client.name}\n\n` +
    `📞 *Телефон:* ${client.phone}\n` +
    `🆔 *Telegram ID:* \`${client.telegramId}\`\n` +
    `📅 *Зарегистрирован:* ${format(toZonedTime(client.createdAt, TIMEZONE), 'd MMMM yyyy в HH:mm', { locale: ru })}\n` +
    `🔴 *Статус блокировки:* ${client.isBlocked ? 'Заблокирован (запись недоступна)' : 'Активен (все в порядке)'}`;

  const keyboard = new InlineKeyboard()
    .text('✏️ Редактировать имя', `adm_ed_c_f:${clientId}:name`)
    .text('📞 Редактировать телефон', `adm_ed_c_f:${clientId}:phone`).row()
    .text(client.isBlocked ? '🟢 Разблокировать' : '🔴 Заблокировать', `adm_tgl_c:${clientId}`).row()
    .text('⬅️ К списку клиентов', 'admin_clients');

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch(e) {}
});

adminClientsComposer.callbackQuery(/^adm_tgl_c:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const clientId = ctx.match[1];
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  await updateClientByAdmin(clientId, { isBlocked: !client.isBlocked });

  await ctx.reply(`Статус блокировки клиента ${client.name} изменен. Вернитесь в меню клиентов:`, {
    reply_markup: new InlineKeyboard().text('⬅️ К списку клиентов', 'admin_clients')
  });
});
