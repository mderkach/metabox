import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';

import {
  readRules,
  readRuleSetTags,
  toFinalOutbound,
  toOutboundTags,
  toOutboundTypes,
  useConfigDocument,
  type ConfigDocumentView,
  type ConfigIssue,
} from '@entities/Config';
import { useRuleHits } from '@entities/Route';
import {
  filterRules,
  toAppliedIndices,
  toRuleRowsFromNodes,
  toTargetFilter,
  toTargetGroups,
  toTargetParam,
  type NewRulePlace,
  type RuleRow,
  type RuleSearch,
  type RuleSetFilter,
  type RuleTargetFilter,
  type RuleTargetGroup,
} from '@entities/Rule';
import { RULE_HITS_STATE, type RuleHitsColumn } from '@widgets/Rule/RuleTable';

export interface RouteEditorState {
  /** Config request: a source failure is a screen state of its own, not an empty list. */
  source: ConfigDocumentView['query'];
  issues: ConfigIssue[];
  rules: RuleRow[];
  outbounds: string[];
  /** Rule set tags of the document: a rule can reference them from the form. */
  ruleSets: string[];
  /** Outbound of a new rule is the default route; `null` means there is no outbound. */
  finalOutbound: string | null;
  /** Outbound type by tag: a rule's outbound is colored by it, not by name. */
  outboundTypes: ReadonlyMap<string, string>;
  /** Rule nodes as they are: the panel edits the node text, not the parsed model. */
  nodes: unknown[];
  /** Rule nodes of the file from the device, without draft edits. */
  appliedNodes: unknown[];
}

/**
 * Rule list for the screen. The section document is read by a shared hook, only its
 * parsing into rows stays here.
 *
 * The mapping is called here, not in the markup: it walks the whole list, and with
 * 500 rules it would repeat on every keystroke in the search.
 */
export function useRouteEditor(): RouteEditorState {
  const document = useConfigDocument();
  const text = document.text;

  // Nodes are read from the text, not from the parsed model: a rule that the
  // schema did not accept must stay visible in the list.
  const nodes = useMemo(() => (text === null ? [] : readRules(text)), [text]);

  const rules = useMemo(() => toRuleRowsFromNodes(nodes), [nodes]);
  const ruleSets = useMemo(() => (text === null ? [] : readRuleSetTags(text)), [text]);

  const config = document.config;
  const outboundTypes = useMemo(() => toOutboundTypes(config), [config]);

  const appliedText = document.appliedText;
  const appliedNodes = useMemo(() => (appliedText === null ? [] : readRules(appliedText)), [appliedText]);

  return {
    source: document.query,
    issues: document.issues,
    rules,
    outbounds: toOutboundTags(config),
    ruleSets,
    finalOutbound: toFinalOutbound(config),
    outboundTypes,
    nodes,
    appliedNodes,
  };
}

export interface RuleMarks {
  /** Rows absent from the applied config: new and changed in the draft. */
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
  const { rules, nodes, appliedNodes } = editor;

  const applied = useMemo(() => toAppliedIndices(nodes, appliedNodes), [nodes, appliedNodes]);

