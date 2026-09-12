// Что слайс Daemon разрешает импортировать слайсу Config: цикл применения
// принадлежит демону, а конфиг — его предмет, и описание транзакции второй
// копии иметь не должно.
export { APPLY_PHASE, DAEMON_QUERY } from '../../api';
export type { ApplyPhase, ApplyTransaction, DaemonStatus } from '../../api';
export { isApplyActive } from '../../model';
