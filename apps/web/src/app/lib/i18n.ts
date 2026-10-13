import i18next, { type Namespace } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';
import { LOCALE_URLS } from 'virtual:metabox-locales';

import { FALLBACK_LANGUAGE, LANGUAGES, applyDocumentLanguage, detectLanguage } from '@shared/lib/i18n';

/**
 * Dictionaries are files next to the bundle and arrive over the network: this
 * way the panel text does not end up in any build module, neither the first
 * chunk nor a lazy one. Only the address map goes into the bundle: the build
 * puts a fingerprint in the file name, and the runtime cannot know it in
 * advance.
 */
const backend = resourcesToBackend(async (language: string, namespace: string) => {
  const url = LOCALE_URLS[`${language}:${namespace}`];

  if (url === undefined) {
    throw new Error(`[I18N] unknown dictionary ${language}:${namespace}`);
  }

  const response = await fetch(url);

  // The daemon and the dev server answer an unknown address with the SPA shell,
  // not an error: without a type check the dictionary would silently become a
  // piece of HTML.
  if (!response.ok || response.headers.get('content-type')?.includes('application/json') !== true) {
    throw new Error(`[I18N] dictionary ${url} was not served`);
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
      // The namespace is always named explicitly: the project has no shared dictionary.
      ns: [],
      defaultNS: false,
      // React escapes on its own, a second pass breaks quotes and angle brackets.
      interpolation: { escapeValue: false },
      react: { useSuspense: true },
    });
}

/**
 * Preloads namespaces: the route does it in `loader` so the screen opens right
 * away with text instead of a `Suspense` fallback. i18next skips the already
 * loaded ones on its own.
 */
export async function preloadNamespaces(namespaces: Namespace): Promise<void> {
  await i18next.loadNamespaces(namespaces);
}
