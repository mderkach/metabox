import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  DAEMON_QUERY,
  isApplyActive,
  type ApplyTransaction,
  type DaemonStatus,
  DAEMON_ENDPOINT,
} from '@entities/Daemon/@x/config';
import { CACHE_TIME, POLL_INTERVAL } from '@shared/api';
import { ConfigSchema, type Config } from '@shared/api/generated';

import { toConfigVersions } from '../model/Config.mapper';
import {
  applyConfig,
  confirmApply,
  getApplyState,
  getConfig,
  getConfigVersions,
  restoreConfigVersion,
} from './Config.api';

export const CONFIG_QUERY = {
  all: ['config'] as const,
  current: () => [...CONFIG_QUERY.all, 'current'] as const,
  history: () => [...CONFIG_QUERY.all, 'history'] as const,
  apply: (id: string) => [...CONFIG_QUERY.all, 'apply', id] as const,
} as const;

export function getConfigOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.current(),
    queryFn: async ({ signal }) => getConfig({ signal }),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'config.draft.fetchFailed' },
  });
}

export interface ParsedConfig {
  /** Текст файла как есть: правки применяются к нему, а не к модели (ADR-0004). */
  text: string;
  /** `null` — схема конфиг не приняла; что именно, сказано в `issues`. */
  config: Config | null;
  issues: string[];
}

/**
 * Схема `looseObject`, поэтому незнакомые узлы разбор переживают (AC-3). Провал
 * не бросает: панель обязана открываться и на непонятом конфиге (NFR-1).
 */
export function parseConfig(text: string): ParsedConfig {
  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch (error) {
    return { text, config: null, issues: [`файл не разбирается как JSON: ${String(error)}`] };
  }

  const parsed = ConfigSchema.safeParse(data);

  if (parsed.success) {
    return { text, config: parsed.data, issues: [] };
  }

  return {
    text,
    config: null,
    issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}

export function useConfig() {
  return useQuery({ ...getConfigOptions(), select: parseConfig });
}

export function getConfigVersionsOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.history(),
    queryFn: async ({ signal }) => getConfigVersions({ signal }),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'config.versions.fetchFailed' },
  });
}

/** История версий, от свежей к старой: откатываются обычно на предыдущую. */
export function useConfigVersions() {
  return useQuery({
    ...getConfigVersionsOptions(),
    select: (data) => toConfigVersions(data.versions),
  });
}

export function getApplyStateOptions(id: string) {
  return queryOptions({
    queryKey: CONFIG_QUERY.apply(id),
    queryFn: async ({ signal }) => getApplyState(id, { signal }),
    staleTime: 0,
    gcTime: CACHE_TIME.Minute,
    // Идущее применение опрашивается секундно: окно подтверждения — минута.
    refetchInterval: (query) => (isApplyActive(query.state.data?.phase) ? POLL_INTERVAL.Apply : false),
    // Опрос идёт до конца цикла, и каждый промах завалил бы экран тостами:
    // ход применения показывает сам бар.
    meta: { showError: false },
  });
}

/**
 * Ход применения. `null` — применений нет; тогда запрос не заводится.
 *
 * Состояние читается ручкой демона, а не выводится из ответа на запуск: цикл
 * живёт дольше запроса и переживает перезагрузку страницы (ADR-0002).
 */
export function useApplyTransaction(id: string | null) {
  return useQuery({ ...getApplyStateOptions(id ?? ''), enabled: id !== null });
}

/**
 * Ответ применения кладётся в кэш статуса.
 *
 * Идущая транзакция живёт там: демон отдаёт её в `GET /api/status`, и панель
 * находит её после перезагрузки страницы (ADR-0002). Ответ на запуск пишется
 * туда же, иначе окно подтверждения появлялось бы только со следующим опросом,
 * а запуск из другого экрана — откат на версию — бар бы и вовсе не заметил.
 */
function useTransactionResult() {
  const queryClient = useQueryClient();

  return (transaction: ApplyTransaction) => {
    queryClient.setQueryData(CONFIG_QUERY.apply(transaction.id), transaction);

    queryClient.setQueryData<DaemonStatus>(DAEMON_QUERY.status(), (status) =>
      status === undefined
        ? status
        : { ...status, transaction, transaction_href: DAEMON_ENDPOINT.applyState(transaction.id) }
    );
  };
}

/**
 * Применение черновика. Без ретраев: повтор запустил бы на устройстве второй
 * цикл (Query.md). Тело — текст черновика, а не пересобранный JSON (AC-2).
 */
export function useApplyConfig() {
  const onTransaction = useTransactionResult();

  return useMutation({
    mutationFn: async (text: string) => applyConfig(text),
    meta: { showError: true, showSuccess: true, successMessageKey: 'apply.start.accepted' },
    onSuccess: onTransaction,
  });
}

export function useConfirmApply() {
  const onTransaction = useTransactionResult();

  return useMutation({
    mutationFn: async (id: string) => confirmApply(id),
    meta: { showError: true, showSuccess: true, successMessageKey: 'apply.confirm.done' },
    onSuccess: onTransaction,
  });
}

/** Откат на версию идёт тем же протоколом Apply, что и обычное применение. */
export function useRestoreConfigVersion() {
  const onTransaction = useTransactionResult();

  return useMutation({
    mutationFn: async (id: number) => restoreConfigVersion(id),
    meta: { showError: true, showSuccess: true, successMessageKey: 'apply.start.accepted' },
    onSuccess: onTransaction,
  });
}
