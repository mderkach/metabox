import { z } from 'zod';

import { filterCategories, type RuleSetCatalog, type RuleSetList } from '@entities/RuleSet';

export const RuleCatalogFormSchema = z.object({
  search: z.string(),
  service: z.string(),
  outbound: z.string(),
  resolver: z.string(),
});

export type RuleCatalogForm = z.infer<typeof RuleCatalogFormSchema>;

export interface CatalogChoice {
  id: string;
  provider: string;
  list: RuleSetList;
  category: string;
}

export function searchCatalog(catalog: RuleSetCatalog | undefined, search: string): CatalogChoice[] {
  const needle = search.trim().toLowerCase();
  const choices =
    catalog?.providers.flatMap((provider) =>
      provider.lists.flatMap((list) =>
        filterCategories(list, needle).map((category) => ({
          id: JSON.stringify([provider.id, list.kind, category]),
          provider: provider.name,
          list,
          category,
        }))
      )
    ) ?? [];
  // Put exact names from every source first, even for a short query with many substring matches.
  if (needle !== '') {
    const rank = ({ category }: CatalogChoice) => {
      const name = category.toLowerCase();
      if (name === needle) return -1;
      return name.startsWith(needle) ? 0 : 1;
    };
    choices.sort((a, b) => rank(a) - rank(b));
  }
  return choices;
}
