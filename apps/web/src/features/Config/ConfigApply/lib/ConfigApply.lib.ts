import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  CONFIG_QUERY,
  ConfigDocumentState,
  toCheckFailure,
  useApplyTransaction,
  useConfigDirty,
  useConfigText,
  type CheckFailure,
} from '@entities/Config';
import { APPLY_PHASE, isApplyActive, useDaemonStatus, type ApplyTransaction } from '@entities/Daemon';

import { useApplyConfig, useConfirmApply } from '../api/ConfigApply.api';

/**
 * Перечитывает документ, когда цикл дошёл до конца.
 *
 * Подтверждённый черновик перестаёт быть черновиком: файл на устройстве теперь
 * его содержит, а демон мог дописать туда `experimental.clash_api`, и
 * держать поверх этого старые правки значило бы показывать диф с самим собой.
 * Откат и отказ черновик не трогают — на нём пользователь чинит конфиг.
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
  /** Есть что применять и предыдущее применение закончилось. */
  canApply: boolean;
  /** `null` — применений не было ни в этой сессии, ни до перезагрузки. */
  transaction: ApplyTransaction | null;
  /** Ссылка меняется только со сменой ошибки запуска: бар сравнивает снимки состояния по ссылке. */
  check: CheckFailure | null;
  isApplying: boolean;
  isConfirming: boolean;
  apply: () => void;
  confirm: () => void;
  discard: () => void;
}

/**
 * Идентификатор идущей транзакции берётся из состояния демона, а не из ответа
 * на запуск: так окно подтверждения переживает перезагрузку страницы и
 * показывается независимо от того, откуда применение запущено — из бара или из
 * истории версий.
 */
export function useConfigApply(): ConfigApplyState {
  const status = useDaemonStatus();
  const text = useConfigText();
  const isDirty = useConfigDirty();
  const discard = ConfigDocumentState.use.discard();
  const start = useApplyConfig();
  const confirm = useConfirmApply();

  const id = status.data?.transaction?.id ?? null;
  const state = useApplyTransaction(id);
  const transaction = state.data ?? status.data?.transaction ?? null;

  useDocumentRefresh(transaction);

  const check = useMemo(() => toCheckFailure(start.error), [start.error]);

  const onApply = useCallback(() => {
    if (text === null) return;

    start.mutate(text);
  }, [text, start]);

  const onConfirm = useCallback(() => {
    if (transaction === null) return;

    confirm.mutate(transaction.id);
  }, [transaction, confirm]);

  return {
    isDirty,
    canApply: isDirty && !start.isPending && !isApplyActive(transaction?.phase),
    transaction,
    check,
    isApplying: start.isPending || transaction?.phase === APPLY_PHASE.Applying,
    isConfirming: confirm.isPending,
    apply: onApply,
    confirm: onConfirm,
    discard,
  };
}
