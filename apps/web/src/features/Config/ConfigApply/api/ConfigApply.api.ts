import { useMutation, useMutationState } from '@tanstack/react-query';

import { applyConfig, confirmApply, restoreConfigVersion, useSaveApplyTransaction } from '@entities/Config';
import { isRecord } from '@shared/lib/isRecord';

import { ConfigApplyStore } from '../model/ConfigApply.store';

const APPLY_DRAFT = ['config', 'apply-draft'] as const;

export function useLatestConfigApplySubmission() {
  const submissions = useMutationState({
    filters: { mutationKey: APPLY_DRAFT, exact: true, status: 'success' },
    select: ({ state: { data, variables } }) => {
      if (!isRecord(data) || !isRecord(variables)) return null;
      const { id } = data;
      const { text, base } = variables;

      return typeof id === 'string' && typeof text === 'string' && typeof base === 'string' ? { id, text, base } : null;
    },
  });

  return submissions.at(-1) ?? null;
}

/**
 * Applying a draft. No retries: a repeat would start a second cycle on the
 * device (Query.md). The body is the draft text, not reassembled JSON. No
 * success toast: the apply bar shows the accepted start itself.
 *
 * An accepted start records the sent draft: it is how the panel later tells
 * the transaction of this tab from any other one.
 */
export function useApplyConfig() {
  const onTransaction = useSaveApplyTransaction();

  return useMutation({
    mutationKey: APPLY_DRAFT,
    mutationFn: applyConfig,
    meta: { showError: true },
    onSuccess: (transaction, { text, lists }) => {
      onTransaction(transaction);
      ConfigApplyStore.getState().submit({
        id: transaction.id,
        text,
        lists: { put: lists?.put ?? {}, remove: lists?.remove ?? [] },
      });
    },
  });
}

export function useConfirmApply() {
  const onTransaction = useSaveApplyTransaction();

  return useMutation({
    mutationFn: confirmApply,
    meta: { showError: true, showSuccess: true, successMessageKey: 'toast.apply.confirm.done' },
    onSuccess: onTransaction,
  });
}

/** Rollback to a version goes through the same Apply protocol as a regular apply. */
export function useRestoreConfigVersion() {
  const onTransaction = useSaveApplyTransaction();

  return useMutation({
    mutationFn: restoreConfigVersion,
    meta: { showError: true },
    onSuccess: onTransaction,
  });
}
