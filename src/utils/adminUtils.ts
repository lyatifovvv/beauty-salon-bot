import { MyContext } from '../core/session';
import { getMasterById } from '../services/masterService'; // will fix imports later if needed
import { InlineKeyboard } from 'grammy';
import { listServices as getAllServices } from '../services/serviceService';
import { getSalonConfig } from '../services/salonService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function deletePreviousPrompt(ctx: MyContext) {
  const promptId = ctx.session.adminState?.promptMessageId;
  if (promptId && ctx.chat) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, promptId);
    } catch (e) {
      // Игнорируем ошибку
    }
    if (ctx.session.adminState) {
      ctx.session.adminState.promptMessageId = undefined;
    }
  }
}

export async function sendNewPrompt(ctx: MyContext, text: string, options?: any) {
  await deletePreviousPrompt(ctx);
  const msg = await ctx.reply(text, options);
  if (!ctx.session.adminState) ctx.session.adminState = {};
  ctx.session.adminState.promptMessageId = msg.message_id;
  return msg;
}

export async function deleteAdminInputMessage(ctx: MyContext) {
  if (ctx.chat && ctx.message) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      // Игнорируем ошибку
    }
  }
}

export async function renderMasterServicesKeyboard(masterId: string) {
  const master = await getMasterById(masterId);
  if (!master) throw new Error('Мастер не найден');

  const allServices = await getAllServices(true);
  const keyboard = new InlineKeyboard();

  for (const s of allServices) {
    const hasService = master.services.some(ms => ms.id === s.id);
    const icon = hasService ? '✅' : '❌';
    const action = hasService ? 'd' : 'c';
    
    keyboard.text(`${icon} ${s.name}`, `adm_m_s:${s.id}:${action}`).row();
  }
  keyboard.text('⬅️ Назад в карточку мастера', `adm_v_m:${masterId}`).row();
  return { master, keyboard };
}

export async function renderWorkingHoursDaysMenu(ctx: MyContext, masterId: string, isEditMessage = true) {
  const master = await getMasterById(masterId);
  if (!master) return;

  const wh = master.isActive
    ? JSON.parse(master.workingHours) as Record<string, { from: string; to: string } | null>
    : { "1": null, "2": null, "3": null, "4": null, "5": null, "6": null, "7": null };

  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const scheduleLabel = days.map((day, idx) => {
    const schedule = wh[(idx + 1).toString()];
    return `  ${day}: ${schedule ? `${schedule.from} - ${schedule.to}` : 'Выходной'}`;
  }).join('\n');

  const text =
    `⏰ *Настройка расписания мастера:* ${master.name}\n\n` +
    `*Текущее расписание на неделю:*\n${scheduleLabel}\n\n` +
    `Выберите день недели для настройки:`;

  const fullDaysNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const keyboard = new InlineKeyboard();
  fullDaysNames.forEach((day, idx) => {
    keyboard.text(day, `adm_wh_d:${masterId}:${idx + 1}`).row();
  });
  keyboard.text('✅ Готово (к карточке)', `adm_v_m:${masterId}`);

  if (isEditMessage) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

export function getSalonCardDetails() {
  const config = getSalonConfig();
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const wh = config.workingHours;
  const scheduleLabel = days.map((day, idx) => {
    const schedule = wh[(idx + 1).toString()];
    return `  ${day}: ${schedule ? `${schedule.from} - ${schedule.to}` : 'Выходной'}`;
  }).join('\n');

  const text =
    `🏪 *Управление салоном:* ${config.name}\n\n` +
    `📍 *Адрес:* ${config.address}\n` +
    `📞 *Телефон:* ${config.phone}\n` +
    `🚗 *Как добраться:* ${config.howToGet}\n` +
    `📝 *Правила:* ${config.rules}\n\n` +
    `⏰ *Часы работы салона:*\n${scheduleLabel}`;

  const keyboard = new InlineKeyboard()
    .text('✏️ Имя салона', 'adm_ed_sal:name')
    .text('📍 Адрес', 'adm_ed_sal:address').row()
    .text('📞 Телефон', 'adm_ed_sal:phone')
    .text('🚗 Как добраться', 'adm_ed_sal:howToGet').row()
    .text('📝 Правила', 'adm_ed_sal:rules').row()
    .text('⏰ Часы работы салона', 'adm_ed_sal:workingHours').row()
    .text('⬅️ В главное меню', 'admin_menu');

  return { text, keyboard };
}

export async function renderSalonWorkingHoursDaysMenu(ctx: MyContext, isEditMessage = true) {
  const config = getSalonConfig();
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const wh = config.workingHours;
  const scheduleLabel = days.map((day, idx) => {
    const schedule = wh[(idx + 1).toString()];
    return `  ${day}: ${schedule ? `${schedule.from} - ${schedule.to}` : 'Выходной'}`;
  }).join('\n');

  const text =
    `⏰ *Настройка расписания салона:* ${config.name}\n\n` +
    `*Текущее расписание салона:*\n${scheduleLabel}\n\n` +
    `Выберите день недели для настройки:`;

  const fullDaysNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const keyboard = new InlineKeyboard();
  fullDaysNames.forEach((day, idx) => {
    keyboard.text(day, `adm_sal_wh_d:${idx + 1}`).row();
  });
  keyboard.text('✅ Готово (к карточке салона)', 'admin_salon');

  if (isEditMessage) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

export async function isAdmin(telegramId: number | bigint): Promise<boolean> {
  const session = await prisma.adminSession.findUnique({
    where: { telegramId: BigInt(telegramId) }
  });
  if (!session) return false;
  
  const now = new Date();
  if (session.expiresAt < now) {
    await prisma.adminSession.delete({ where: { telegramId: BigInt(telegramId) } });
    return false;
  }
  return true;
}
