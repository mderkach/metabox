import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';

import {
  CONFIG_QUERY,
  CONFIG_SECTION,
  ConfigDocumentState,
  ConfigDocumentStore,
  isGenericSection,
  readRules,
  toConfigChanges,
  toCheckFailure,
  toWorkdirMismatch,
  useApplyTransaction,
  useConfigDirty,
  useConfigStale,
  useConfigText,
  useListChanges,
  type CheckFailure,
  type ConfigChange,
  type ConfigSection,
  type GenericSection,
  type WorkdirMismatch,
} from '@entities/Config';
import {
  APPLY_PHASE,
  isApplyActive,
  useDaemonReachable,
  useDaemonStatus,
  type ApplyTransaction,
} from '@entities/Daemon';
import { toRuleChanges, type RuleChange } from '@entities/Rule';
import { API_FAILURE, ApiError } from '@shared/api';
import { failureLine, firstJsoncError } from '@shared/lib/jsonc';

import { useApplyConfig, useConfirmApply } from '../api/ConfigApply.api';
import { ConfigApplyStore, type SubmittedApply } from '../model/ConfigApply.store';

/**
 * Rereads the document when the cycle reached its end, and settles the draft
 * of the Apply this tab started.
 *
 * Only the transaction the tab submitted (`ConfigApplyStore`) may touch the
 * draft. `GET /api/status` keeps the last transaction, so after a reload the
 * panel sees an old `Confirmed` it never sent, and a draft started since is
 * the user's unsaved work: that transaction only rereads the document.
 *
 * When the submitted Apply is confirmed, its draft is on the device and stops
 * being a draft (the daemon may also have appended `experimental.clash_api`,
 * so keeping old edits on top would mean showing a diff with itself). A draft
 * the user kept editing while the Apply was in flight is kept: it holds the
 * submitted changes plus the new ones, its base moves to the submitted text,
 * and the diff against the reread file shows only what is still unapplied.
 * Rollback and failure do not touch the draft: it is what the user repairs the
 * config on. A rollback to a version is not sent from the draft, so its
 * confirmation leaves the draft alone as well.
 */
function useDocumentRefresh(transaction: ApplyTransaction | null) {
  const queryClient = useQueryClient();
  const seen = useRef<string | null>(null);

  useEffect(
    function refreshDocument() {
      if (transaction === null) return;

      const mark = `${transaction.id}:${transaction.phase}`;

      if (seen.current === mark || isApplyActive(transaction.phase)) return;

      seen.current = mark;

      void queryClient.invalidateQueries({ queryKey: CONFIG_QUERY.all });

      const submitted = ConfigApplyStore.getState().settle(transaction.id);

      if (submitted !== null && transaction.phase === APPLY_PHASE.Confirmed) settleDraft(submitted);
    },
    [transaction, queryClient]
  );
}

function settleDraft({ text, lists }: SubmittedApply) {
  const document = ConfigDocumentStore.getState();
  const unchanged = document.current() === text && JSON.stringify(document.listChanges()) === JSON.stringify(lists);

  if (unchanged) {
    document.discard();
  } else {
    document.rebase(text);
  }
}

export const APPLY_BLOCK = {
  Unreachable: 'unreachable',
  Unparsed: 'unparsed',
} as const;

/** Why there is something to apply but Apply is off. */
export type ApplyBlock = { kind: typeof APPLY_BLOCK.Unreachable } | { kind: typeof APPLY_BLOCK.Unparsed; line: number };

export interface ConfigApplyState {
  isDirty: boolean;
  /** The draft was started from a different config than the one on the device now. */
  isStale: boolean;
  /** Dirty, idle, the daemon answers and the draft parses. */
  canApply: boolean;
  /** `null` means nothing stands in the way, or there is nothing to apply. */
  blocked: ApplyBlock | null;
  /** The start request did not reach the daemon: nothing went to the device. */
  unsent: boolean;
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

  const reachable = useDaemonReachable();
  // Text mode changes the draft on every keystroke: the whole-file parse waits for a deferred render.
  const checkedText = useDeferredValue(text);
  const unparsedLine = useMemo(() => {
    const failure = checkedText === null ? null : firstJsoncError(checkedText);

    return checkedText === null || failure === null ? null : failureLine(checkedText, failure);
  }, [checkedText]);
  const blocked = useMemo(() => toApplyBlock(isDirty, reachable, unparsedLine), [isDirty, reachable, unparsedLine]);
  const unsent = start.error instanceof ApiError && start.error.kind === API_FAILURE.Unreachable;

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
    canApply: isDirty && blocked === null && !start.isPending && !isApplyActive(transaction?.phase),
    blocked,
    unsent,
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

function toApplyBlock(isDirty: boolean, reachable: boolean, unparsedLine: number | null): ApplyBlock | null {
  if (!isDirty) {
    return null;
  }

  if (!reachable) {
    return { kind: APPLY_BLOCK.Unreachable };
  }

  return unparsedLine === null ? null : { kind: APPLY_BLOCK.Unparsed, line: unparsedLine };
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

/** Node and parameter changes that Apply will bring, beside the rule ones; without a draft, empty. */
export function useConfigChanges(): ConfigChange[] {
  const applied = ConfigDocumentState.use.applied();
  const draft = ConfigDocumentState.use.draft();

  return useMemo(() => (applied === null || draft === null ? [] : toConfigChanges(applied, draft)), [applied, draft]);
}

export type SectionLink =
  | { to: '/config' | '/config/rule-set' }
  | { to: '/config/$section'; params: { section: GenericSection } };

export function toSectionLink(section: ConfigSection): SectionLink | null {
  if (section === CONFIG_SECTION.Route) {
    return { to: '/config' };
  }

  if (section === CONFIG_SECTION.RuleSet) {
    return { to: '/config/rule-set' };
  }

  return isGenericSection(section) ? { to: '/config/$section', params: { section } } : null;
}

/** A value as one line of the summary; `null` means a list or an object, which are named as changed without a value. */
export function toValueText(value: unknown): string | null {
  if (value === undefined) {
    return '—';
  }

  return typeof value === 'object' && value !== null ? null : JSON.stringify(value);
}
