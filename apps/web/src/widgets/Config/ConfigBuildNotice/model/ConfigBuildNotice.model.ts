import { type UnbuiltNode } from '@entities/Config';

export function toNodeName(node: UnbuiltNode): string {
  return node.tag ?? `${node.section}[${String(node.index)}]`;
}
