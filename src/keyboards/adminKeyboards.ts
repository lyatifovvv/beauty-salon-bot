import { InlineKeyboard } from 'grammy';

/**
 * Клавиатура панели администратора
 */
export function getAdminMenuKeyboard() {
  return new InlineKeyboard()
    .text('🧑‍🎨 Мастера', 'admin_masters')
    .text('👥 Клиенты', 'admin_clients').row()
    .text('💅 Услуги', 'admin_services')
    .text('📅 Записи салона', 'admin_appointments').row()
    .text('🏪 Салон', 'admin_salon')
    .text('🖼️ Портфолио', 'admin_portfolio').row()
    .text('🚪 Выйти из админки', 'admin_logout');
}
