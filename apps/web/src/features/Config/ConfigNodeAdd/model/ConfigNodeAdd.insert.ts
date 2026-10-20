import { ConfigDocumentState, readSectionNodes, sectionNodePath, type GenericSection } from '@entities/Config';

/**
 * Inserts a new node at the end of the section. The position is taken from the
 * text at the moment of writing, and an array missing from the file is created
 * by the insert.
 */
export function useNodeInsert(section: GenericSection): (node: object) => void {
  const insert = ConfigDocumentState.use.insert();

  return function insertNode(node) {
    const count = readSectionNodes(ConfigDocumentState.getState().current() ?? '{}', section).length;

    insert(sectionNodePath(section, count), node);
  };
}
