import i18next from 'i18next';

export const LANGUAGES = ['ru', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

/** Language the source dictionaries are written in: the fallback goes to it too. */
export const FALLBACK_LANGUAGE: Language = 'ru';

const STORAGE_KEY = 'metabox.language';

function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some((language) => language === value);
}

/**
 * The language choice lives in the browser, not in the daemon: the interface language is personal, like
 * the theme, and one setting for everyone who opens the router panel is a limitation,
 * not a convenience. Storage access is guarded: in a private window it throws.
 */
function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The choice will not survive a reload — that is better than crashing the switcher.
  }
}

/** The saved choice, otherwise the first suitable browser language, otherwise the fallback. */
export function detectLanguage(): Language {
  const stored = readStoredLanguage();

  if (stored !== null) {
    return stored;
  }

  for (const tag of navigator.languages) {
    const [base] = tag.split('-');

    if (isLanguage(base)) {
      return base;
    }
  }

  return FALLBACK_LANGUAGE;
}

/** The `lang` attribute follows the choice: a screen reader picks reading rules by it. */
export function applyDocumentLanguage(language: Language): void {
  document.documentElement.lang = language;
}

export function currentLanguage(): Language {
  return isLanguage(i18next.resolvedLanguage) ? i18next.resolvedLanguage : FALLBACK_LANGUAGE;
}

export async function changeLanguage(language: Language): Promise<void> {
  storeLanguage(language);
  await i18next.changeLanguage(language);
  applyDocumentLanguage(language);
}
