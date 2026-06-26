import { Keyboard } from 'grammy';

/**
 * Клавиатура главного меню клиента
 */
export function getMainMenuKeyboard() {
  return new Keyboard()
    .text('💅 Записаться на услугу').row()
    .text('ℹ️ О салоне').text('🖼️ Наше портфолио').row()
    .text('📅 Мои визиты').text('👤 Мой профиль').row()
    .text('💬 Позвать администратора').row()
    .resized();
}
