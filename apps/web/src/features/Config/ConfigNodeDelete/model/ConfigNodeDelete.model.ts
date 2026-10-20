import { CONFIG_REFERENCE, type ConfigReference, type NodeListSection } from '@entities/Config';

export interface NodeReferenceGroup {
  section: NodeListSection;
  names: string[];
}

/** Node references of one section in one group, in the order the sections first appear. */
export function groupNodeReferences(references: readonly ConfigReference[]): NodeReferenceGroup[] {
  const groups = new Map<NodeListSection, string[]>();

  for (const reference of references) {
    if (reference.kind === CONFIG_REFERENCE.Node) {
      groups.set(reference.section, [...(groups.get(reference.section) ?? []), reference.name]);
    }
  }

  return [...groups].map(([section, names]) => ({ section, names }));
}
