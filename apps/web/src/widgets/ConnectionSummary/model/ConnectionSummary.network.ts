import type { ConnectionShare } from '@entities/Connection';

const PROTOCOL_ORDER = ['tcp', 'udp'];

export function byProtocol(left: ConnectionShare, right: ConnectionShare): number {
  const leftIndex = PROTOCOL_ORDER.indexOf(left.key);
  const rightIndex = PROTOCOL_ORDER.indexOf(right.key);

  return (leftIndex < 0 ? PROTOCOL_ORDER.length : leftIndex) - (rightIndex < 0 ? PROTOCOL_ORDER.length : rightIndex);
}
