import { RULE_SET_PROVIDERS, SET_EXTENSION } from './RuleSet.constants';
import type { RuleSetProvider, RuleSetSource } from './RuleSet.model';

/** Поставщик по идентификатору; `null` — такого в каталоге нет. */
export function findProvider(id: string | null): RuleSetProvider | null {
  if (id === null) {
    return null;
  }

  return RULE_SET_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

/** Собирает адрес набора по шаблону поставщика. */
export function buildRuleSetURL(provider: RuleSetProvider, mirrorId: string, category: string): string {
  const mirror = provider.mirrors.find((item) => item.id === mirrorId) ?? provider.mirrors[0];

  return `${mirror.base}${provider.prefix}${category}${SET_EXTENSION.Binary}`;
}

/** Тег, который панель предлагает для категории: имя файла без расширения. */
export function suggestTag(provider: RuleSetProvider, category: string): string {
  return category === '' ? '' : `${provider.prefix}${category}`;
}

/**
 * Узнаёт в адресе поставщика и категорию. Узнать удаётся не всегда: адрес мог
 * быть вписан руками, и выдавать его за известный источник нельзя — по
 * поставщику пользователь судит, чьему списку доверяет маршрут.
 */
export function describeURL(url: string): RuleSetSource {
  for (const provider of RULE_SET_PROVIDERS) {
    for (const mirror of provider.mirrors) {
      if (!url.startsWith(mirror.base)) {
        continue;
      }

      const file = url.slice(mirror.base.length);

      if (!file.startsWith(provider.prefix) || !file.endsWith(SET_EXTENSION.Binary)) {
        return { providerId: provider.id, category: null };
      }

      return {
        providerId: provider.id,
        category: file.slice(provider.prefix.length, -SET_EXTENSION.Binary.length),
      };
    }
  }

  return { providerId: null, category: null };
}

/**
 * Отбор категорий по подстроке. Совпавшие с начала идут первыми: набравший
 * «goog» ищет `google`, а не `category-google-cn`.
 */
export function filterCategories(provider: RuleSetProvider, query: string): string[] {
  const needle = query.trim().toLowerCase();

  if (needle === '') {
    return [...provider.categories];
  }

  const starts: string[] = [];
  const contains: string[] = [];

  for (const category of provider.categories) {
    if (category.startsWith(needle)) {
      starts.push(category);
      continue;
    }

    if (category.includes(needle)) {
      contains.push(category);
    }
  }

  return [...starts, ...contains];
}
