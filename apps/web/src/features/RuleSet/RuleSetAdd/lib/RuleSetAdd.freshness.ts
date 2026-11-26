import type { TFunction } from 'i18next';

import { RULE_SET_LIST_SOURCE, type RuleSetList } from '@entities/RuleSet';
import { formatDate } from '@shared/lib/format';

import type { RULE_SET_ADD_NS } from '../i18n/RuleSetAdd.namespace.generated';

/** Where the listing is from and how fresh: the user judges by this whether the hints can be trusted. */
export function listFreshness(t: TFunction<typeof RULE_SET_ADD_NS>, list: RuleSetList): string {
  if (list.updatedAt === null) {
    return t('field.category.undated');
  }

  const date = formatDate(list.updatedAt);

  return list.source === RULE_SET_LIST_SOURCE.Provider
    ? t('field.category.checked', { date })
    : t('field.category.snapshot', { date });
}
