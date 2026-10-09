// Что слайс Daemon разрешает импортировать слайсу Dataplane: смена модели
// обвязки идёт циклом применения демона, и её транзакция лежит в его статусе.
export { getDaemonStatusOptions } from '../../api';
export { ApplyTransactionSchema } from '../../api/Daemon.schema';
export type { ApplyTransactionWire } from '../../api/Daemon.schema';
export { isApplyActive, toApplyTransaction } from '../../model';
