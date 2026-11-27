import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useStore } from 'zustand';

import {
  ConfigDocumentStore,
  getConfigOptions,
  selectConfigStale,
  useApplyTransaction,
  useConfigFileLoad,
} from '@entities/Config';
import { APPLY_PHASE, isApplyActive, useDaemonStatus, type ApplyTransaction } from '@entities/Daemon';
import { PROXY_MUTATION, PROXY_QUERY, useFailedConfigProbes, type ProbeOutcome, type ProxyNode } from '@entities/Proxy';

import {
  realityRecoveryField,
  realityRecoveryHints,
  sameRealityEndpoint,
  type RealityRecoveryField,
} from './ProxyRealityRecovery.field';

const runningRetests = new Set<string>();

type RecoveryState =
  | 'suggested'
  | 'staged'
  | 'applying'
  | 'ready'
  | 'checking'
  | 'no-response'
  | 'probe-error'
  | 'return-staged'
  | 'restored';

export interface ProxyRecoveryItem {
  tag: string;
  state: RecoveryState;
  stage?: () => void;
  retry?: () => void;
  restore?: () => void;
}

interface ApplySubmission {
  id: string;
  base: string;
  text: string;
}

interface Attempt {
  original: RealityRecoveryField;
  base: string;
  returnBase?: string;
  probe?: { revision: string; result: 'checking' | 'answered' | 'no-response' | 'probe-error' };
}

interface Progress {
  state: Exclude<RecoveryState, 'suggested'>;
  revision?: string;
  canRestore?: boolean;
}

function matchingField(text: string | null, tag: string, original: RealityRecoveryField) {
  const found = text === null ? null : realityRecoveryField(text, tag);

  return found !== null && sameRealityEndpoint(found, original) ? found : null;
}

function readyProgress(attempt: Attempt, revision: string, restored: boolean): Progress | null {
  const probe = attempt.probe?.revision === revision ? attempt.probe.result : undefined;

  if (probe === 'answered') return null;
  if (probe === 'checking' || probe === 'probe-error') return { state: probe, revision };
  if (restored) return { state: 'restored', revision };
  if (probe === 'no-response') return { state: probe, revision, canRestore: true };

  return { state: 'ready', revision };
}

function transactionProgress(
  tag: string,
  attempt: Attempt,
  restored: boolean,
  submission: ApplySubmission | null,
  transaction: ApplyTransaction | null,
  revision: string | null,
  current: RealityRecoveryField | null
): Progress | null {
  const base = restored ? attempt.returnBase : attempt.base;
  if (submission === null || submission.base !== base || transaction?.id !== submission.id) return null;

  const expected = restored ? attempt.original.value : true;
  const submitted = matchingField(submission.text, tag, attempt.original);
  if (submitted === null || submitted.value !== expected) return null;

  if (isApplyActive(transaction.phase)) return { state: 'applying' };
  if (transaction.phase !== APPLY_PHASE.Confirmed || transaction.sum === undefined || revision === null) return null;
  if (revision === base) return { state: 'applying' };
  if (revision !== `"${transaction.sum}"` || current === null || current.value !== expected) return null;

  return readyProgress(attempt, revision, restored);
}

function progressOf(
  tag: string,
  attempt: Attempt,
  submission: ApplySubmission | null,
  transaction: ApplyTransaction | null,
  revision: string | null,
  applied: string,
  draft: string | null
): Progress | null {
  const current = matchingField(applied, tag, attempt.original);
  const pending = matchingField(draft, tag, attempt.original);

  if (attempt.returnBase !== undefined) {
    const returned = transactionProgress(tag, attempt, true, submission, transaction, revision, current);
    if (returned !== null) return returned;

    if (revision === attempt.returnBase && current?.value === true) {
      if (pending !== null && pending.value === attempt.original.value) return { state: 'return-staged' };

      return readyProgress(attempt, revision, false);
    }
    return null;
  }

  const enabled = transactionProgress(tag, attempt, false, submission, transaction, revision, current);
  if (enabled !== null) return enabled;

  return revision === attempt.base && pending?.value === true ? { state: 'staged' } : null;
}

function editableField(tag: string, original: RealityRecoveryField, revision: string, expected: boolean | undefined) {
  const document = ConfigDocumentStore.getState();
  if (revision !== document.appliedEtag || document.applied === null || selectConfigStale(document)) return null;

  const applied = matchingField(document.applied, tag, original);
  const draft = matchingField(document.draft ?? document.applied, tag, original);
  if (applied === null || draft === null || applied.value !== expected || draft.value !== expected) return null;

  return draft;
}

