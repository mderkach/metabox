/// <reference types="vite/client" />

/**
 * Dictionary URL map: printed by the `metabox-i18n` plugin at build time, because
 * the file name carries a content fingerprint, which is known only there.
 */
declare module 'virtual:metabox-locales' {
  export const LOCALE_URLS: Record<string, string | undefined>;
}
