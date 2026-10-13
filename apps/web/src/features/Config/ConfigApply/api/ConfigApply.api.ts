import { useMutation } from '@tanstack/react-query';

import { applyConfig, confirmApply, restoreConfigVersion, useSaveApplyTransaction } from '@entities/Config';

/**
 * Applying a draft. No retries: a repeat would start a second cycle on the
 * device (Query.md). The body is the draft text, not reassembled JSON.
 */
export function useApplyConfig() {
  const onTransaction = useSaveApplyTransaction();

  return useMutation({
    mutationFn: applyConfig,
    meta: { showError: true, showSuccess: true, successMessageKey: 'toast.apply.start.accepted' },
    onSuccess: onTransaction,
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
    meta: { showError: true, showSuccess: true, successMessageKey: 'toast.apply.start.accepted' },
    onSuccess: onTransaction,
  });
}
