import { Composer, InlineKeyboard } from 'grammy';
import { randomUUID } from 'crypto';
import { MyContext } from '../../core/session';
import { listMasters } from '../../services/masterService';
import { addPortfolioItem, deletePortfolioItem, listPortfolioItems, checkPortfolioLimit } from '../../services/portfolioService';
import { isAdmin, deletePreviousPrompt, deleteAdminInputMessage } from '../../utils/adminUtils';
import { getAdminMenuKeyboard } from '../../keyboards/adminKeyboards';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ru } from 'date-fns/locale';

const TIMEZONE = 'Europe/Moscow';

export const adminPortfolioComposer = new Composer<MyContext>();

const mediaGroupCollectors = new Map<string, {
  media: { fileId: string; mediaType: 'photo' | 'video' }[];
  timer: NodeJS.Timeout;
}>();

// Обработчик текстового ввода для портфолио
adminPortfolioComposer.on('message:text', async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const authorized = await isAdmin(tgId);
  if (!authorized) {
    return next();
  }

  if (ctx.session.step === 'admin_add_portfolio_desc') {
    const desc = ctx.message.text.trim();
    await deleteAdminInputMessage(ctx);
    await deletePreviousPrompt(ctx);

    if (!ctx.session.adminState) ctx.session.adminState = {};
    if (!ctx.session.adminState.newPortfolioForm) ctx.session.adminState.newPortfolioForm = {};

    ctx.session.adminState.newPortfolioForm.description = desc === '-' ? undefined : desc;

    const masters = await listMasters(false);
    const keyboard = new InlineKeyboard();
    for (const m of masters) {
      keyboard.text(m.name, `adm_port_set_m:${m.id}`).row();
    }
    keyboard.text('🧑‍🎨 Без привязки к мастеру', 'adm_port_set_m:none').row();
    keyboard.text('❌ Отмена', 'admin_portfolio');

    const msg = await ctx.reply('🧑‍🎨 Выберите мастера, чья это работа:', {
      reply_markup: keyboard
    });
    ctx.session.adminState.promptMessageId = msg.message_id;
    return;
  }

  await next();
});

// Обработчик медиа (фото/видео)
adminPortfolioComposer.on(['message:photo', 'message:video'], async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const authorized = await isAdmin(tgId);
  if (!authorized) {
    return next();
  }

  if (ctx.session.step === 'admin_add_portfolio_media') {
    await deleteAdminInputMessage(ctx);

    let fileId = '';
    let mediaType: 'photo' | 'video' = 'photo';

    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      fileId = photo.file_id;
      mediaType = 'photo';
    } else if (ctx.message.video) {
      fileId = ctx.message.video.file_id;
      mediaType = 'video';
    }

    const mediaGroupId = ctx.message.media_group_id;

    ctx.session.adminState = ctx.session.adminState || {};
    const adminState = ctx.session.adminState;

    if (mediaGroupId) {
      let collector = mediaGroupCollectors.get(mediaGroupId);
      if (!collector) {
        collector = { media: [], timer: null as any };
        mediaGroupCollectors.set(mediaGroupId, collector);

        collector.timer = setTimeout(async () => {
          mediaGroupCollectors.delete(mediaGroupId);
          await deletePreviousPrompt(ctx);

          adminState.newPortfolioMediaBatch = collector!.media;
          ctx.session.step = 'admin_add_portfolio_desc';

          const kb = new InlineKeyboard().text('❌ Отмена', 'admin_portfolio');
          const msg = await ctx.api.sendMessage(
            tgId,
            `📸 Успешно собрано файлов для портфолио: *${collector!.media.length}*.\n\n✍️ Введите общее описание для этих работ (или отправьте \`-\` для пропуска):`,
            {
              parse_mode: 'Markdown',
              reply_markup: kb
            }
          );
          adminState.promptMessageId = msg.message_id;
        }, 800);
      }
      collector.media.push({ fileId, mediaType });
    } else {
      await deletePreviousPrompt(ctx);
      adminState.newPortfolioMediaBatch = [{ fileId, mediaType }];
      ctx.session.step = 'admin_add_portfolio_desc';

      const kb = new InlineKeyboard().text('❌ Отмена', 'admin_portfolio');
      const msg = await ctx.reply('✍️ Введите описание работы (или отправьте `-` для пропуска):', {
        reply_markup: kb
      });
      adminState.promptMessageId = msg.message_id;
    }
    return;
  }

  await next();
});

