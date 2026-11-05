import type { ProxyGroup, ProxyNode } from '@entities/Proxy';

interface GroupDelay {
  group: string;
  node: ProxyNode;
}

export function toSelected(groups: ProxyGroup[]): GroupDelay[] {
  const names = new Set(groups.map((group) => group.name));

  return groups.flatMap((group) => {
    if (group.now !== null && names.has(group.now)) {
      return [];
    }

    const node = group.nodes.find((candidate) => candidate.name === group.now);

    return node === undefined ? [] : [{ group: group.name, node }];
  });
}
