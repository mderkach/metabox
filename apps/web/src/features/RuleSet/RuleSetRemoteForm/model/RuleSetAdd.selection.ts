import { useFormContext, useWatch } from 'react-hook-form';

import { findList, type RuleSetCatalog, type RuleSetList } from '@entities/RuleSet';

import { composeRuleSetTag, composeRuleSetURL, type RuleSetRemoteFormModel } from './RuleSetRemoteForm.schema';

/** Catalog list selected in the form; `null` means an own address or the provider has no such kind. */
export function useSelectedList(catalog: RuleSetCatalog): RuleSetList | null {
  const { control } = useFormContext<RuleSetRemoteFormModel>();
  const providerId = useWatch({ control, name: 'providerId' });
  const kind = useWatch({ control, name: 'kind' });

  return findList(catalog, providerId, kind);
}

/**
 * Rebuilds the address and name for the selected provider and list kind. The
 * mirror is kept if the new list has it, otherwise the first one is taken.
 */
export function useRecompose(catalog: RuleSetCatalog) {
  const { setValue, getValues } = useFormContext<RuleSetRemoteFormModel>();

  return (providerId: string, kind: string) => {
    const list = findList(catalog, providerId, kind);
    const mirrorId = getValues('mirrorId');
    const nextMirror = list?.mirrors.find((mirror) => mirror.id === mirrorId)?.id ?? list?.mirrors.at(0)?.id ?? '';
    const category = getValues('category');

    setValue('mirrorId', nextMirror);
    setValue('url', composeRuleSetURL(list, nextMirror, category));
    setValue('tag', composeRuleSetTag(list, category));
  };
}
