import { useId } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { findProvider, type RuleSetCatalog } from '@entities/RuleSet';
import { ToggleGroup, ToggleGroupItem } from '@shared/ui';

import { type RuleSetAddModel } from '../model/RuleSetAdd.schema';
import { useRecompose } from '../model/RuleSetAdd.selection';

/**
 * List kind: domains or addresses. Separate from the provider because these are
 * two different questions: whose list to trust and what to look for in it.
 */
export function RuleSetAddKindField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const providerId = useWatch({ control, name: 'providerId' });
  const recompose = useRecompose(catalog);
  const labelId = useId();
  const lists = findProvider(catalog, providerId)?.lists ?? [];

  if (lists.length === 0) {
    return null;
  }

  return (
    <Controller
      control={control}
      name='kind'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <span id={labelId} className='text-sm leading-none font-medium'>
            {t('field.kind.label')}
          </span>
          <ToggleGroup
            variant='outline'
            size='sm'
            aria-labelledby={labelId}
            spacing={1.5}
            value={[field.value]}
            onValueChange={(value) => {
              const next = lists.find((list) => list.kind === value[0])?.kind;

              // Pressing the selected kind again deselects it, and without a
              // kind the address cannot be built.
              if (next === undefined) {
                return;
              }

              field.onChange(next);
              recompose(providerId, next);
            }}
            className='w-fit'
          >
            {lists.map((list) => (
              <ToggleGroupItem key={list.kind} value={list.kind}>
                {t(`kind.${list.kind}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    />
  );
}
