import { Composer } from 'grammy';
import { MyContext } from '../../core/session';
import { getSalonConfig } from '../../services/salonService';

export const clientSalonComposer = new Composer<MyContext>();

clientSalonComposer.hears('ℹ️ О салоне', async (ctx) => {
  const config = getSalonConfig();
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const wh = config.workingHours;
  const scheduleLabel = days.map((day, idx) => {
    const schedule = wh[(idx + 1).toString()];
    return `  ${day}: ${schedule ? `${schedule.from} - ${schedule.to}` : 'Выходной'}`;
  }).join('\n');

  const infoText = 
    `💅 *Салон красоты ${config.name}*\n\n` +
    `📍 *Адрес:* ${config.address}\n` +
    `📞 *Телефон:* ${config.phone}\n` +
    `⏰ *Режим работы:*\n${scheduleLabel}\n\n` +
    `🚗 *Как добраться:* ${config.howToGet}\n\n` +
    `📝 *Правила подготовки:* ${config.rules}`;
  
  await ctx.reply(infoText, { parse_mode: 'Markdown' });
});

clientSalonComposer.hears('💬 Позвать администратора', async (ctx) => {
  await ctx.reply('Если у вас возник вопрос, вы можете написать нашему администратору: @admin_sebastian (ссылка выдуманная для примера).');
});
