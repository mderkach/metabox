import { buildTagOfType, nodeVariants, type NodeRegistry } from '@entities/Config';

/** Node type choice item. */
export interface NodeTypeOption {
  type: string;
  /**
   * Build tag that is not in the binary build: a node of such a type will be
   * saved, but `sing-box check` will reject it. `null` means the type will run
   * or the build contents were not read.
   */
  unbuilt: string | null;
}

/**
 * Registry types for selection, by name. A type outside the binary build is not
 * disabled but marked (AC-47): a config is also built for another binary, and
 * the mark names the consequence. `builtTags` is `null` until the daemon has
 * read the binary: nothing is known about the build contents then, and there
 * are no marks.
 */
export function nodeTypeOptions(registry: NodeRegistry, builtTags: readonly string[] | null): NodeTypeOption[] {
  return nodeVariants(registry)
    .map(({ type }) => {
      const tag = buildTagOfType(registry, type);

      return { type, unbuilt: tag !== null && builtTags !== null && !builtTags.includes(tag) ? tag : null };
    })
    .sort((left, right) => left.type.localeCompare(right.type, 'en'));
}
