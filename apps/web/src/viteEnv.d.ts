/// <reference types="vite/client" />

/**
 * Карта адресов словарей: её печатает плагин `metabox-i18n` при сборке, потому
 * что в имени файла стоит отпечаток содержимого, а он известен только там.
 */
declare module 'virtual:metabox-locales' {
  export const LOCALE_URLS: Record<string, string | undefined>;
}
