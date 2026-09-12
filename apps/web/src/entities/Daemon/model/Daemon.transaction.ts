import { APPLY_PHASE } from './Daemon.model';

/**
 * Применение ещё идёт: конфиг пишется или ждёт подтверждения связи.
 *
 * Правило живёт в слайсе, который владеет транзакцией: у демона это
 * `apply.Transaction.Active`, и вторая копия на фронте разъехалась бы с ним
 * молча — а от неё зависят и запрет второго применения, и опрос хода цикла.
 */
export function isApplyActive(phase: string | undefined): boolean {
  return phase === APPLY_PHASE.Applying || phase === APPLY_PHASE.AwaitingConfirm;
}
