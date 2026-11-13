import { readFileSync } from 'node:fs';
import path from 'node:path';

import i18next, { type Resource, type ResourceLanguage } from 'i18next';

import { I18N_OPTIONS } from '../../src/shared/lib/i18nConfig.ts';
import { collectLocales } from '../../tools/i18n.ts';

/** The stand runs in English (`locale` in `playwright.config.ts`). */
const LANGUAGE = 'en';

function isDictionary(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function englishResources(): Resource {
  const namespaces: ResourceLanguage = {};

  for (const locale of collectLocales(path.resolve(import.meta.dirname, '../../src'))) {
    if (locale.language !== LANGUAGE) {
      continue;
    }

    const dictionary: unknown = JSON.parse(readFileSync(locale.file, 'utf8'));

    if (!isDictionary(dictionary)) {
      throw new TypeError(`[E2E] ${locale.file} is not a dictionary`);
    }

    namespaces[locale.namespace] = dictionary;
  }

  return { [LANGUAGE]: namespaces };
}

// A scenario asserts what the panel shows, so a key i18next would print as is fails instead.
const i18n = i18next.createInstance();

await i18n.init({
  ...I18N_OPTIONS,
  lng: LANGUAGE,
  resources: englishResources(),
  initAsync: false,
  parseMissingKeyHandler: (key) => {
    throw new TypeError(`[E2E] no text ${key}`);
  },
  missingInterpolationHandler: (text, match: RegExpExecArray) => {
    throw new TypeError(`[E2E] no value for ${match[0]} in "${text}"`);
  },
});

/**
 * The panel text by its dictionary key, rendered by i18next with the panel's own options.
 * `namespace` is the slice path under `src` (`features/Config/ConfigApply`, `shared`).
 */
export function translate(
  namespace: string,
  key: string,
  values: Partial<Record<string, string | number>> = {}
): string {
  return i18n.t(key, { ...values, ns: namespace });
}
