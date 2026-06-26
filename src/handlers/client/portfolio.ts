import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../../core/session';
import { listPortfolioItems } from '../../services/portfolioService';
import { listMasters } from '../../services/masterService';
import { PrismaClient } from '@prisma/client';
import { renderBookingDates } from '../../utils/clientUtils';

const prisma = new PrismaClient();
export const clientPortfolioComposer = new Composer<MyContext>();

clientPortfolioComposer.hears('🖼️ Наше портфолио', async (ctx) => {
  ctx.session.step = 'idle';
  const keyboard = new InlineKeyboard()
    .text('✨ Смотреть все работы', 'cl_port_view_all').row()
    .text('🧑‍🎨 Выбрать мастера', 'cl_port_select_master');

  await ctx.reply('🖼️ *Портфолио нашего салона*\n\nВыберите интересующий вас вариант:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

clientPortfolioComposer.callbackQuery('cl_port_view_all', async (ctx) => {
  await ctx.answerCallbackQuery();
  const items = await listPortfolioItems();

  if (items.length === 0) {
    await ctx.reply('В портфолио пока нет работ. Мы скоро добавим новые! 🌸');
    return;
  }

  await ctx.reply('✨ *Наши работы:*');

  for (const group of items) {
    const masterName = group.master ? group.master.name : undefined;
    const caption = 
      `${group.description || 'Работа из нашего салона'}\n` +
      (masterName ? `🧑‍🎨 *Мастер:* ${masterName}` : '');

    const keyboard = group.masterId
      ? new InlineKeyboard().text(`📅 Записаться к мастеру ${masterName}`, `cl_port_book_m:${group.masterId}`)
      : undefined;

    if (group.media.length === 1) {
      const item = group.media[0];
      if (item.mediaType === 'video') {
        await ctx.replyWithVideo(item.fileId, {
          caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else {
        await ctx.replyWithPhoto(item.fileId, {
          caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }
    } else {
      const mediaGroup = group.media.map((m, index) => ({
        type: m.mediaType as 'photo' | 'video',
        media: m.fileId,
        caption: index === 0 ? caption : undefined,
        parse_mode: index === 0 ? 'Markdown' : undefined
      }));
      await ctx.replyWithMediaGroup(mediaGroup as any);
      if (keyboard) {
        await ctx.reply(`💬 Понравилась эта работа?`, { reply_markup: keyboard });
      }
    }
  }
});

clientPortfolioComposer.callbackQuery('cl_port_select_master', async (ctx) => {
  await ctx.answerCallbackQuery();
  const masters = await listMasters(false);

  if (masters.length === 0) {
    await ctx.editMessageText('В салоне пока нет мастеров.');
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const m of masters) {
    keyboard.text(m.name, `cl_port_show_m:${m.id}`).row();
  }
  keyboard.text('⬅️ Назад в портфолио', 'cl_port_back');

  await ctx.editMessageText('🧑‍🎨 *Выберите мастера для просмотра его работ:*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

clientPortfolioComposer.callbackQuery('cl_port_back', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('✨ Смотреть все работы', 'cl_port_view_all').row()
    .text('🧑‍🎨 Выбрать мастера', 'cl_port_select_master');

  await ctx.editMessageText('🖼️ *Портфолио нашего салона*\n\nВыберите интересующий вас вариант:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

clientPortfolioComposer.callbackQuery(/^cl_port_show_m:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const masterId = ctx.match[1];
  const master = await prisma.master.findUnique({ where: { id: masterId } });
  if (!master) return;

  const items = await listPortfolioItems(masterId);

  if (items.length === 0) {
    await ctx.reply(`У мастера *${master.name}* пока нет загруженных работ. 🌸`, { parse_mode: 'Markdown' });
    return;
  }

  await ctx.reply(`✨ *Работы мастера ${master.name}:*`);

  for (const group of items) {
    const caption = group.description || `Работа мастера ${master.name}`;
    const keyboard = new InlineKeyboard()
      .text(`📅 Записаться к мастеру ${master.name}`, `cl_port_book_m:${master.id}`);

    if (group.media.length === 1) {
      const item = group.media[0];
      if (item.mediaType === 'video') {
        await ctx.replyWithVideo(item.fileId, {
          caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else {
        await ctx.replyWithPhoto(item.fileId, {
          caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }
    } else {
      const mediaGroup = group.media.map((m, index) => ({
        type: m.mediaType as 'photo' | 'video',
        media: m.fileId,
        caption: index === 0 ? caption : undefined,
        parse_mode: index === 0 ? 'Markdown' : undefined
      }));
      await ctx.replyWithMediaGroup(mediaGroup as any);
      await ctx.reply(`💬 Понравилась эта работа?`, { reply_markup: keyboard });
    }
  }
});

clientPortfolioComposer.callbackQuery(/^cl_port_book_m:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const masterId = ctx.match[1];
  const master = await prisma.master.findUnique({
    where: { id: masterId },
    include: { services: { where: { isActive: true } } }
  });

  if (!master || master.services.length === 0) {
    await ctx.reply('Этот мастер пока не оказывает услуги для записи.');
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const s of master.services) {
    keyboard.text(`${s.name} (${s.priceRub} ₽)`, `cl_port_book_m_s:${masterId}:${s.id}`).row();
  }
  keyboard.text('❌ Отмена', 'client_cancel_booking').row();

  await ctx.reply(`📅 *Выберите услугу к мастеру ${master.name}:*`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

clientPortfolioComposer.callbackQuery(/^cl_port_book_m_s:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const masterId = ctx.match[1];
  const serviceId = ctx.match[2];

  ctx.session.booking = {
    masterId,
    serviceId
  };

  await renderBookingDates(ctx, masterId, serviceId);
});
