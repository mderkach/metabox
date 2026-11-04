import type { TFunction } from 'i18next';

import { RULE_SET_LIST_SOURCE, type RuleSetList } from '@entities/RuleSet';
import { formatDate } from '@shared/lib/format';

/** Where the listing is from and how fresh: the user judges by this whether the hints can be trusted. */
export function listFreshness(t: TFunction<'features/RuleSet/RuleSetAdd'>, list: RuleSetList): string {
  if (list.updatedAt === null) {
    return t('field.category.undated');
  }

  const date = formatDate(list.updatedAt);

  return list.source === RULE_SET_LIST_SOURCE.Provider
    ? t('field.category.checked', { date })
    : t('field.category.snapshot', { date });
}