  const edited = useMemo(
    () => new Set(rules.filter((_rule, position) => applied[position] === null).map((rule) => rule.id)),
    [rules, applied]
  );

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

/**
 * List row by the rule number from the address.
 *
 * The address uses the interface numbering, from one, while a row is addressed by the index of the
 * `route.rules` node, counting from zero: the connections screen leads here to a specific
 * node, and an off-by-one miss would open the neighboring rule.
 */
export function toSelectedRuleId(rule: number | undefined): string | null {
  return rule === undefined ? null : toRuleId(rule);
}

/** List row by rule number counted from one: its `id` is the node index counted from zero. */
function toRuleId(index: number): string {
  return String(index - 1);
}

interface RuleSelectionState {
  /** Selected row; `null` means the panel is closed. */
  id: string | null;
  /**
   * Panel key. Grows when the user selects a rule or adds a
   * new one, and stays in place on reorder: the panel remains the same, with
   * its open tab, entered text and focus, even though the rule moved
   * to another number. Not reset on close: the sheet on a narrow screen keeps
   * its previous content, and a matching key would not recreate it for another
   * rule.
   */
  key: number;
  /** A new rule being filled in: it is not in the document until its first condition. */
  pending: NewRulePlace | null;
  /**
   * The rule just created: the panel shows it until the parsed list catches up, a frame later.
   * Cleared once the list has it, so a rule gone from the document later closes the panel.
   */
  created: RuleRow | null;
}

export interface RuleSelection extends RuleSelectionState {
  /** Selection by a list row; selecting the same row again closes the panel. */
  select: (id: string) => void;
  close: () => void;
  /** A new rule opens in the panel without being written. */
  startAdding: (place: NewRulePlace) => void;
  /** The new rule was written at `index`: the same panel goes on with it, without a remount. */
  onCreated: (index: number, node: unknown) => void;
  /** The panel follows the moved rule to its new number. */
  onMoved: (index: number) => void;
  onDeleted: () => void;
}

/**
 * Selected rule and the key of its panel.
 *
 * A row is addressed by position in `route.rules`, not by an identifier of its own
 * — sing-box rules have none — so reorder and delete must
 * shift the selection in the same update as the draft. They go without
 * `startTransition`: the store updates synchronously, and inside a Transition there would be a frame
 * where the selection points to the old position while a neighboring node is already under it, and the panel
 * would show someone else's rule.
 */
export function useRuleSelection(initialId: string | null, rules: readonly RuleRow[]): RuleSelection {
  const [selection, setSelection] = useState<RuleSelectionState>({
    id: initialId,
    key: 0,
    pending: null,
    created: null,
  });

  const { created } = selection;

  if (created !== null && rules.some((row) => row.id === created.id)) {
    setSelection({ ...selection, created: null });
  }

  const select = useCallback((id: string) => {
    setSelection((current) =>
      current.id === id
        ? { ...current, id: null, pending: null, created: null }
        : { id, key: current.key + 1, pending: null, created: null }
    );
  }, []);

  const close = useCallback(() => {
    setSelection((current) => ({ ...current, id: null, pending: null, created: null }));
  }, []);

  const startAdding = useCallback((place: NewRulePlace) => {
    setSelection((current) => ({ id: null, key: current.key + 1, pending: place, created: null }));
  }, []);

  const onCreated = useCallback((index: number, node: unknown) => {
    const row = toRuleRowsFromNodes([node]).at(0);
    const created = row === undefined ? null : { ...row, id: toRuleId(index), index };

    setSelection((current) => ({ ...current, id: toRuleId(index), pending: null, created }));
  }, []);

  const onMoved = useCallback((index: number) => {
    setSelection((current) => ({ ...current, id: toRuleId(index) }));
  }, []);

  const onDeleted = useCallback(() => {
    setSelection((current) => ({ ...current, id: null, pending: null, created: null }));
  }, []);

  return { ...selection, select, close, startAdding, onCreated, onMoved, onDeleted };
}

export interface RuleFilterState {
  query: string;
  setQuery: (query: string) => void;
  /** Selected outbounds and actions, from the address. */
  target: RuleTargetFilter;
  setTarget: (target: RuleTargetFilter) => void;
  /** Rule set from the address: arrives with a visit from the rule set catalog. */
  ruleSet: RuleSetFilter;
  setRuleSet: (ruleSet: RuleSetFilter) => void;
  /** Clear the search and both filters: show the whole list. */
  reset: () => void;
  /** Outbounds of the whole list, counted with the search and the rule set but without their own selection. */
  targets: RuleTargetGroup[];
  rules: RuleRow[];
}

/**
 * Search and filtering by outbound and rule set. Filtering is client-side: the whole config is already in
 * the panel, and up to 500 rules are filtered in fractions of a millisecond.
 *
 * Outbounds and the rule set live in the address — a link to a filtered list can be shared, and the rule set
 * catalog leads to its rules — while the search remains screen state.
 */
export function useRuleFilter(rules: RuleRow[]): RuleFilterState {
  const [query, setQuery] = useState('');
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const ruleSet = search.rule_set ?? null;
  // The address serves values with structural sharing: the reference stands while the selection does not
  // change, and the filter is not recomputed on every render.
  const targetParam = search.target;
  const target = useMemo(() => toTargetFilter(targetParam), [targetParam]);

  // A changed filter replaces the address instead of adding a history entry: "back"
  // would bring back the filter the user just cleared.
  const patchSearch = useCallback(
    (patch: Pick<RuleSearch, 'rule_set' | 'target'>) => {
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );

  const setRuleSet = useCallback(
    (next: RuleSetFilter) => {
      patchSearch({ rule_set: next ?? undefined });
    },
    [patchSearch]
  );

  const setTarget = useCallback(
    (next: RuleTargetFilter) => {
      patchSearch({ target: toTargetParam(next) });
    },
    [patchSearch]
  );

  const reset = useCallback(() => {
    setQuery('');

    if (ruleSet !== null || target.length > 0) {
      patchSearch({ rule_set: undefined, target: undefined });
    }
  }, [patchSearch, ruleSet, target]);

  const unselected = useMemo(() => filterRules(rules, query, [], ruleSet), [rules, query, ruleSet]);
  const targets = useMemo(() => toTargetGroups(rules, unselected), [rules, unselected]);
  const shown = useMemo(() => filterRules(unselected, '', target), [unselected, target]);

  return {
    query,
    setQuery,
    target,
    setTarget,
    ruleSet,
    setRuleSet,
    reset,
    targets,
    rules: shown,
  };
}
