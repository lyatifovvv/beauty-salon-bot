import { Composer } from 'grammy';
import { MyContext } from '../../core/session';
import { isAdmin, deletePreviousPrompt, deleteAdminInputMessage } from '../../utils/adminUtils';
import { getAdminMenuKeyboard } from '../../keyboards/adminKeyboards';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { config } from '../../core/config';

const prisma = new PrismaClient();
export const adminAuthComposer = new Composer<MyContext>();

// Команда /admin
adminAuthComposer.command('admin', async (ctx) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  await deletePreviousPrompt(ctx);
  const authorized = await isAdmin(tgId);
  if (authorized) {
    await ctx.reply('🔑 *Панель администратора Sebastian* приветствует вас!', {
      parse_mode: 'Markdown',
      reply_markup: getAdminMenuKeyboard()
    });
  } else {
    ctx.session.step = 'admin_password';
    const msg = await ctx.reply('🔒 Для доступа в админку введите пароль:');
    ctx.session.adminState = { promptMessageId: msg.message_id };
  }
});

adminAuthComposer.on('message:text', async (ctx, next) => {
  if (ctx.session.step === 'admin_password') {
    const password = ctx.message.text.trim();
    const hash = config.ADMIN_PASSWORD_HASH;
    const tgId = ctx.from?.id;
    if (!tgId) return;

    await deleteAdminInputMessage(ctx);

    if (!hash) {
      await deletePreviousPrompt(ctx);
      await ctx.reply('Ошибка: в конфигурационном файле (.env) не настроен хэш пароля администратора.');
      ctx.session.step = 'idle';
      return;
    }

    const match = bcrypt.compareSync(password, hash);
    if (match) {
      const authenticatedAt = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.adminSession.upsert({
        where: { telegramId: BigInt(tgId) },
        create: { telegramId: BigInt(tgId), authenticatedAt, expiresAt },
        update: { authenticatedAt, expiresAt }
      });

      await deletePreviousPrompt(ctx);
      ctx.session.step = 'idle';
      await ctx.reply('✅ Успешная авторизация! Доступ открыт на 7 дней.', {
        reply_markup: getAdminMenuKeyboard()
      });
    } else {
      await deletePreviousPrompt(ctx);
      const msg = await ctx.reply('❌ Неверный пароль. Попробуйте еще раз или напишите /start для возврата к обычному меню:');
      ctx.session.adminState = { promptMessageId: msg.message_id };
    }
    return;
  }
  await next();
});

adminAuthComposer.callbackQuery('admin_logout', async (ctx) => {
  await ctx.answerCallbackQuery('Выход выполнен');
  const tgId = ctx.from.id;
  await prisma.adminSession.delete({ where: { telegramId: BigInt(tgId) } });
  
  await deletePreviousPrompt(ctx);
  ctx.session.step = 'idle';
  await ctx.editMessageText('🚪 Вы успешно вышли из панели администратора.');
});

adminAuthComposer.callbackQuery('admin_menu', async (ctx) => {
  const authorized = await isAdmin(ctx.from.id);
  if (!authorized) return;
  await ctx.answerCallbackQuery();
  await deletePreviousPrompt(ctx);

  ctx.session.step = 'idle';
  ctx.session.adminState = {};
  
  await ctx.editMessageText('🔑 *Главное меню администратора*', {
    parse_mode: 'Markdown',
    reply_markup: getAdminMenuKeyboard()
  });
});
