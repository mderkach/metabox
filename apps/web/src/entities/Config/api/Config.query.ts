import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { useMemo } from 'react';

import {
  ApplyTransactionSchema,
  DAEMON_ENDPOINT,
  getDaemonStatusOptions,
  isApplyActive,
  toApplyTransaction,
  type ApplyTransactionWire,
} from '@entities/Daemon/@x/config';
import { CACHE_TIME, POLL_INTERVAL, decodeResponse } from '@shared/api';
import { RuleSetFilesSchema } from '@shared/api/daemon.generated';
import { ConfigSchema, type Config } from '@shared/api/generated';
import { jsonPathLocator, lineOfOffset, parseJsonc } from '@shared/lib/jsonc';
import { type UnknownField, toUnknownFields } from '@shared/lib/schemaIssues';

import { toConfigVersions } from '../model/Config.adapter';
import { toOutboundTypes } from '../model/Config.model';
import { getApplyState, getConfig, getConfigLists, getConfigVersions, type ConfigFile } from './Config.api';
import { ConfigVersionsSchema } from './Config.schema';

export const CONFIG_QUERY = {
  all: ['config'] as const,
  current: () => [...CONFIG_QUERY.all, 'current'] as const,
  lists: () => [...CONFIG_QUERY.all, 'lists'] as const,
  history: () => [...CONFIG_QUERY.all, 'history'] as const,
  apply: (id: string) => [...CONFIG_QUERY.all, 'apply', id] as const,
} as const;

export function getConfigOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.current(),
    queryFn: getConfig,
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'source.config' },
  });
}

/** Замечание к показанному документу: что не так и где это в тексте. */
export interface ConfigIssue {
  /** Готовый текст: узел, причина и строка, когда узел найден в тексте. */
  text: string;
  /** Смещение узла в исходном тексте; `null` — узел в тексте не найден. */
  offset: number | null;
}

export interface ParsedConfig {
  /** Текст файла как есть: правки применяются к нему, а не к модели. */
  text: string;
  /** `null` — схема конфиг не приняла; что именно, сказано в `issues`. */
  config: Config | null;
  issues: ConfigIssue[];
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
      issues: [
        {
          text: i18next.t('jsonc.fileUnparsed', { ns: 'shared', reason: failure.text }),
          offset: failure.offset,
        },
      ],
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

  const locate = jsonPathLocator(text);

  return {
    text,
    config: null,
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.join('.');
      const offset = locate(issue.path.filter((key) => typeof key !== 'symbol'));

      return {
        text:
          offset === null
            ? i18next.t('schema.issue', { ns: 'shared', path, message: issue.message })
            : i18next.t('schema.issueAtLine', {
                ns: 'shared',
                line: lineOfOffset(text, offset),
                path,
                message: issue.message,
              }),
        offset,
      };
    }),
    unknown: [],
  };
}

export interface ParsedConfigFile extends ParsedConfig {
  /** Отпечаток файла из `ETag`: с ним черновик уходит в `If-Match` применения. */
  etag: string | null;
}

function parseConfigFile(file: ConfigFile): ParsedConfigFile {
  return { ...parseConfig(file.text), etag: file.etag };
}

export function useConfig() {
  return useQuery({ ...getConfigOptions(), select: parseConfigFile });
}

export function getConfigListsOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.lists(),
    queryFn: async (context) => decodeResponse(RuleSetFilesSchema, await getConfigLists(context), 'rule-set files'),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'source.ruleSetFiles' },
  });
}

/** Файлы своих списков с отпечатком набора: он уходит в `lists_base` применения. */
export function useConfigLists() {
  return useQuery(getConfigListsOptions());
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
    queryFn: async (context) =>
      decodeResponse(ConfigVersionsSchema, await getConfigVersions(context), 'config versions'),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'source.versions' },
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
      return decodeResponse(ApplyTransactionSchema, await getApplyState(id, { signal }), 'apply');
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
 * живёт дольше запроса и переживает перезагрузку страницы.
 */
export function useApplyTransaction(id: string | null) {
  return useQuery({ ...getApplyStateOptions(id ?? ''), enabled: id !== null, select: toApplyTransaction });
}

/**
 * Кладёт ответ применения в кэш.
 *
 * Идущая транзакция живёт в статусе демона: он отдаёт её в `GET /api/status`, и
 * панель находит её после перезагрузки страницы. Ответ на запуск
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
