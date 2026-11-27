import { useMemo } from 'react';

import { useRuleHits } from '@entities/Route';
import { toAppliedIndices, toEditedRuleIds } from '@entities/Rule';
import { RULE_HITS_STATE, type RuleHitsColumn } from '@widgets/Rule/RuleTable';

import type { RouteEditorState } from './Editor.document';

export interface RuleMarks {
  /** Rows absent from the applied config (new and changed in the draft) and renamed ones. */
  edited: ReadonlySet<string>;
  hits: RuleHitsColumn;
}

/**
 * Row marks against the applied config: what is changed in the draft and how many
 * times it hit. The daemon counts by the rules of the running process, so a
 * row gets the count through its rule in the applied file, not by number.
 */
export function useRuleMarks(editor: RouteEditorState): RuleMarks {
  const hits = useRuleHits();
  const { rules, nodes, appliedNodes, appliedNames } = editor;

  const applied = useMemo(() => toAppliedIndices(nodes, appliedNodes), [nodes, appliedNodes]);

  const edited = useMemo(() => toEditedRuleIds(rules, applied, appliedNames), [rules, applied, appliedNames]);

  const column = useMemo((): RuleHitsColumn => {
    if (hits.isPending) {
      return { state: RULE_HITS_STATE.Pending };
    }

    if (hits.isError) {
      return { state: RULE_HITS_STATE.Failed };
    }

    // The process rule list has a different length: the process does not run on the file from
    // the device, and its numbers do not map to the rows.
    if (hits.data.byIndex.length !== appliedNodes.length) {
      return { state: RULE_HITS_STATE.Mismatch };
    }

    const counts = new Map<string, number | null>();

    for (const [position, rule] of rules.entries()) {
      const index = applied[position];

      if (index !== null) {
        counts.set(rule.id, hits.data.byIndex[index]);
      }
    }

    return { state: RULE_HITS_STATE.Counted, seconds: hits.data.seconds, counts };
  }, [hits.isPending, hits.isError, hits.data, rules, applied, appliedNodes.length]);

  return { edited, hits: column };
}
