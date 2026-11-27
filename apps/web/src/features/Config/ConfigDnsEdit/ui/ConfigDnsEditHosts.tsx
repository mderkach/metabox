import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

import { CONFIG_DNS_EDIT_NS } from '../i18n/ConfigDnsEdit.namespace.generated';
import { planHostEntry, type DnsOptionsProps, type HostsTransport } from '../model/ConfigDnsEdit.options';
import { ConfigDnsEditHostForm } from './ConfigDnsEditHostForm';

export function ConfigDnsEditHosts({
  host,
  text,
  version,
  stage,
  disabled,
}: DnsOptionsProps & {
  host: HostsTransport;
  disabled: boolean;
}) {
  const { t } = useTranslation(CONFIG_DNS_EDIT_NS);
  const add = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [form, setForm] = useState<{ domain: string | null; text: string } | null>(null);
  const [message, setMessage] = useState('');
  const blocked = disabled || host.reason !== null;
  function close() {
    setForm(null);
    if (trigger.current?.isConnected === true && !trigger.current.disabled) trigger.current.focus();
    else add.current?.focus();
  }
  function edit(domain: string | null, button: HTMLButtonElement) {
    setMessage('');
    trigger.current = button;
    setForm({ domain, text });
  }

  return (
    <details className='min-w-0 rounded-lg border px-3'>
      <summary className='cursor-pointer rounded-lg py-2 font-medium wrap-anywhere focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11'>
        {t('options.hosts')} · <span className='font-mono'>{host.tag}</span> ({host.entries.length})
      </summary>
      <div className='grid min-w-0 gap-2 pb-3'>
        <p className='max-w-prose text-xs text-muted-foreground'>{t('options.hostsHelp')}</p>
        {host.reason !== null && <p className='text-xs text-muted-foreground'>{t(`options.${host.reason}`)}</p>}
        {host.entries.length > 0 && (
          <ul className='divide-y'>
            {host.entries.map((entry) => (
              <li key={entry.domain} className='flex min-w-0 flex-wrap items-center justify-between gap-2 py-2'>
                <div className='grid min-w-0 gap-0.5 font-mono wrap-anywhere'>
                  <span>{entry.domain}</span>
                  <span className='text-xs text-muted-foreground'>{entry.addresses.join(', ')}</span>
                </div>
                <div className='flex flex-wrap gap-1'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    disabled={blocked}
                    aria-label={t('options.editDomain', { domain: entry.domain })}
                    onClick={(event) => {
                      edit(entry.domain, event.currentTarget);
                    }}
                  >
                    {t('options.edit')}
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    disabled={blocked}
                    aria-label={t('options.removeDomain', { domain: entry.domain })}
                    onClick={() => {
                      const error = stage(planHostEntry(text, version, host.index, entry.domain, null));
                      if (error !== null) {
                        setMessage(t('dns.reason.stale'));
                        return;
                      }
                      setForm(null);
                      setMessage(t('options.removed', { domain: entry.domain }));
                      add.current?.focus();
                    }}
                  >
                    {t('options.remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button
          ref={add}
          type='button'
          variant='outline'
          size='sm'
          className='justify-self-start'
          disabled={blocked}
          onClick={(event) => {
            edit(null, event.currentTarget);
          }}
        >
          {t('options.add')}
        </Button>
        {form !== null && (
          <ConfigDnsEditHostForm
            key={form.domain ?? ''}
            original={form.domain}
            addresses={host.entries.find((entry) => entry.domain === form.domain)?.addresses ?? []}
            blocked={blocked || form.text !== text}
            onClose={close}
            onSubmit={(values) => {
              if (form.text !== text) return 'stale';
              const result = stage(planHostEntry(text, version, host.index, form.domain, values));
              if (result === null) {
                if (form.domain !== values.domain) trigger.current = add.current;
                close();
                setMessage(t('options.saved', { domain: values.domain }));
              }
              return result;
            }}
          />
        )}
        {message !== '' && (
          <p role='status' className='text-xs wrap-anywhere'>
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
