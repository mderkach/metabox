import { ConfigDocumentStore, readRuleSets, ruleSetNodePath, selectConfigCurrent } from '@entities/Config';
import { localListFile } from '@entities/RuleSet';

/** Notifies the caller after removing the node, before staging removal of its own list file. */
export function removeRuleSet(index: number, onNodeRemoved: () => void): boolean {
  const document = ConfigDocumentStore.getState();
  const file = localListFile(readRuleSets(selectConfigCurrent(document) ?? '')[index]);

  if (!document.remove(ruleSetNodePath(index))) return false;

  onNodeRemoved();
  if (file !== null) document.removeList(file);

  return true;
}
