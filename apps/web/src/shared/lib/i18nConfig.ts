import type { InitOptions } from 'i18next';

/* Free of browser globals: the e2e scenarios load this module in Node. */

export const LANGUAGES = ['ru', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

/** Language the source dictionaries are written in: the fallback goes to it too. */
export const FALLBACK_LANGUAGE: Language = 'ru';

/**
 * How i18next turns a key into text, the same in the panel, the Vitest tests and the e2e scenarios.
 * Each of them adds its own loading, language choice and bindings on top.
 */
export const I18N_OPTIONS = {
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: LANGUAGES,
  defaultNS: false,
  // React escapes on its own, a second pass breaks quotes and angle brackets.
  interpolation: { escapeValue: false },
} as const satisfies InitOptions;
