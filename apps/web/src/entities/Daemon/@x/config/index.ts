// What the Daemon slice allows the Config slice to import: the apply cycle
// belongs to the daemon, while the config is its subject, and the transaction
// description must not have a second copy.
export { DAEMON_ENDPOINT } from '../../api';
export { DAEMON_QUERY, getDaemonStatusOptions } from '../../api';
export { APPLY_PHASE } from '../../model';
export type { ApplyPhase, ApplyTransaction, DaemonStatus } from '../../model';
export { ApplyTransactionSchema } from '../../api/Daemon.schema';
export type { ApplyTransactionWire, DaemonStatusWire } from '../../api/Daemon.schema';
export { isApplyActive, toApplyTransaction } from '../../model';
