import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { DnsServerSchema, type DnsReason, type DnsServerForm } from '../model/SimpleRoutes.dns';

export function SimpleRoutesDnsServerForm({
  detours,
  reason,
  onSubmit,
  onClose,
}: {
  detours: string[];
  reason: DnsReason | 'stale' | null;
  onSubmit: (values: DnsServerForm) => DnsReason | 'stale' | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('pages/SimpleRoutes');
  const id = useId();
  const [failure, setFailure] = useState<DnsReason | 'stale' | null>(null);
  const form = useForm<DnsServerForm>({
    resolver: zodResolver(DnsServerSchema),
    defaultValues: { tag: '', address: '', detour: '' },
  });
  const { setFocus } = form;
  useEffect(
    function focusServerName() {
      setFocus('tag');
    },
    [setFocus]
  );

  const submit = form.handleSubmit((server) => {
    const error = onSubmit(server);
    if (error === null) onClose();
    else setFailure(error);
  });
  const items = [{ value: '', label: t('dns.directDial') }, ...detours.map((value) => ({ value, label: value }))];

  return (
    <form
      className='grid min-w-0 gap-3 rounded-lg bg-muted/40 p-3'
      aria-label={t('dns.add')}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <p className='max-w-prose text-sm text-muted-foreground'>{t('dns.addHint')}</p>
      <div className='grid min-w-0 gap-3 sm:grid-cols-2'>
        {(['tag', 'address'] as const).map((name) => (
          <Controller
            key={name}
            name={name}
            control={form.control}
            render={({ field, fieldState }) => (
              <div className='grid min-w-0 gap-1.5'>
                <Label htmlFor={`${id}-${name}`}>{t(`dns.field.${name}`)}</Label>
                <Input
                  {...field}
                  id={`${id}-${name}`}
                  className='font-mono'
                  autoComplete='off'
                  spellCheck={false}
                  autoCapitalize='none'
                  placeholder={name === 'address' ? '1.1.1.1' : undefined}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? `${id}-${name}-error` : undefined}
                />
                {fieldState.invalid && (
                  <p id={`${id}-${name}-error`} role='alert' className='text-xs text-destructive'>
                    {t(`dns.reason.${name}`)}
                  </p>
                )}
              </div>
            )}
          />
        ))}
      </div>
      <div className='grid min-w-0 gap-1.5'>
        <Label htmlFor={`${id}-detour`}>{t('dns.field.detour')}</Label>
        <Controller
          name='detour'
          control={form.control}
          render={({ field }) => (
            <Select
              items={items}
              value={field.value}
              onValueChange={(value: string | null) => {
                if (value !== null) field.onChange(value);
              }}
            >
              <SelectTrigger id={`${id}-detour`} ref={field.ref} onBlur={field.onBlur} className='w-full min-w-0'>
                <SelectValue className='min-w-0 truncate' />
              </SelectTrigger>
              <SelectContent>
                {items.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      {failure !== null && (
        <p role='alert' className='text-sm text-destructive'>
          {t(`dns.reason.${failure}`)}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button type='submit' size='sm' variant='outline' disabled={reason !== null}>
          {t('custom.submit')}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          onClick={() => {
            onClose();
          }}
        >
          {t('custom.cancel')}
        </Button>
      </div>
    </form>
  );
}
