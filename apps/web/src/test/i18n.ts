import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { FALLBACK_LANGUAGE, I18N_OPTIONS } from '@shared/lib/i18n';

/**
 * The test dictionary is assembled at once and synchronously: a render in a test does not wait, and
 * a network load would substitute a placeholder for the text the
 * assertion checks. The production backend has separate HTTP-loading tests.
 */
const LOCALES = import.meta.glob<Record<string, unknown>>('/src/**/i18n/*.json', {
  eager: true,
  import: 'default',
});

const LOCALE_PATH = /^\/src\/(?<namespace>.+)\/i18n\/(?<language>[a-z-]+)\.json$/;

function collectResources(): Resource {
  const resources: Resource = {};

  for (const [path, dictionary] of Object.entries(LOCALES)) {
    const groups = LOCALE_PATH.exec(path)?.groups;

    if (groups !== undefined) {
      resources[groups.language] = { ...resources[groups.language], [groups.namespace]: dictionary };
    }
  }

  return resources;
}

export async function initTestI18n(): Promise<void> {
  await i18next.use(initReactI18next).init({
    ...I18N_OPTIONS,
    lng: FALLBACK_LANGUAGE,
    resources: collectResources(),
  });
}
