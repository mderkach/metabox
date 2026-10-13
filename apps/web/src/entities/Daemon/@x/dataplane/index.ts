// What the Daemon slice allows the Dataplane slice to import: a dataplane model
// change goes through the daemon apply cycle, and its transaction lies in the
// daemon status.
export { getDaemonStatusOptions } from '../../api';
export { ApplyTransactionSchema } from '../../api/Daemon.schema';
export type { ApplyTransactionWire } from '../../api/Daemon.schema';
export { isApplyActive, toApplyTransaction } from '../../model';