// Callbacks
adminPortfolioComposer.callbackQuery('admin_portfolio', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  ctx.session.step = 'idle';
  ctx.session.adminState = {};

  const items = await listPortfolioItems();
  const keyboard = new InlineKeyboard();

  for (const group of items) {
    const firstMedia = group.media[0];
    const typeLabel = group.media.length > 1 ? '📸🎥' : (firstMedia?.mediaType === 'photo' ? '📸' : '🎥');
    const masterName = group.master ? group.master.name : 'Без мастера';
    const descSnippet = group.description 
      ? (group.description.length > 20 ? group.description.slice(0, 20) + '...' : group.description)
      : 'Без описания';
    
    keyboard.text(`${typeLabel} ${descSnippet} (${masterName}) [${group.media.length} шт.]`, `adm_port_v:${group.id}`).row();
  }

  keyboard.text('➕ Добавить работы', 'adm_port_add').row();
  keyboard.text('⬅️ В главное меню', 'admin_menu').row();

  const textMenu = '🖼️ *Управление портфолио салона:*\nВыберите работу для просмотра/удаления или добавьте новую.';
  try {
    await ctx.editMessageText(textMenu, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (e) {
    await ctx.reply(textMenu, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    try { await ctx.deleteMessage(); } catch (err) {}
  }
});

adminPortfolioComposer.callbackQuery(/^adm_port_v:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const id = ctx.match[1];
  const items = await listPortfolioItems();
  const group = items.find(i => i.id === id);

  if (!group || group.media.length === 0) {
    await ctx.reply('Работа не найдена или уже удалена.', {
      reply_markup: new InlineKeyboard().text('⬅️ Назад', 'admin_portfolio')
    });
    return;
  }

  const masterName = group.master ? group.master.name : 'Без мастера';
  const text = 
    `🖼️ *Работа в портфолио:*\n\n` +
    `📝 *Описание:* ${group.description || 'Нет'}\n` +
    `🧑‍🎨 *Мастер:* ${masterName}\n` +
    `📅 *Добавлена:* ${format(toZonedTime(group.createdAt, TIMEZONE), 'd MMMM yyyy в HH:mm', { locale: ru })}`;

  const keyboard = new InlineKeyboard()
  .text('🗑️ Удалить эту работу/группу', `adm_port_del:${group.id}`).row()
  .text('⬅️ К списку работ', 'admin_portfolio');

  if (group.media.length === 1) {
    const item = group.media[0];
    if (item.mediaType === 'video') {
      await ctx.replyWithVideo(item.fileId, {
        caption: text,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } else {
      await ctx.replyWithPhoto(item.fileId, {
        caption: text,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
  } else {
    // Отправляем MediaGroup
    const mediaGroup = group.media.map((m, index) => ({
      type: m.mediaType as 'photo' | 'video',
      media: m.fileId,
      caption: index === 0 ? text : undefined,
      parse_mode: index === 0 ? 'Markdown' : undefined
    }));
    await ctx.replyWithMediaGroup(mediaGroup as any);
    await ctx.reply('Выберите действие для этой группы работ:', {
      reply_markup: keyboard
    });
  }
});

adminPortfolioComposer.callbackQuery(/^adm_port_del:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery('Работа удалена');
  await deletePreviousPrompt(ctx);

  const id = ctx.match[1];
  try {
    await deletePortfolioItem(id);
    await ctx.reply('✅ Работа успешно удалена из портфолио!', {
      reply_markup: new InlineKeyboard().text('⬅️ Вернуться в портфолио', 'admin_portfolio')
    });
  } catch (err: any) {
    await ctx.reply(`Ошибка при удалении: ${err.message}`, {
      reply_markup: new InlineKeyboard().text('⬅️ Вернуться в портфолио', 'admin_portfolio')
    });
  }
});

adminPortfolioComposer.callbackQuery('adm_port_add', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  ctx.session.step = 'admin_add_portfolio_media';
  ctx.session.adminState = { newPortfolioForm: {} };

  const kb = new InlineKeyboard().text('❌ Отмена', 'admin_portfolio');
  const msg = await ctx.reply('🖼️ *Отправьте одно или несколько фото/видео* для портфолио:', {
    parse_mode: 'Markdown',
    reply_markup: kb
  });
  ctx.session.adminState.promptMessageId = msg.message_id;
});

adminPortfolioComposer.callbackQuery(/^adm_port_set_m:(.+)$/, async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  const masterIdChoice = ctx.match[1];
  const mediaBatch = ctx.session.adminState?.newPortfolioMediaBatch;
  const form = ctx.session.adminState?.newPortfolioForm;

  if (!mediaBatch || mediaBatch.length === 0) {
    ctx.session.step = 'idle';
    await ctx.reply('Ошибка сессии. Начните добавление заново.', {
      reply_markup: getAdminMenuKeyboard()
    });
    return;
  }

  const masterId = masterIdChoice === 'none' ? undefined : masterIdChoice;
  const batchSize = mediaBatch.length;

  try {
    const { canAdd, count, limit } = await checkPortfolioLimit(masterId);
    if (!canAdd) {
      const nameText = masterId ? 'мастера' : 'общих работ';
      await ctx.reply(
        `❌ *Достигнут лимит портфолио!*\n\n` +
        `Максимум работ для ${nameText}: *${limit}*.\n` +
        `Уже загружено: *${count}*.\n` +
        `Вы пытаетесь добавить еще: *${batchSize}*.\n\n` +
        `Пожалуйста, сначала удалите старые работы.`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('⬅️ В портфолио', 'admin_portfolio')
        }
      );
      return;
    }

    const groupId = batchSize > 1 ? randomUUID() : undefined;

    for (const item of mediaBatch) {
      await addPortfolioItem(item.fileId, item.mediaType, form?.description, masterId, groupId);
    }

    ctx.session.step = 'idle';
    ctx.session.adminState = {};
    await ctx.reply(`✅ Успешно добавлено работ в портфолио: *${batchSize}*!`, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ В портфолио', 'admin_portfolio')
    });
  } catch (err: any) {
    ctx.session.step = 'idle';
    await ctx.reply(`Ошибка при сохранении: ${err.message}`, {
      reply_markup: new InlineKeyboard().text('⬅️ В портфолио', 'admin_portfolio')
    });
  }
});
