import { Bot, session } from 'grammy';
import * as dotenv from 'dotenv';
import { initial, MyContext } from './core/session';
import { adminComposer } from './handlers/admin';
import { clientComposer } from './handlers/client';
import { startNotificationScheduler, registerSchedulerCallbacks } from './services/scheduler';

// Загружаем переменные окружения
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || token === 'ВАШ_ТЕЛЕГРАМ_ТОКЕН') {
  console.error('КРИТИЧЕСКАЯ ОШИБКА: Токен Telegram-бота не найден в файле .env или не изменен.');
  process.exit(1);
}

// Инициализируем бота
const bot = new Bot<MyContext>(token);

// Подключаем сессии (хранение в оперативной памяти)
bot.use(
  session({
    initial,
  })
);

// Регистрируем обработчики (модули)
bot.use(adminComposer);
bot.use(clientComposer);

registerSchedulerCallbacks(bot as any);

// Запуск планировщика уведомлений
startNotificationScheduler(bot as any);

// Логирование ошибок
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
  const e = err.error;
  console.error(e);
});

// Запуск бота
console.log('Бот салона красоты Sebastian успешно запущен...');
bot.start();

// Создаем фиктивный HTTP-сервер для успешного прохождения проверок (health checks) на бесплатных облачных хостингах вроде Render.com (Web Service)
import http from 'http';
const PORT = process.env.PORT || 3000;
http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Sebastian Beauty Salon Bot is running!');
}).listen(PORT, () => {
  console.log(`Dummy HTTP server is listening on port ${PORT} to keep Render happy.`);
});
