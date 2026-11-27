import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { CONFIG_DNS_EDIT_NS } from '../i18n/ConfigDnsEdit.namespace.generated';
import type { DnsReason, DnsPath } from '../model/ConfigDnsEdit.model';

export function ConfigDnsEditAssignment({
  path,
  text,
  stale,
  onAssign,
}: {
  path: DnsPath;
  text: string;
  stale: boolean;
  onAssign: (outbound: string, resolver: string) => DnsReason | 'stale' | null;
}) {
  const { t } = useTranslation(CONFIG_DNS_EDIT_NS);
  const id = useId();
  const openedAt = useRef(text);
  const [error, setError] = useState<DnsReason | 'stale' | null>(null);
  const reason = stale ? 'stale' : path.reason;
  let placeholder = t('dns.choose');
  if (path.mixed) placeholder = t('dns.mixed');
  if (reason !== null) placeholder = t('dns.unavailable');
  const scopeId = `${id}-domains`;
  const hintId = `${id}-hint`;
  let hint = path.mixed ? t('dns.replaceAssignments') : '';
  if (reason !== null) hint = t(`dns.reason.${reason}`);
  const description = [path.domains.length > 0 && scopeId, hint && hintId].filter(Boolean).join(' ');
  const items = path.eligible.map((value) => ({ value, label: value }));

  return (
    <li className='grid min-w-0 items-start gap-2 py-3 sm:grid-cols-2 sm:gap-x-6'>
      <div className='grid min-w-0 gap-1'>
        <Label htmlFor={id} className='flex-wrap gap-x-1.5 wrap-anywhere'>
          {t(`dns.path.${path.kind}`)}
          <span className='min-w-0 font-mono'>{path.tag}</span>
        </Label>
        {path.domains.length > 0 && (
          <p id={scopeId} className='font-mono text-xs wrap-anywhere text-muted-foreground'>
            {path.domains.join(', ')}
          </p>
        )}
      </div>
      <div className='grid min-w-0 gap-1'>
        <Select
          items={items}
          value={path.current}
          disabled={reason !== null}
          onOpenChange={(open) => {
            if (open) {
              openedAt.current = text;
              setError(null);
            }
          }}
          onValueChange={(value: string | null) => {
            if (value !== null && value !== path.current)
              setError(openedAt.current === text ? onAssign(path.tag, value) : 'stale');
          }}
        >
          <SelectTrigger id={id} aria-describedby={description || undefined} className='w-full min-w-0'>
            <SelectValue className='min-w-0 truncate' placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {items.map(({ value }) => (
              <SelectItem value={value} key={value}>
                <span className='min-w-0 font-mono wrap-anywhere'>{value}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hint && (
          <p id={hintId} className='text-xs text-muted-foreground'>
            {hint}
          </p>
        )}
        {error !== null && (
          <p role='alert' className='text-xs text-destructive'>
            {t(`dns.reason.${error}`)}
          </p>
        )}
      </div>
    </li>
  );
}
