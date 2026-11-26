import { useId, useRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input, Label } from '@shared/ui';

import { RULE_CATALOG_ADD_NS } from '../i18n/RuleCatalogAdd.namespace.generated';
import type { CatalogChoice, RuleCatalogForm } from '../model/RuleCatalogAdd.form';

const RESULT_LIMIT = 12;

export function RuleCatalogAddSearch({
  choices,
  selected,
  pending,
}: {
  choices: CatalogChoice[];
  selected: CatalogChoice | undefined;
  pending: boolean;
}) {
  const { t } = useTranslation(RULE_CATALOG_ADD_NS);
  const { control, setValue } = useFormContext<RuleCatalogForm>();
  const id = useId();
  const firstFocus = useRef(true);

  return (
    <>
      <div className='flex flex-col gap-1.5'>
        <Label htmlFor={id}>{t('search')}</Label>
        <Controller
          name='search'
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              id={id}
              type='search'
              autoComplete='off'
              spellCheck={false}
              onFocus={(event) => {
                if (firstFocus.current) event.currentTarget.select();
                firstFocus.current = false;
              }}
              onChange={(event) => {
                field.onChange(event);
                setValue('service', '');
                setValue('resolver', '');
              }}
            />
          )}
        />
      </div>
      <fieldset className='min-w-0'>
        <legend className='mb-1.5 text-sm font-medium'>{t('sets')}</legend>
        {choices.length > 0 ? (
          <Controller
            name='service'
            control={control}
            render={({ field }) => (
              <div className='max-h-40 overflow-y-auto rounded-lg border border-border p-1'>
                {choices.slice(0, RESULT_LIMIT).map((choice, index) => (
                  <label
                    key={choice.id}
                    htmlFor={`${id}-${index}`}
                    aria-labelledby={`${id}-label-${index}`}
                    className='flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted has-checked:bg-selected pointer-coarse:min-h-11'
                  >
                    <input
                      id={`${id}-${index}`}
                      type='radio'
                      name={field.name}
                      ref={choice.id === selected?.id ? field.ref : undefined}
                      value={choice.id}
                      checked={choice.id === selected?.id}
                      onBlur={field.onBlur}
                      onChange={() => {
                        field.onChange(choice.id);
                        setValue('resolver', '');
                      }}
                      className='shrink-0 accent-primary'
                    />
                    <span id={`${id}-label-${index}`} className='min-w-0'>
                      <span className='block font-mono text-sm wrap-anywhere'>{choice.category}</span>
                      <span className='block text-xs text-muted-foreground'>
                        {choice.provider} · {choice.list.kind}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          />
        ) : (
          <p role='status' className='text-sm text-muted-foreground'>
            {pending ? t('loading') : t('empty')}
          </p>
        )}
        {choices.length > RESULT_LIMIT && (
          <p className='mt-1 text-xs text-muted-foreground'>
            {t('refine', { shown: RESULT_LIMIT, total: choices.length })}
          </p>
        )}
      </fieldset>
    </>
  );
}
