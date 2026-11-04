import type { ParseKeys } from 'i18next';

import { isCheckReason, type CheckReason } from '@entities/Diag';

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
  not_measured: 'reason.not_measured',
  runtime_unavailable: 'reason.runtime_unavailable',
  request_failed: 'reason.request_failed',
  unsupported: 'reason.unsupported',
};

export function toReasonKey(reason: string | null): ParseKeys<'pages/Diagnostics'> | null {
  return reason !== null && isCheckReason(reason) ? REASON_KEY[reason] : null;
}
