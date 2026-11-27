import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { Button, Input, Label } from '@shared/ui';

import { CONFIG_DNS_EDIT_NS } from '../i18n/ConfigDnsEdit.namespace.generated';
import { HostEntrySchema, type DnsOptionsProps, type HostEntryForm } from '../model/ConfigDnsEdit.options';

export function ConfigDnsEditHostForm({
  original,
  addresses,
  blocked,
  onSubmit,
  onClose,
}: {
  original: string | null;
  addresses: string[];
  blocked: boolean;
  onSubmit: (form: HostEntryForm) => ReturnType<DnsOptionsProps['stage']>;
  onClose: () => void;
}) {
  const { t } = useTranslation([CONFIG_DNS_EDIT_NS, SHARED_NS]);
  const id = useId();
  const [error, setError] = useState(false);
  const {
    control,
    setError: setFieldError,
    setFocus,
    handleSubmit,
  } = useForm<HostEntryForm>({
    resolver: zodResolver(HostEntrySchema),
    defaultValues: { domain: original ?? '', addresses: addresses.join(', ') },
  });
  useEffect(
    function focusDomain() {
      setFocus('domain');
    },
    [setFocus]
  );

  const submit = handleSubmit((values) => {
    const reason = onSubmit(values);
    if (reason === 'duplicate') setFieldError('domain', { message: 'duplicate' }, { shouldFocus: true });
    else setError(reason !== null);
  });

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes the inline form from any of its fields or buttons.
    <form
      aria-label={original === null ? t('options.add') : t('options.editDomain', { domain: original })}
      className='grid min-w-0 gap-3 rounded-lg bg-muted/40 p-3'
      onSubmit={(event) => {
        void submit(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className='grid min-w-0 gap-3 sm:grid-cols-2'>
        {(['domain', 'addresses'] as const).map((name) => (
          <Controller
            key={name}
            control={control}
            name={name}
            render={({ field, fieldState }) => (
              <div className='grid min-w-0 content-start gap-1.5'>
                <Label htmlFor={`${id}-${name}`}>{t(`options.${name}`)}</Label>
                <Input
                  {...field}
                  id={`${id}-${name}`}
                  className='font-mono'
                  autoComplete='off'
                  autoCapitalize='none'
                  spellCheck={false}
                  placeholder={name === 'domain' ? 'printer.home.arpa' : '192.0.2.10, 2001:db8::10'}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    [name === 'addresses' && `${id}-help`, fieldState.invalid && `${id}-${name}-error`]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                />
                {name === 'addresses' && (
                  <p id={`${id}-help`} className='text-xs text-muted-foreground'>
                    {t('options.addressHelp')}
                  </p>
                )}
                {fieldState.invalid && (
                  <p role='alert' id={`${id}-${name}-error`} className='text-xs text-destructive'>
                    {t(fieldState.error?.message === 'duplicate' ? 'options.duplicate' : `options.invalid.${name}`)}
                  </p>
                )}
              </div>
            )}
          />
        ))}
      </div>
      {(error || blocked) && (
        <p role='alert' className='text-xs text-destructive'>
          {t('dns.reason.stale')}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button type='submit' size='sm' variant='outline' disabled={blocked}>
          {original === null ? t('action.addToDraft', { ns: SHARED_NS }) : t('options.save')}
        </Button>
        <Button type='button' size='sm' variant='ghost' onClick={onClose}>
          {t('action.cancel', { ns: SHARED_NS })}
        </Button>
      </div>
    </form>
  );
}
