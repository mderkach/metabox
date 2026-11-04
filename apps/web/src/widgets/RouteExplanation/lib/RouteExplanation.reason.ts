import type { ParseKeys, TFunction } from 'i18next';

import { type RouteMatch, type RouteReasonCode } from '@entities/Route';

const REASON_KEY: Readonly<Record<RouteReasonCode, ParseKeys<'widgets/RouteExplanation'>>> = {
  not_in_process_list: 'unknown.reason.not_in_process_list',
};

export function unknownReason(t: TFunction<'widgets/RouteExplanation'>, match: RouteMatch): string {
  if (match.reasonCode !== null) {
    return t(REASON_KEY[match.reasonCode]);
  }

  return match.reason.length > 0 ? match.reason : t('unknown.missing');
}
