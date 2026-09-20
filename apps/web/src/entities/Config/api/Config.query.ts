import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { useMemo } from 'react';

import {
  DAEMON_ENDPOINT,
  getDaemonStatusOptions,
  isApplyActive,
  toApplyTransaction,
  type ApplyTransactionWire,
} from '@entities/Daemon/@x/config';
import { CACHE_TIME, POLL_INTERVAL } from '@shared/api';
import { ConfigSchema, type Config } from '@shared/api/generated';
import { parseJsonc } from '@shared/lib/jsonc';
import { type UnknownField, toUnknownFields } from '@shared/lib/schemaIssues';

import { toConfigVersions } from '../model/Config.adapter';
import { toOutboundTypes } from '../model/Config.model';
import { getApplyState, getConfig, getConfigVersions } from './Config.api';

export const CONFIG_QUERY = {
  all: ['config'] as const,
  current: () => [...CONFIG_QUERY.all, 'current'] as const,
  history: () => [...CONFIG_QUERY.all, 'history'] as const,
  apply: (id: string) => [...CONFIG_QUERY.all, 'apply', id] as const,
} as const;

export function getConfigOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.current(),
    queryFn: getConfig,
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'toast.config.draft.fetchFailed' },
  });
}

export interface ParsedConfig {
  /** Текст файла как есть: правки применяются к нему, а не к модели (ADR-0004). */
  text: string;
  /** `null` — схема конфиг не приняла; что именно, сказано в `issues`. */
  config: Config | null;
  issues: string[];
  /** Узлы с полями, которых схема не знает: путь узла → имена полей. */
  unknown: UnknownField[];
}

/**
 * Схемы строгие: поле, которого в схеме нет, разбор отмечает, а не пропускает
 * молча. Узел с таким полем панель показывает нераспознанным и правит текстом.
 *
 * Модель при этом строится всё равно: схема собрана из релизной сборки форка и
 * заведомо знает меньше бинаря, а один незнакомый ключ не должен гасить экраны
 * с формами. Провал не бросает — панель обязана открываться и на непонятом
 * конфиге. Диалект тот же, что у бинаря: комментарии и запятая перед
 * закрывающей скобкой.
 */
export function parseConfig(text: string): ParsedConfig {
  const { value, failure } = parseJsonc(text);

  if (failure !== null) {
    return {
      text,
      config: null,
      issues: [i18next.t('jsonc.fileUnparsed', { ns: 'shared', reason: failure.text })],
      unknown: [],
    };
  }

  const parsed = ConfigSchema.safeParse(value);

  if (parsed.success) {
    return { text, config: parsed.data, issues: [], unknown: [] };
  }

  const unknown = toUnknownFields(parsed.error.issues);

  if (unknown !== null) {
    // Известные поля схема проверила, остались только лишние — значение уже
    // имеет нужную форму, и второй проход дал бы ровно его.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- см. выше
    return { text, config: value as Config, issues: [], unknown };
  }

  return {
    text,
    config: null,
    issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    unknown: [],
  };
}

export function useConfig() {
  return useQuery({ ...getConfigOptions(), select: parseConfig });
}

/** Тип каждого аутбаунда применённого конфига по его тегу. */
export function useOutboundTypes(): ReadonlyMap<string, string> {
  const config = useConfig();
  const document = config.data?.config ?? null;

  return useMemo(() => toOutboundTypes(document), [document]);
}

export function getConfigVersionsOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.history(),
    queryFn: getConfigVersions,
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'toast.config.versions.fetchFailed' },
  });
}

/** История версий, от свежей к старой: откатываются обычно на предыдущую. */
export function useConfigVersions() {
  return useQuery({ ...getConfigVersionsOptions(), select: toConfigVersions });
}

export function getApplyStateOptions(id: string) {
  return queryOptions({
    queryKey: CONFIG_QUERY.apply(id),
    queryFn: async function fetchApplyState({ signal }) {
      return getApplyState(id, { signal });
    },
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
  return useQuery({ ...getApplyStateOptions(id ?? ''), enabled: id !== null, select: toApplyTransaction });
}

/**
 * Кладёт ответ применения в кэш.
 *
 * Идущая транзакция живёт в статусе демона: он отдаёт её в `GET /api/status`, и
 * панель находит её после перезагрузки страницы (ADR-0002). Ответ на запуск
 * пишется туда же, иначе окно подтверждения появлялось бы только со следующим
 * опросом, а запуск из другого экрана — откат на версию — бар бы и вовсе не
 * заметил.
 */
export function useSaveApplyTransaction() {
  const queryClient = useQueryClient();

  return (transaction: ApplyTransactionWire) => {
    queryClient.setQueryData(getApplyStateOptions(transaction.id).queryKey, transaction);

    queryClient.setQueryData(getDaemonStatusOptions().queryKey, (status) =>
      status === undefined
        ? status
        : { ...status, transaction, transaction_href: DAEMON_ENDPOINT.applyState(transaction.id) }
    );
  };
}
