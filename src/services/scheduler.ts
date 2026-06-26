import { Bot, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';

const prisma = new PrismaClient();
const TIMEZONE = 'Europe/Moscow';

/**
 * Инициализация и запуск планировщика уведомлений
 */
export function startNotificationScheduler(bot: Bot<any>) {
  console.log('Планировщик уведомлений запущен...');
  
  // Проверяем уведомления каждую минуту
  setInterval(async () => {
    try {
      await processPendingNotifications(bot);
    } catch (err) {
      console.error('Ошибка в планировщике уведомлений:', err);
    }
  }, 60000);
}

/**
 * Обработка ожидающих отправки уведомлений
 */
async function processPendingNotifications(bot: Bot<any>) {
  const now = new Date();

  // Ищем все уведомления в статусе pending, запланированные на текущий момент или в прошлом
  const notifications = await prisma.notification.findMany({
    where: {
      status: 'pending',
      scheduledAt: { lte: now }
    },
    include: {
      appointment: {
        include: {
          client: true,
          master: true,
          service: true
        }
      }
    }
  });

  for (const notification of notifications) {
    const { appointment } = notification;

    // Если запись уже отменена, помечаем уведомление как отмененное
    if (appointment.status !== 'confirmed') {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'cancelled' }
      });
      continue;
    }

    const tgId = Number(appointment.client.telegramId);
    const dateLabel = format(toZonedTime(appointment.startsAt, TIMEZONE), 'd MMMM в HH:mm', { locale: ru });

    try {
      if (notification.type === 'reminder_24h') {
        const text = 
          `🌸 *Напоминание о визите!*\n\n` +
          `Ждем тебя завтра на процедуру:\n` +
          `💅 *Услуга:* ${appointment.service.name}\n` +
          `🧑‍🎨 *Мастер:* ${appointment.master.name}\n` +
          `⏰ *Время:* ${dateLabel}\n\n` +
          `Если твои планы изменились, пожалуйста, предупреди нас заранее!`;
        
        await bot.api.sendMessage(tgId, text, { parse_mode: 'Markdown' });
      } 
      
      else if (notification.type === 'reminder_2h') {
        const text = 
          `🔔 *Визит уже сегодня!*\n\n` +
          `Напоминаем, что ты записана на процедуру через 2 часа:\n` +
          `💅 *Услуга:* ${appointment.service.name}\n` +
          `🧑‍🎨 *Мастер:* ${appointment.master.name}\n` +
          `⏰ *Время:* ${dateLabel}\n\n` +
          `Пожалуйста, подтверди свой визит кнопкой ниже:`;

        const keyboard = new InlineKeyboard()
          .text('✅ Подтверждаю, буду', `confirm_app_visit:${appointment.id}`).row()
          .text('❌ Отменить запись', `cancel_app:${appointment.id}`);

        await bot.api.sendMessage(tgId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } 
      
      else if (notification.type === 'feedback_request') {
        // Запрос отзыва отправляется только если визит состоялся (confirmed -> completed)
        // Автоматически завершаем запись в БД, если время прошло
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: 'completed' }
        });

        const text = 
          `💝 *Спасибо за визит в Sebastian!*\n\n` +
          `Тебе понравилась услуга *${appointment.service.name}* у мастера *${appointment.master.name}*?\n\n` +
          `Пожалуйста, оцени качество работы мастера от 1 до 5 звёзд:`;

        const keyboard = new InlineKeyboard()
          .text('⭐ 1', `rate_visit:${appointment.id}:1`)
          .text('⭐ 2', `rate_visit:${appointment.id}:2`)
          .text('⭐ 3', `rate_visit:${appointment.id}:3`)
          .text('⭐ 4', `rate_visit:${appointment.id}:4`)
          .text('⭐ 5', `rate_visit:${appointment.id}:5`);

        await bot.api.sendMessage(tgId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }

      // Обновляем статус уведомления на sent
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'sent',
          sentAt: new Date()
        }
      });

    } catch (err) {
      console.error(`Ошибка при отправке уведомления ${notification.id} клиенту ${tgId}:`, err);
      
      // Помечаем уведомление как failed
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'failed' }
      });
    }
  }
}

/**
 * Регистрация callback-обработчиков для напоминаний и отзывов
 */
export function registerSchedulerCallbacks(bot: Bot<any>) {
  // Подтверждение визита из напоминания за 2 часа
  bot.callbackQuery(/^confirm_app_visit:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Спасибо за подтверждение!');
    await ctx.editMessageText('✅ *Визит подтвержден. Ждем вас!*', { parse_mode: 'Markdown' });
  });

  // Оценка визита
  bot.callbackQuery(/^rate_visit:(.+):(\d)$/, async (ctx) => {
    const appointmentId = ctx.match[1];
    const rating = parseInt(ctx.match[2], 10);

    await ctx.answerCallbackQuery();

    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { master: true, client: true }
      });

      if (!appointment || appointment.feedbackRating !== null) {
        await ctx.editMessageText('Вы уже оставляли оценку для этого визита. Спасибо!');
        return;
      }

      // Сохраняем оценку в БД
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { feedbackRating: rating }
      });

      if (rating === 5) {
        // Для оценки 5 — даем ссылки на карты
        const text = 
          `🎉 *Ура! Мы очень рады, что тебе понравилось!*\n\n` +
          `Твоя оценка вдохновляет мастера *${appointment.master.name}*! Пожалуйста, поделись своим отзывом на картах, чтобы о нас узнали другие:\n\n` +
          `🔗 [Яндекс.Карты](https://yandex.ru/maps)\n` +
          `🔗 [Google Maps](https://maps.google.com)\n` +
          `🔗 [2ГИС](https://2gis.ru)`;

        await ctx.editMessageText(text, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } else {
        // Для оценок ≤ 4 — благодарим за отзыв
        await ctx.editMessageText('Спасибо за твою оценку! Мы постоянно работаем над улучшением нашего сервиса. 🌸');

        // Если оценка ≤ 3 — уведомляем администраторов
        if (rating <= 3) {
          const adminSessions = await prisma.adminSession.findMany();
          for (const session of adminSessions) {
            try {
              await bot.api.sendMessage(
                Number(session.telegramId),
                `⚠️ *Негативный отзыв от клиента!*\n\n` +
                `👤 *Клиент:* ${appointment.client.name} (${appointment.client.phone})\n` +
                `🧑‍🎨 *Мастер:* ${appointment.master.name}\n` +
                `⭐ *Оценка:* ${rating} из 5\n\n` +
                `Свяжитесь с клиентом для выяснения деталей и сглаживания ситуации.`
              );
            } catch (err) {
              console.error(err);
            }
          }
        }
      }

    } catch (err: any) {
      await ctx.reply(`Ошибка при отправке оценки: ${err.message}`);
    }
  });
}
