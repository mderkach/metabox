import type { ParseKeys } from 'i18next';
import { CircleCheck, CircleMinus, CircleX, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  isCheckName,
  isCheckReason,
  type CheckName,
  type CheckReason,
  type CheckStatus,
  type DiagCheck,
} from '@entities/Diag';
import { cn } from '@shared/lib/utils';

import { DIAGNOSTICS_COLUMN } from './DiagnosticsColumns';

/** The tables must cover the daemon's set: a new check or reason is a compile error here. */
const NAME_KEY: Readonly<Record<CheckName, ParseKeys<'pages/Diagnostics'>>> = {
  redirect_port: 'check.redirect_port',
  tproxy_port: 'check.tproxy_port',
  dns_port: 'check.dns_port',
  dns_probe: 'check.dns_probe',
  nft_chains: 'check.nft_chains',
  proxy: 'check.proxy',
  direct: 'check.direct',
};

const REASON_KEY: Readonly<Record<CheckReason, ParseKeys<'pages/Diagnostics'>>> = {
  model_unavailable: 'reason.model_unavailable',
  interception_disabled: 'reason.interception_disabled',
  not_listening: 'reason.not_listening',
  proc_unavailable: 'reason.proc_unavailable',
  config_missing: 'reason.config_missing',
  no_dns_inbound: 'reason.no_dns_inbound',
  dns_name_unset: 'reason.dns_name_unset',
  no_answer: 'reason.no_answer',
  nft_unavailable: 'reason.nft_unavailable',
  nft_unparsed: 'reason.nft_unparsed',
  chains_missing: 'reason.chains_missing',
  proxy_unset: 'reason.proxy_unset',
  proxy_missing: 'reason.proxy_missing',
  runtime_unavailable: 'reason.runtime_unavailable',
  request_failed: 'reason.request_failed',
  unsupported: 'reason.unsupported',
};

/** The result carries two signs, an icon and a color: one of them is not color-based. */
const STATUS_VIEW: Readonly<
  Record<CheckStatus, { icon: LucideIcon; tone: string; label: ParseKeys<'pages/Diagnostics'> }>
> = {
  ok: { icon: CircleCheck, tone: 'text-signal-ok', label: 'status.ok' },
  fail: { icon: CircleX, tone: 'text-signal-bad', label: 'status.fail' },
  skipped: { icon: CircleMinus, tone: 'text-signal-idle', label: 'status.skipped' },
};

/** An unknown code gets no translation and is shown as received. */
function toReasonKey(reason: string | null): ParseKeys<'pages/Diagnostics'> | null {
  return reason !== null && isCheckReason(reason) ? REASON_KEY[reason] : null;
}

export function DiagnosticsRow({ check, rowIndex }: { check: DiagCheck; rowIndex: number }) {
  const { t } = useTranslation('pages/Diagnostics');
  const status = STATUS_VIEW[check.status];
  const reasonKey = toReasonKey(check.reason);

  return (
    <div role='row' aria-rowindex={rowIndex} className={DIAGNOSTICS_COLUMN.Row}>
      <span role='cell' className={cn(DIAGNOSTICS_COLUMN.Name, 'font-medium')}>
        {isCheckName(check.name) ? t(NAME_KEY[check.name]) : check.name}
      </span>

      <span role='cell' className={cn(DIAGNOSTICS_COLUMN.Status, 'flex items-center gap-1.5', status.tone)}>
        <status.icon aria-hidden='true' className='size-4 shrink-0' />
        {t(status.label)}
      </span>

      <span role='cell' className={DIAGNOSTICS_COLUMN.Result}>
        {check.reason !== null && <span>{reasonKey === null ? check.reason : t(reasonKey)}</span>}
        {check.delayMs !== null && <span>{t('delay', { value: check.delayMs })}</span>}
        {check.missing.length > 0 && (
          <ul aria-label={t('missing')} className='flex flex-wrap gap-x-2 gap-y-1 font-mono text-xs'>
            {check.missing.map((chain) => (
              <li key={chain}>{chain}</li>
            ))}
          </ul>
        )}
        {check.detail !== null && (
          <span className='font-mono text-xs break-words text-muted-foreground'>{check.detail}</span>
        )}
      </span>
    </div>
  );
}
