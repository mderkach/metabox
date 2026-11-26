import type { ParseKeys, TFunction } from 'i18next';

import { type RouteMatch, type RouteReasonCode } from '@entities/Route';

import type { ROUTE_EXPLANATION_NS } from '../i18n/RouteExplanation.namespace.generated';

const REASON_KEY: Readonly<Record<RouteReasonCode, ParseKeys<typeof ROUTE_EXPLANATION_NS>>> = {
  not_in_process_list: 'unknown.reason.not_in_process_list',
};

export function unknownReason(t: TFunction<typeof ROUTE_EXPLANATION_NS>, match: RouteMatch): string {
  if (match.reasonCode !== null) {
    return t(REASON_KEY[match.reasonCode]);
  }

  return match.reason.length > 0 ? match.reason : t('unknown.missing');
}
