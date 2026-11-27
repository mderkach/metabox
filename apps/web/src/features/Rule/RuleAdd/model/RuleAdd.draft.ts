import { useRef } from 'react';

import {
  ConfigDocumentStore,
  insertValue,
  nameValue,
  readRuleNames,
  ruleNodePath,
  selectConfigCurrent,
  setValue,
  toElementName,
} from '@entities/Config';
import type { NewRulePlace } from '@entities/Rule';
import { showQueryError } from '@shared/api';

export function useCreateRule(
  place: NewRulePlace | null,
  onCreated: (index: number, node: unknown) => void
): ((node: Record<string, unknown>, name: string) => boolean) | undefined {
  const written = useRef<{ place: NewRulePlace; text: string } | null>(null);
  if (place === null) return undefined;

  return (node, name) => {
    const document = ConfigDocumentStore.getState();
    const text = selectConfigCurrent(document);
    const previous = written.current?.place === place ? written.current : null;
    if (text === null || (previous !== null && previous.text !== text)) return reportInsertFailure();

    const path = ruleNodePath(place.index);
    // A callback can still be running against the pending form after its first insertion.
    const inserted = previous === null ? insertValue(text, path, node) : setValue(text, path, node);
    if (inserted === null) return reportInsertFailure();

    const previousName = previous === null ? '' : (readRuleNames(text).at(place.index - 1) ?? '');
    const named = toElementName(name) === previousName ? inserted : nameValue(inserted, path, name);
    const next = named ?? inserted;
    written.current = { place, text: next };
    if (next !== text) document.replace(next);
    if (named === null) showQueryError({ showError: true, errorMessageKey: 'toast.rule.rename.failed' }, null);
    if (previous === null) onCreated(place.index, node);
    return true;
  };
}

function reportInsertFailure(): false {
  showQueryError({ showError: true, errorMessageKey: 'toast.config.edit.failed' }, null);
  return false;
}
