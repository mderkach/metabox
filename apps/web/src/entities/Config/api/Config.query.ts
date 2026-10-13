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

/** A remark on the shown document: what is wrong and where it is in the text. */
export interface ConfigIssue {
  /** Ready text: the node, the reason and the line when the node is found in the text. */
  text: string;
  /** Node offset in the source text; `null` means the node is not found in the text. */
  offset: number | null;
}

export interface ParsedConfig {
  /** File text as is: edits are applied to it, not to the model. */
  text: string;
  /** `null` means the schema did not accept the config; what exactly is stated in `issues`. */
  config: Config | null;
  issues: ConfigIssue[];
  /** Nodes with fields the schema does not know: node path to field names. */
  unknown: UnknownField[];
}

/**
 * Schemas are strict: a field that is not in the schema is flagged by parsing,
 * not skipped silently. The panel shows a node with such a field as
 * unrecognized and edits it as text.
 *
 * The model is still built: the schema is assembled from a release build of the
 * fork and knowingly knows less than the binary, and one unfamiliar key must
 * not turn off the screens with forms. A failure does not throw: the panel must
 * open even on a config it does not understand. The dialect is the same as the
 * binary's: comments and a comma before the closing bracket.
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
    // Known fields were checked by the schema and only extra ones remain: the
    // value already has the right shape, and a second pass would give exactly
    // it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
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
  /** File fingerprint from `ETag`: with it the draft goes into the apply `If-Match`. */
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

/** Files of its own lists with the set fingerprint: it goes into the apply `lists_base`. */
export function useConfigLists() {
  return useQuery(getConfigListsOptions());
}

/** Type of each outbound of the applied config by its tag. */
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

/** Version history, newest to oldest: rollbacks usually go to the previous one. */
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
    // A running apply is polled every second: the confirmation window is a minute.
    refetchInterval: (query) => (isApplyActive(query.state.data?.phase) ? POLL_INTERVAL.Apply : false),
    // Polling runs until the end of the cycle, and every miss would flood the
    // screen with toasts: the apply bar shows the progress itself.
    meta: { showError: false },
  });
}

/**
 * Apply progress. `null` means there are no applies; then the query is not created.
 *
 * The state is read from a daemon endpoint, not derived from the start
 * response: the cycle outlives the request and survives a page reload.
 */
export function useApplyTransaction(id: string | null) {
  return useQuery({ ...getApplyStateOptions(id ?? ''), enabled: id !== null, select: toApplyTransaction });
}

/**
 * Puts the apply response into the cache.
 *
 * A running transaction lives in the daemon status: it serves it in `GET
 * /api/status`, and the panel finds it after a page reload. The start response
 * is written there too, otherwise the confirmation window would appear only
 * with the next poll, and a start from another screen, a rollback to a version,
 * would not be noticed by the bar at all.
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
