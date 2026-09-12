import { useMutation } from '@tanstack/react-query';

import { applyConfig, confirmApply, restoreConfigVersion, useSaveApplyTransaction } from '@entities/Config';

/**
 * Применение черновика. Без ретраев: повтор запустил бы на устройстве второй
 * цикл (Query.md). Тело — текст черновика, а не пересобранный JSON (AC-2).
 */
export function useApplyConfig() {
  const onTransaction = useSaveApplyTransaction();

  return useMutation({
    mutationFn: applyConfig,
    meta: { showError: true, showSuccess: true, successMessageKey: 'apply.start.accepted' },
    onSuccess: onTransaction,
  });
}

export function useConfirmApply() {
  const onTransaction = useSaveApplyTransaction();

  return useMutation({
    mutationFn: confirmApply,
    meta: { showError: true, showSuccess: true, successMessageKey: 'apply.confirm.done' },
    onSuccess: onTransaction,
  });
}

/** Откат на версию идёт тем же протоколом Apply, что и обычное применение. */
export function useRestoreConfigVersion() {
  const onTransaction = useSaveApplyTransaction();

  return useMutation({
    mutationFn: restoreConfigVersion,
    meta: { showError: true, showSuccess: true, successMessageKey: 'apply.start.accepted' },
    onSuccess: onTransaction,
  });
}
