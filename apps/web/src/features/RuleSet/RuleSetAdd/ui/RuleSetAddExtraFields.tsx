import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Autocomplete, Input, Label } from '@shared/ui';

import { describedBy } from '../lib/RuleSetAdd.descriptions';
import { type RuleSetAddModel } from '../model/RuleSetAdd.schema';
import { matchOutbounds } from '../model/RuleSetAdd.search';
import { RuleSetAddFieldError } from './RuleSetAddFieldError';

/**
 * Update interval and download node. Collapsed: both are rarely needed, and
 * expanded they take half the form on a narrow screen. A failure on either
 * expands the block forcibly, otherwise the message would stay under the
 * disclosure.
 */
export function RuleSetAddExtraFields({ outbounds }: { outbounds: readonly string[] }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, formState } = useFormContext<RuleSetAddModel>();
  const [open, setOpen] = useState(false);
  const intervalId = useId();
  const intervalHintId = useId();
  const intervalErrorId = useId();
  const detourId = useId();
  const detourHintId = useId();
  const detourErrorId = useId();
  const panelId = useId();

  const rejected = formState.errors.updateInterval !== undefined || formState.errors.detour !== undefined;
  const expanded = open || rejected;

  return (
    <div className='flex flex-col gap-3'>
      <button
        type='button'
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className='flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
      >
        <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
        {t('extra.toggle')}
      </button>

      {expanded && (
        <div id={panelId} className='flex flex-col gap-3 border-l border-border pl-3.5'>
          <Controller
            control={control}
            name='updateInterval'
            render={({ field, fieldState }) => (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={intervalId}>{t('field.interval.label')}</Label>
                <Input
                  id={intervalId}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('field.interval.placeholder')}
                  autoComplete='off'
                  className='font-mono'
                  aria-invalid={fieldState.error !== undefined}
                  aria-describedby={describedBy(
                    intervalHintId,
                    fieldState.error === undefined ? undefined : intervalErrorId
                  )}
                />
                <p id={intervalHintId} className='text-xs text-muted-foreground'>
                  {t('field.interval.hint')}
                </p>
                <RuleSetAddFieldError id={intervalErrorId} message={fieldState.error?.message} />
              </div>
            )}
          />

          <Controller
            control={control}
            name='detour'
            render={({ field, fieldState }) => (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={detourId}>{t('field.detour.label')}</Label>
                <Autocomplete
                  id={detourId}
                  items={matchOutbounds(outbounds, field.value)}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder={t('field.detour.placeholder')}
                  autoComplete='off'
                  spellCheck={false}
                  className='font-mono'
                  listClassName='font-mono'
                  aria-invalid={fieldState.error !== undefined}
                  aria-describedby={describedBy(
                    detourHintId,
                    fieldState.error === undefined ? undefined : detourErrorId
                  )}
                />
                <p id={detourHintId} className='text-xs text-muted-foreground'>
                  {t('field.detour.hint')}
                </p>
                <RuleSetAddFieldError id={detourErrorId} message={fieldState.error?.message} />
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
