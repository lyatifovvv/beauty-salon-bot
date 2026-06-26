import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
};

if (!config.TELEGRAM_BOT_TOKEN || config.TELEGRAM_BOT_TOKEN === 'ВАШ_ТЕЛЕГРАМ_ТОКЕН') {
  console.error('КРИТИЧЕСКАЯ ОШИБКА: Токен Telegram-бота не найден в файле .env или не изменен.');
  process.exit(1);
}

if (!config.DATABASE_URL) {
  console.error('КРИТИЧЕСКАЯ ОШИБКА: DATABASE_URL не задан.');
  process.exit(1);
}
