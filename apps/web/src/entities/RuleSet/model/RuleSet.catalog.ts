import { SET_EXTENSION } from './RuleSet.constants';
import type { RuleSetCatalog, RuleSetList, RuleSetProvider, RuleSetSource } from './RuleSet.model';

const UNKNOWN_SOURCE: RuleSetSource = { providerId: null, providerName: null, kind: null, category: null };

/** Provider by identifier; `null` means there is none in the catalog. */
export function findProvider(catalog: RuleSetCatalog, id: string | null): RuleSetProvider | null {
  if (id === null) {
    return null;
  }

  return catalog.providers.find((provider) => provider.id === id) ?? null;
}

/**
 * Provider list of the needed kind; `null` means the provider has none. The
 * kind is accepted as a string: it comes from a form field, not from the
 * catalog.
 */
export function findList(catalog: RuleSetCatalog, providerId: string | null, kind: string): RuleSetList | null {
  return findProvider(catalog, providerId)?.lists.find((list) => list.kind === kind) ?? null;
}

/** Builds a set URL from the list template. */
export function buildRuleSetURL(list: RuleSetList, mirrorId: string, category: string): string {
  const mirror = list.mirrors.find((item) => item.id === mirrorId) ?? list.mirrors.at(0);

  return mirror === undefined ? '' : `${mirror.base}${list.prefix}${category}${SET_EXTENSION.Binary}`;
}

/** Tag the panel suggests for a category: the file name without the extension. */
export function suggestTag(list: RuleSetList, category: string): string {
  return category === '' ? '' : `${list.prefix}${category}`;
}

/**
 * Recognizes the provider, list kind and category in a URL. Recognition does
 * not always succeed: the URL may have been typed by hand, and it cannot be
 * passed off as a known source, since the user judges by the provider whose
 * list the route trusts.
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

/** Whether the provider has a file with this name, by the listing the daemon checks. */
export function isCatalogCategory(list: RuleSetList, category: string): boolean {
  let known = categorySets.get(list);

  if (known === undefined) {
    known = new Set(list.categories);
    categorySets.set(list, known);
  }

  return known.has(category);
}

/**
 * Category filter by substring. An empty query returns the provider's
 * selection: the full listing is alphabetical and starts with `0x0` and `115`.
 * Those matching from the start go first: someone typing "goog" is looking for
 * `google`, not
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
