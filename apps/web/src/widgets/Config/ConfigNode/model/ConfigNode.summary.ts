/** What to show in the header of a collapsed node: the type and address by which it is recognized. */
export interface NodeSummary {
  type: string | null;
  /** Inbound `listen:port`, outbound `server:port`; `null` when the node has no address. */
  address: string | null;
}

function readString(node: object, key: string): string | null {
  const value: unknown = Reflect.get(node, key);

  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPort(node: object, key: string): string | null {
  const value: unknown = Reflect.get(node, key);

  return typeof value === 'number' ? String(value) : null;
}

function joinAddress(host: string | null, port: string | null): string | null {
  if (port === null) {
    return host;
  }

  return `${host ?? ''}:${port}`;
}

export function nodeSummary(node: unknown): NodeSummary {
  if (typeof node !== 'object' || node === null) {
    return { type: null, address: null };
  }

  const listen = joinAddress(readString(node, 'listen'), readPort(node, 'listen_port'));
  const server = joinAddress(readString(node, 'server'), readPort(node, 'server_port'));

  return { type: readString(node, 'type'), address: listen ?? server };
}
