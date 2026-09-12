// Что слайс Daemon разрешает импортировать слайсу Config: цикл применения
// принадлежит демону, а конфиг — его предмет, и описание транзакции второй
// копии иметь не должно.
export { DAEMON_ENDPOINT } from '../../api';
export { DAEMON_QUERY, getDaemonStatusOptions } from '../../api';
export { APPLY_PHASE } from '../../model';
export type { ApplyPhase, ApplyTransaction, DaemonStatus } from '../../model';
export type { ApplyTransactionWire, DaemonStatusWire } from '../../api/Daemon.schema';
export { isApplyActive, toApplyTransaction } from '../../model';
