import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { findProvider, type RuleSetCatalog } from '@entities/RuleSet';
import { SHARED_NS } from '@shared/i18n';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { RULE_SET_ADD_NS } from '../i18n/RuleSetAdd.namespace.generated';
import { CUSTOM_PROVIDER } from '../model/RuleSetAdd.constants';
import { type RuleSetAddModel } from '../model/RuleSetAdd.schema';
import { useRecompose } from '../model/RuleSetAdd.selection';

/** Source: a catalog provider or an own address. */
export function RuleSetAddProviderField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation(RULE_SET_ADD_NS);
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const recompose = useRecompose(catalog);
  const id = useId();

  return (
    <Controller
      control={control}
      name='providerId'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('ruleSet.source', { ns: SHARED_NS })}</Label>
          <Select
            items={[
              ...catalog.providers.map((provider) => ({ value: provider.id, label: provider.name })),
              { value: CUSTOM_PROVIDER, label: t('ruleSet.ownSource', { ns: SHARED_NS }) },
            ]}
            value={field.value}
            onValueChange={(value: string | null) => {
              const next = value ?? CUSTOM_PROVIDER;
              field.onChange(next);

              // The list kind carries over if the new provider has it: whoever
              // changed the source usually looks for the same category at
              // another.
              const lists = findProvider(catalog, next)?.lists ?? [];
              const kind = getValues('kind');
              const nextKind = lists.some((list) => list.kind === kind) ? kind : (lists.at(0)?.kind ?? kind);
              setValue('kind', nextKind);
              recompose(next, nextKind);
            }}
          >
            <SelectTrigger id={id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catalog.providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_PROVIDER}>{t('ruleSet.ownSource', { ns: SHARED_NS })}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}
