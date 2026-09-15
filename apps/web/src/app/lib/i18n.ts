import i18next, { type Namespace } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';
import { LOCALE_URLS } from 'virtual:metabox-locales';

import { FALLBACK_LANGUAGE, LANGUAGES, applyDocumentLanguage, detectLanguage } from '@shared/lib/i18n';

/**
 * Словари лежат файлами рядом с бандлом и приезжают по сети: так текст панели
 * не попадает ни в один модуль сборки — ни первым чанком, ни ленивым. В бандл
 * едет только карта адресов: в сборке в имени файла стоит отпечаток, и знать
 * его наперёд рантайм не может.
 */
const backend = resourcesToBackend(async (language: string, namespace: string) => {
  const url = LOCALE_URLS[`${language}:${namespace}`];

  if (url === undefined) {
    throw new Error(`[I18N] неизвестный словарь ${language}:${namespace}`);
  }

  const response = await fetch(url);

  // Неизвестный адрес демон и дев-сервер отдают оболочкой SPA, а не отказом:
  // без проверки типа словарь молча стал бы куском HTML.
  if (!response.ok || response.headers.get('content-type')?.includes('application/json') !== true) {
    throw new Error(`[I18N] словарь ${url} не отдан`);
  }

  const dictionary: unknown = await response.json();

  return dictionary;
});

export async function initI18n(): Promise<void> {
  const language = detectLanguage();

  applyDocumentLanguage(language);

  await i18next
    .use(backend)
    .use(initReactI18next)
    .init({
      lng: language,
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: LANGUAGES,
      // Неймспейс всегда называется явно: общего словаря в проекте нет.
      ns: [],
      defaultNS: false,
      // React экранирует сам, второй проход ломает кавычки и угловые скобки.
      interpolation: { escapeValue: false },
      react: { useSuspense: true },
    });
}

/**
 * Догружает неймспейсы заранее — маршрут делает это в `loader`, чтобы экран
 * открывался сразу с текстом, а не через заглушку `Suspense`. Уже загруженные
 * i18next пропускает сам.
 */
export async function preloadNamespaces(namespaces: Namespace): Promise<void> {
  await i18next.loadNamespaces(namespaces);
}
