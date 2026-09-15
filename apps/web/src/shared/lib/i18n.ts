import i18next from 'i18next';

export const LANGUAGES = ['ru', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

/** Язык, на котором написаны словари-источники: на него же уходит откат. */
export const FALLBACK_LANGUAGE: Language = 'ru';

const STORAGE_KEY = 'metabox.language';

function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some((language) => language === value);
}

/**
 * Выбор языка живёт в браузере, а не в демоне: язык интерфейса личный, как и
 * тема, а одна настройка на всех, кто открывает панель роутера, — ограничение,
 * а не удобство. Обращение к хранилищу закрыто: в приватном окне оно бросает.
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
    // Выбор не переживёт перезагрузку — это лучше, чем уронить переключатель.
  }
}

/** Сохранённый выбор, иначе первый подходящий язык браузера, иначе откат. */
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

/** Атрибут `lang` идёт за выбором: по нему скринридер выбирает правила чтения. */
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
