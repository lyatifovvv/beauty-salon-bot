/**
 * Экранирует специальные символы Markdown, чтобы избежать ошибок Telegram API
 * (Bad Request: can't parse entities)
 */
export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
