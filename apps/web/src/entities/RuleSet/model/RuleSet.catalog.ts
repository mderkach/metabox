import { SET_EXTENSION } from './RuleSet.constants';
import type { RuleSetCatalog, RuleSetList, RuleSetProvider, RuleSetSource } from './RuleSet.model';

const UNKNOWN_SOURCE: RuleSetSource = { providerId: null, providerName: null, kind: null, category: null };

/** Поставщик по идентификатору; `null` — такого в каталоге нет. */
export function findProvider(catalog: RuleSetCatalog, id: string | null): RuleSetProvider | null {
  if (id === null) {
    return null;
  }

  return catalog.providers.find((provider) => provider.id === id) ?? null;
}

/**
 * Список поставщика нужного вида; `null` — такого у поставщика нет. Вид
 * принимается строкой: он приходит из поля формы, а не из каталога.
 */
export function findList(catalog: RuleSetCatalog, providerId: string | null, kind: string): RuleSetList | null {
  return findProvider(catalog, providerId)?.lists.find((list) => list.kind === kind) ?? null;
}

/** Собирает адрес набора по шаблону списка. */
export function buildRuleSetURL(list: RuleSetList, mirrorId: string, category: string): string {
  const mirror = list.mirrors.find((item) => item.id === mirrorId) ?? list.mirrors.at(0);

  return mirror === undefined ? '' : `${mirror.base}${list.prefix}${category}${SET_EXTENSION.Binary}`;
}

/** Тег, который панель предлагает для категории: имя файла без расширения. */
export function suggestTag(list: RuleSetList, category: string): string {
  return category === '' ? '' : `${list.prefix}${category}`;
}

/**
 * Узнаёт в адресе поставщика, вид списка и категорию. Узнать удаётся не
 * всегда: адрес мог быть вписан руками, и выдавать его за известный источник
 * нельзя — по поставщику пользователь судит, чьему списку доверяет маршрут.
 */
export function describeURL(catalog: RuleSetCatalog, url: string): RuleSetSource {
  for (const provider of catalog.providers) {
    for (const list of provider.lists) {
      const mirror = list.mirrors.find((item) => url.startsWith(item.base));

      if (mirror === undefined) {
        continue;
      }

      const file = url.slice(mirror.base.length);
      const known = file.startsWith(list.prefix) && file.endsWith(SET_EXTENSION.Binary);

      return {
        providerId: provider.id,
        providerName: provider.name,
        kind: list.kind,
        category: known ? file.slice(list.prefix.length, -SET_EXTENSION.Binary.length) : null,
      };
    }
  }

  return UNKNOWN_SOURCE;
}

const categorySets = new WeakMap<RuleSetList, ReadonlySet<string>>();

/** Есть ли у поставщика файл с таким именем — по перечню, который сверяет демон. */
export function isCatalogCategory(list: RuleSetList, category: string): boolean {
  let known = categorySets.get(list);

  if (known === undefined) {
    known = new Set(list.categories);
    categorySets.set(list, known);
  }

  return known.has(category);
}

/**
 * Отбор категорий по подстроке. Пустой запрос отдаёт подборку поставщика: у
 * полного перечня алфавитный порядок, и начинается он с `0x0` и `115`.
 * Совпавшие с начала идут первыми: набравший «goog» ищет `google`, а не
 * `category-google-cn`.
 */
export function filterCategories(list: RuleSetList, query: string): string[] {
  const needle = query.trim().toLowerCase();

  if (needle === '') {
    return [...list.featured];
  }

  const starts: string[] = [];
  const contains: string[] = [];

  for (const category of list.categories) {
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
