/**
 * Node name on screen: the tag, without it the type, without both the path in the file
 * (`dns.rules[3]`), not the tab name: the node is located in the text by it.
 */
export function nodeName(path: readonly string[], node: unknown, index: number): string {
  if (typeof node === 'object' && node !== null) {
    const tag: unknown = Reflect.get(node, 'tag');

    if (typeof tag === 'string' && tag.length > 0) {
      return tag;
    }

    const type: unknown = Reflect.get(node, 'type');

    if (typeof type === 'string' && type.length > 0) {
      return type;
    }
  }

  return `${path.join('.')}[${String(index)}]`;
}

/** A list node opened in the panel. */
export interface ShownNode {
  index: number;
  node: unknown;
  name: string;
  /** `''` means the node has no tag and nothing can point to it. */
  tag: string;
}

export function toShownNode(path: readonly string[], node: unknown, index: number): ShownNode {
  const tag: unknown = typeof node === 'object' && node !== null ? Reflect.get(node, 'tag') : undefined;

  return { index, node, name: nodeName(path, node, index), tag: typeof tag === 'string' ? tag : '' };
}
