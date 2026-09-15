import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Словарь тестов собирается разом и синхронно: рендер в тесте не ждёт, и
 * загрузка по сети подставила бы заглушку вместо текста, который проверяет
 * ассерт. Саму загрузку проверяет браузер, а не jsdom.
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
    lng: 'ru',
    fallbackLng: 'ru',
    resources: collectResources(),
    defaultNS: false,
    interpolation: { escapeValue: false },
  });
}
