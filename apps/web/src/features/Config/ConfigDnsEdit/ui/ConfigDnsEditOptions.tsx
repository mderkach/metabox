import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { CONFIG_DNS_EDIT_NS } from '../i18n/ConfigDnsEdit.namespace.generated';
import { DNS_STRATEGIES, planDnsStrategy, readDnsOptions, type DnsOptionsProps } from '../model/ConfigDnsEdit.options';
import { ConfigDnsEditHosts } from './ConfigDnsEditHosts';

export function ConfigDnsEditOptions(props: DnsOptionsProps) {
  const { text, version, stale, stage } = props;
  const { t } = useTranslation(CONFIG_DNS_EDIT_NS);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const openedAt = useRef(text);
  const { strategy, knownStrategy, reason, hosts } = useMemo(() => readDnsOptions(text, version), [text, version]);
  const disabled = stale || reason !== null;
  const items = DNS_STRATEGIES.map((value) => ({ value, label: t(`options.strategy.${value}`) }));

  const family = items.find((item) => item.value === strategy)?.label ?? strategy;

  return (
    <details
      className='min-w-0 border-t pt-3'
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className='cursor-pointer rounded-lg py-2 font-medium focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11'>
        {t('options.title')}
      </summary>
      {open && (
        <div className='grid min-w-0 gap-4 py-2'>
          <div className='grid min-w-0 items-start gap-2 sm:grid-cols-2 sm:gap-x-6'>
            <div className='grid min-w-0 gap-1'>
              <Label htmlFor={id}>{t('options.family')}</Label>
              <p id={`${id}-help`} className='max-w-prose text-xs text-muted-foreground'>
                {t('options.familyHelp')}
              </p>
            </div>
            {disabled || !knownStrategy ? (
              <output id={id} aria-describedby={`${id}-help`} className='text-sm font-medium wrap-anywhere'>
                {family}
              </output>
            ) : (
              <Select
                items={items}
                value={strategy}
                onOpenChange={(opening) => {
                  if (opening) {
                    openedAt.current = text;
                    setFailed(false);
                  }
                }}
                onValueChange={(value) => {
                  const choice = items.find((item) => item.value === value);
                  if (choice && value !== strategy)
                    setFailed(
                      openedAt.current !== text || stage(planDnsStrategy(text, version, choice.value)) !== null
                    );
                }}
              >
                <SelectTrigger id={id} className='w-full min-w-0' aria-describedby={`${id}-help`}>
                  <SelectValue className='min-w-0 truncate'>{family}</SelectValue>
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
          </div>
          {!knownStrategy && <p className='text-xs text-muted-foreground'>{t('options.unknownStrategy')}</p>}
          {disabled && (
            <p className='text-xs text-muted-foreground'>{t(`dns.reason.${stale ? 'stale' : (reason ?? 'draft')}`)}</p>
          )}
          {failed && (
            <p role='alert' className='text-xs text-destructive'>
              {t('dns.reason.stale')}
            </p>
          )}
          {hosts.length === 0 ? (
            <p className='max-w-prose text-sm text-muted-foreground'>{t('options.noHosts')}</p>
          ) : (
            hosts.map((host) => <ConfigDnsEditHosts key={host.index} {...props} host={host} disabled={disabled} />)
          )}
        </div>
      )}
    </details>
  );
}
