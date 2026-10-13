import type { AxiosRequestConfig } from 'axios';

import { DAEMON_ENDPOINT, type ApplyTransactionWire } from '@entities/Daemon/@x/config';
import { ApiClientInstance } from '@shared/api';
import type { ApplyEnvelopeWire, RuleSetFilesWire } from '@shared/api/daemon.generated';

import { CONFIG_ENDPOINT } from './Config.endpoints';
import type { ConfigVersionsWire } from './Config.schema';

/** Axios would parse the body into an object, but we need the original bytes of the file. */
const KEEP_RAW = [(data: string) => data];

/** The response is read as text: the file formatting is preserved. */
const AS_TEXT: AxiosRequestConfig = { responseType: 'text', transformResponse: KEEP_RAW };

/**
 * The body goes as a string and the type is set by hand: for a string axios
 * does not set the header itself, and the daemon accepts the config as JSON.
 */
const SEND_TEXT = { 'Content-Type': 'application/json' } as const;

export interface ConfigFile {
  /** File bytes as is. */
  text: string;
  /** `ETag` of the response is the file fingerprint; it goes into the apply `If-Match`. */
  etag: string | null;
}

/**
 * The config is fetched as text: edits are applied to the original bytes,
 * otherwise the user's key order is rewritten entirely.
 */
export async function getConfig(config?: AxiosRequestConfig): Promise<ConfigFile> {
  const { body, etag } = await ApiClientInstance.getTagged<string>(CONFIG_ENDPOINT.config(), {
    ...AS_TEXT,
    ...config,
  });

  return { text: body, etag };
}

/** Files of its own lists from the `rule-sets/` subdirectory together with the set fingerprint. */
export async function getConfigLists(config?: AxiosRequestConfig): Promise<RuleSetFilesWire> {
  return ApiClientInstance.get<RuleSetFilesWire>(CONFIG_ENDPOINT.ruleSetFiles(), config);
}

export async function getApplyState(id: string, config?: AxiosRequestConfig): Promise<ApplyTransactionWire> {
  return ApiClientInstance.get<ApplyTransactionWire>(DAEMON_ENDPOINT.applyState(id), config);
}

export async function getConfigVersions(config?: AxiosRequestConfig): Promise<ConfigVersionsWire> {
  return ApiClientInstance.get<ConfigVersionsWire>(CONFIG_ENDPOINT.versions(), config);
}

/** A version is served with the same bytes it was applied with. */
export async function getConfigVersion(id: number, config?: AxiosRequestConfig): Promise<string> {
  return ApiClientInstance.get<string>(CONFIG_ENDPOINT.version(id), { ...AS_TEXT, ...config });
}

/** Apply envelope type: the daemon uses it to tell an envelope from bare config bytes. */
const SEND_ENVELOPE = { 'Content-Type': 'application/vnd.metabox.apply+json' } as const;

export interface ApplyDraft {
  /** Draft text as is, without reassembly. */
  text: string;
  /**
   * `ConfigFile.etag` of the config the draft was written on top of. The daemon
   * compares it with the file and rejects an apply on top of an edit made
   * behind the panel's back. `null` means apply without the check.
   */
  base: string | null;
  /** Changes to list files; without them the body stays bare config bytes. */
  lists?: {
    put: Record<string, string>;
    remove: string[];
    /** Fingerprint of the file set the client edited from; `null` means no check. */
    base: string | null;
  };
}

/**
 * Starts the apply. The response arrives after `sing-box check` but before the
 * end of the cycle: the apply outlives the request. A failed check returns 422
 * with the binary output in `details`, which the caller shows.
 *
 * With list file changes the body goes as an envelope with its own
 * Content-Type: the config itself is JSON too, and by the shared type the
 * envelope could not be told apart.
 */
export async function applyConfig({ text, base, lists }: ApplyDraft): Promise<ApplyTransactionWire> {
  const match = base === null ? {} : { 'If-Match': base };

  if (lists === undefined || (Object.keys(lists.put).length === 0 && lists.remove.length === 0)) {
    return ApiClientInstance.post<ApplyTransactionWire, string>(DAEMON_ENDPOINT.apply(), text, {
      headers: { ...SEND_TEXT, ...match },
    });
  }

  const envelope: ApplyEnvelopeWire = {
    config: text,
    lists: lists.put,
    remove_lists: lists.remove,
    ...(lists.base === null ? {} : { lists_base: lists.base }),
  };

  return ApiClientInstance.post<ApplyTransactionWire, ApplyEnvelopeWire>(DAEMON_ENDPOINT.apply(), envelope, {
    headers: { ...SEND_ENVELOPE, ...match },
  });
}

/** Confirms that the connection is alive: without it the daemon returns the previous config. */
export async function confirmApply(id: string): Promise<ApplyTransactionWire> {
  return ApiClientInstance.post<ApplyTransactionWire>(DAEMON_ENDPOINT.applyConfirm(id));
}

/**
 * Rollback to a version. The daemon runs it through the usual Apply protocol,
 * so the response is the same transaction with a confirmation window.
 */
export async function restoreConfigVersion(id: number): Promise<ApplyTransactionWire> {
  return ApiClientInstance.post<ApplyTransactionWire>(CONFIG_ENDPOINT.versionRestore(id));
}
