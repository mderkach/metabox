import { isLatencyServer, type ProxyNode, type ProxyRuntime } from '@entities/Proxy';

interface ServerEntry {
  group?: string;
  node: ProxyNode;
}

export function toSelected(runtime: ProxyRuntime): ServerEntry[] {
  const selected = new Map<string, ServerEntry>();
  const members = new Set<string>();

  for (const group of runtime.groups) {
    for (const node of group.nodes) {
      members.add(node.name);

      if (node.name === group.now && isLatencyServer(node) && !selected.has(node.name)) {
        selected.set(node.name, { group: group.name, node });
      }
    }
  }

  for (const node of runtime.standalone) {
    if (!members.has(node.name) && isLatencyServer(node)) {
      selected.set(node.name, { node });
    }
  }

  return [...selected.values()];
}
