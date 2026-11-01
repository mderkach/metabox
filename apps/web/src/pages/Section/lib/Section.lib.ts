/** Node tag for the delete confirmation: references to the node are looked up by it; `''` means none. */
export function nodeTag(node: unknown): string {
  const tag: unknown = typeof node === 'object' && node !== null ? Reflect.get(node, 'tag') : undefined;

  return typeof tag === 'string' ? tag : '';
}
