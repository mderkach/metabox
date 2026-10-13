import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toDiagChecks } from '../model/Diag.adapter';
import { getDiagReport } from './Diag.api';
import { ReportSchema } from './Diag.schema';

/** A run the user asked for: the node and the mark of the "Check" press. */
export interface DiagRun {
  proxy: string;
  /** Unique for every press, including after returning to the screen: otherwise the key would match a run from the cache. */
  run: number;
}

export const DIAG_QUERY = {
  all: ['diag'] as const,
  report: (target: DiagRun) => [...DIAG_QUERY.all, 'report', target.proxy, target.run] as const,
} as const;

/**
 * The press mark in the key: every "Check" is a new run, not a cache read.
 * There are no retries: a check failure is a report row, not an HTTP code, and
 * a retry would only send the packets again.
 */
export function getDiagOptions(target: DiagRun) {
  return queryOptions({
    queryKey: DIAG_QUERY.report(target),
    queryFn: async (context) => decodeResponse(ReportSchema, await getDiagReport(target.proxy, context), 'diag'),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Minute,
    retry: false,
    meta: { showError: true, errorMessageKey: 'source.diag' },
  });
}

/** `null` means the check has not been run yet: the query does not run, there is no polling. */
export function useDiagReport(target: DiagRun | null) {
  return useQuery({
    ...getDiagOptions(target ?? { proxy: '', run: 0 }),
    enabled: target !== null,
    select: toDiagChecks,
  });
}
