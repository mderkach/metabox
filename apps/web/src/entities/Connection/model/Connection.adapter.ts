import { decodeFrame } from '@shared/api';

import { ConnectionsSnapshotSchema, type ConnectionWire } from '../api/Connection.schema';
import {
  EMPTY_OUTBOUND_TYPES,
  FINAL_ACTION,
  toRouteKind,
  type ConnectionRate,
  type ConnectionRow,
} from './Connection.model';

/**
 * Speeds come from outside: they can be computed only next to the previous snapshot.
 *
 * `outboundTypes` are the outbound types of the applied config; without it the
 * action tone is read from the runtime string.
 */
export function toConnectionRow(
  connection: ConnectionWire,
  rate: ConnectionRate,
  outboundTypes: ReadonlyMap<string, string> = EMPTY_OUTBOUND_TYPES
): ConnectionRow {
  const action = connection.final ? FINAL_ACTION : connection.action;
  const chain = [...connection.chain].reverse();

  return {
    id: connection.id,
    host: connection.host,
    network: connection.network,
    source: connection.source,
    rule: connection.rule,
    // The default outbound is shown as a config node, not an empty string: "no
    // rule matched" is an observable fact.
    action,
    kind: toRouteKind(action, chain, outboundTypes),
    // The chain arrives from node to group, and a person reads it in the opposite direction.
    chain,
    upload: connection.upload,
    download: connection.download,
    downRate: rate.down,
    upRate: rate.up,
    startedAt: Date.parse(connection.started_at),
    searchText: [connection.host, connection.source, connection.network, connection.rule, action, ...chain]
      .join(' ')
      .toLowerCase(),
  };
}

/** `null` means the snapshot was rejected; the store counts the rejected ones. */
export function toConnectionsSnapshot(raw: unknown) {
  return decodeFrame(ConnectionsSnapshotSchema, raw, 'connections');
}
