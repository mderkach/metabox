import { MESSAGES, type MessageKey } from './messages';

function isKnownKey(key: string): key is MessageKey {
  return key in MESSAGES;
}

/**
 * Текст по ключу. Неизвестный ключ возвращается как есть: пустая строка на
 * экране скрыла бы опечатку, а сам ключ её показывает.
 */
export function t(key: string): string {
  return isKnownKey(key) ? MESSAGES[key] : key;
}
