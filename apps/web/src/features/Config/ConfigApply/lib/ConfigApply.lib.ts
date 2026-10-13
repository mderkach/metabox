import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  CONFIG_QUERY,
  ConfigDocumentState,
  readRules,
  toCheckFailure,
  toWorkdirMismatch,
  useApplyTransaction,
  useConfigDirty,
  useConfigStale,
  useConfigText,
  useListChanges,
  type CheckFailure,
  type WorkdirMismatch,
} from '@entities/Config';
import { APPLY_PHASE, isApplyActive, useDaemonStatus, type ApplyTransaction } from '@entities/Daemon';
import { toRuleChanges, type RuleChange } from '@entities/Rule';

import { useApplyConfig, useConfirmApply } from '../api/ConfigApply.api';

/**
 * Rereads the document when the cycle reached its end.
 *
 * A confirmed draft stops being a draft: the file on the device now contains
 * it, and the daemon may have appended `experimental.clash_api`, so keeping old
 * edits on top would mean showing a diff with itself. Rollback and failure do
 * not touch the draft: it is what the user repairs the config on.
 */
function useDocumentRefresh(transaction: ApplyTransaction | null) {
  const queryClient = useQueryClient();
  const discard = ConfigDocumentState.use.discard();
  const seen = useRef<string | null>(null);

  useEffect(
    function refreshDocument() {
      if (transaction === null) return;

      const mark = `${transaction.id}:${transaction.phase}`;

      if (seen.current === mark || isApplyActive(transaction.phase)) return;

      seen.current = mark;

      void queryClient.invalidateQueries({ queryKey: CONFIG_QUERY.all });

      if (transaction.phase === APPLY_PHASE.Confirmed) discard();
    },
    [transaction, queryClient, discard]
  );
}

export interface ConfigApplyState {
  isDirty: boolean;
  /** The draft was started from a different config than the one on the device now. */
  isStale: boolean;
  /** There is something to apply and the previous apply has finished. */
  canApply: boolean;
  /** `null` means there were no applies, neither in this session nor before the reload. */
  transaction: ApplyTransaction | null;
  /** The reference changes only with a change of the start error: the bar compares state snapshots by reference. */
  check: CheckFailure | null;
  /** Failure by the service working directory; the reference changes the same way as for `check`. */
  workdir: WorkdirMismatch | null;
  isApplying: boolean;
  isConfirming: boolean;
  apply: () => void;
  confirm: () => void;
  discard: () => void;
}

/**
 * The id of a running transaction is taken from the daemon state, not from the
 * start response: this way the confirmation window survives a page reload and
 * is shown regardless of where the apply was started from, the bar or the
 * version history.
 */
export function useConfigApply(): ConfigApplyState {
  const status = useDaemonStatus();
  const text = useConfigText();
  const base = ConfigDocumentState.use.appliedEtag();
  const listsBase = ConfigDocumentState.use.listsEtag();
  const lists = useListChanges();
  const isDirty = useConfigDirty();
  const isStale = useConfigStale();
  const discard = ConfigDocumentState.use.discard();
  const start = useApplyConfig();
  const confirm = useConfirmApply();

  const id = status.data?.transaction?.id ?? null;
  const state = useApplyTransaction(id);
  const transaction = state.data ?? status.data?.transaction ?? null;

  useDocumentRefresh(transaction);

  const check = useMemo(() => toCheckFailure(start.error), [start.error]);
  const workdir = useMemo(() => toWorkdirMismatch(start.error), [start.error]);

  const onApply = useCallback(() => {
    if (text === null) return;

    start.mutate({ text, base, lists: { ...lists, base: listsBase } });
  }, [text, base, lists, listsBase, start]);

  const onConfirm = useCallback(() => {
    if (transaction === null) return;

    confirm.mutate(transaction.id);
  }, [transaction, confirm]);

  return {
    isDirty,
    isStale,
    canApply: isDirty && !start.isPending && !isApplyActive(transaction?.phase),
    transaction,
    check,
    workdir,
    isApplying: start.isPending || transaction?.phase === APPLY_PHASE.Applying,
    isConfirming: confirm.isPending,
    apply: onApply,
    confirm: onConfirm,
    discard,
  };
}

/** Routing rule changes that Apply will bring; without a draft, empty. */
export function useRuleChanges(): RuleChange[] {
  const applied = ConfigDocumentState.use.applied();
  const draft = ConfigDocumentState.use.draft();

  return useMemo(
    () => (applied === null || draft === null ? [] : toRuleChanges(readRules(applied), readRules(draft))),
    [applied, draft]
  );
}