export function useProxyRealityRecovery({
  nodes,
  submission,
  testServer,
}: {
  nodes: readonly ProxyNode[];
  submission: ApplySubmission | null;
  /** Starts a delay mutation on the same query client so a newer check can supersede its result. */
  testServer: (tag: string) => Promise<ProbeOutcome>;
}): readonly ProxyRecoveryItem[] {
  const file = useConfigFileLoad(true);
  const applied = file.data?.text;
  const revision = file.data?.etag ?? null;
  const draft = useStore(ConfigDocumentStore, (document) => document.draft);
  const documentRevision = useStore(ConfigDocumentStore, (document) => document.appliedEtag);
  const failed = useFailedConfigProbes(revision);
  const daemon = useDaemonStatus().data;
  const ownTransaction = daemon?.transaction?.id === submission?.id ? (daemon?.transaction ?? null) : null;
  const transaction = useApplyTransaction(ownTransaction?.id ?? null).data ?? ownTransaction;
  const client = useQueryClient();
  const [attempts, setAttempts] = useState<ReadonlyMap<string, Attempt>>(() => new Map());

  const remember = useCallback((tag: string, attempt: Attempt) => {
    setAttempts((entries) => new Map(entries).set(tag, attempt));
  }, []);

  const retry = useCallback(
    async function retry(tag: string, attempt: Attempt, startedOn: string) {
      if (runningRetests.has(tag) || isApplyActive(transaction?.phase)) return;

      runningRetests.add(tag);
      const pending: Attempt = { ...attempt, probe: { revision: startedOn, result: 'checking' } };
      remember(tag, pending);

      async function measure(): Promise<NonNullable<Attempt['probe']>['result'] | null> {
        const query = getConfigOptions();
        const latestProbe = () =>
          client
            .getMutationCache()
            .findAll({ mutationKey: PROXY_MUTATION.delay() })
            .findLast((mutation) => mutation.state.variables === tag);
        const beforeProbe = latestProbe()?.mutationId;
        const before = await client.fetchQuery({ ...query, staleTime: 0 }).catch(() => null);
        if (before === null) {
          return latestProbe()?.mutationId === beforeProbe && client.getQueryData(query.queryKey)?.etag === startedOn
            ? 'probe-error'
            : null;
        }
        if (before.etag !== startedOn) return null;

        const probe = testServer(tag);
        const probeId = latestProbe()?.mutationId;
        const outcome = await probe.catch(() => null);
        const after = await client.fetchQuery({ ...query, staleTime: 0 }).catch(() => null);
        await Promise.all([
          client.invalidateQueries({ queryKey: PROXY_QUERY.list() }),
          client.invalidateQueries({ queryKey: PROXY_QUERY.latency() }),
        ]);

        if (
          probeId === undefined ||
          latestProbe()?.mutationId !== probeId ||
          client.getQueryData(query.queryKey)?.etag !== startedOn ||
          (after !== null && after.etag !== startedOn)
        ) {
          return null;
        }
        if (outcome === null || after === null) return 'probe-error';
        if (outcome.configEtag !== startedOn) return null;

        return outcome.failed ? 'no-response' : 'answered';
      }

      try {
        const result = await measure();
        const resolved: Attempt = { ...attempt, probe: result === null ? undefined : { revision: startedOn, result } };
        setAttempts((entries) => (entries.get(tag) === pending ? new Map(entries).set(tag, resolved) : entries));
      } finally {
        runningRetests.delete(tag);
      }
    },
    [client, remember, testServer, transaction?.phase]
  );

  const restore = useCallback(
    function restore(tag: string, attempt: Attempt, revision: string) {
      const field = editableField(tag, attempt.original, revision, true);
      if (field === null || isApplyActive(transaction?.phase) || runningRetests.has(tag)) return;

      const document = ConfigDocumentStore.getState();
      const original = attempt.original.value;
      if (original === undefined) {
        if (!document.remove(field.path)) return;
      } else {
        document.edit(field.path, original);
      }
      remember(tag, { ...attempt, returnBase: revision });
    },
    [remember, transaction?.phase]
  );

  if (applied === undefined || revision === null) return [];

  const items = new Map<string, ProxyRecoveryItem>();
  const activeApply = isApplyActive(daemon?.transaction?.phase) || isApplyActive(transaction?.phase);
  const canEdit = !activeApply && documentRevision === revision;

  for (const { tag } of realityRecoveryHints(applied, failed, nodes)) {
    const original = realityRecoveryField(applied, tag);
    if (original === null) continue;

    const canStage = canEdit && editableField(tag, original, revision, original.value) !== null;
    const stage = () => {
      const field = editableField(tag, original, revision, original.value);
      if (field === null || activeApply) return;

      ConfigDocumentStore.getState().edit(field.path, true);
      remember(tag, { original, base: revision });
    };

    items.set(tag, { tag, state: 'suggested', stage: canStage ? stage : undefined });
  }

  const present = new Set(nodes.map(({ name }) => name));
  for (const [tag, attempt] of attempts) {
    if (!present.has(tag)) continue;

    const progress = progressOf(tag, attempt, submission, transaction, revision, applied, draft);
    if (progress === null || (progress.state === 'no-response' && !failed.has(tag))) continue;

    const retryRevision = progress.revision;
    const canRetry = !activeApply && retryRevision !== undefined && progress.state !== 'checking';
    const canRestore =
      canEdit && progress.canRestore === true && editableField(tag, attempt.original, revision, true) !== null;
    items.set(tag, {
      tag,
      state: progress.state,
      retry: canRetry ? () => void retry(tag, attempt, retryRevision) : undefined,
      restore: canRestore
        ? () => {
            restore(tag, attempt, revision);
          }
        : undefined,
    });
  }

  return [...items.values()];
}
