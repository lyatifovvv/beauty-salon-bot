import { Composer } from 'grammy';
import { MyContext } from '../../core/session';
import { getMainMenuKeyboard } from '../../keyboards/clientKeyboards';

export const clientStartComposer = new Composer<MyContext>();

clientStartComposer.command('start', async (ctx) => {
  ctx.session.step = 'idle';
  const welcomeText = 
    `Привет! Добро пожаловать в салон красоты *Sebastian* 🌟\n\n` +
    `Я помогу тебе быстро записаться к мастеру, посмотреть твои визиты или узнать информацию о салоне.\n\n` +
    `Выбери нужное действие в меню ниже:`;
  
  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(),
  });
});
