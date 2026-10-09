import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toDiagChecks } from '../model/Diag.adapter';
import { getDiagReport } from './Diag.api';
import { ReportSchema } from './Diag.schema';

/** Прогон, который просил пользователь: узел и метка нажатия «Проверить». */
export interface DiagRun {
  proxy: string;
  /** Уникальна на каждое нажатие, в том числе после возврата на экран: иначе ключ совпал бы с прогоном из кэша. */
  run: number;
}

export const DIAG_QUERY = {
  all: ['diag'] as const,
  report: (target: DiagRun) => [...DIAG_QUERY.all, 'report', target.proxy, target.run] as const,
} as const;

/**
 * Метка нажатия в ключе: каждое «Проверить» — новый прогон, а не чтение
 * кэша. Повторов нет: отказ проверки — строка отчёта, а не код HTTP, и повтор
 * лишь ещё раз отправил бы пакеты.
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

/** `null` — проверку ещё не запускали: запрос не идёт, опроса нет. */
export function useDiagReport(target: DiagRun | null) {
  return useQuery({
    ...getDiagOptions(target ?? { proxy: '', run: 0 }),
    enabled: target !== null,
    select: toDiagChecks,
  });
}
