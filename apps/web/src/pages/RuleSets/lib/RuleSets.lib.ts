import { useCallback, useMemo, useState } from 'react';

import {
  hasRuleSetCache,
  readRules,
  readRuleSets,
  toOutboundTags,
  useConfigDocument,
  type ConfigDocumentView,
} from '@entities/Config';
import {
  countRuleSetUsage,
  filterRuleSets,
  RULE_SET_TYPE,
  toRuleSetRowsFromNodes,
  useRuleSetCatalog,
  type RuleSetCatalog,
  type RuleSetRow,
} from '@entities/RuleSet';

const EMPTY_CATALOG: RuleSetCatalog = { providers: [] };

export interface RuleSetEditorState {
  /** Config request: a source failure is a screen state of its own, not an empty list. */
  source: ConfigDocumentView['query'];
  /** Catalog request: without it rows do not know the provider, and the form does not know the categories. */
  catalogQuery: ReturnType<typeof useRuleSetCatalog>;
  catalog: RuleSetCatalog;
  sets: RuleSetRow[];
  /** `route.rule_set` nodes as they are: editing a rule set compares the typed input against them. */
  nodes: unknown[];
  /** Names of rule sets already attached: a second rule set with the same name is not created. */
  takenTags: string[];
  /** Outbound tags: a rule set can be downloaded through one of them. */
  outbounds: string[];
  /** The rule set cache is off, and the config has remote rule sets. */
  needsCache: boolean;
}

/**
 * Rule set list for the screen. The section document is read by a shared hook, only its
 * parsing into rows stays here.
 *
 * Nodes are read from the text, not from the parsed model: a rule set that the schema did not
 * accept must stay visible — otherwise the user would not find exactly the one
 * that needs fixing.
 */
export function useRuleSetEditor(): RuleSetEditorState {
  const document = useConfigDocument();
  const catalogQuery = useRuleSetCatalog();
  const catalog = catalogQuery.data ?? EMPTY_CATALOG;
  const text = document.text;

  const nodes = useMemo(() => (text === null ? [] : readRuleSets(text)), [text]);

  // References are counted over the same rule nodes that the neighboring tab shows:
  // a rule that references a rule set from inside a logical group references it
  // at least as much as a direct one.
  const usage = useMemo(() => countRuleSetUsage(text === null ? [] : readRules(text)), [text]);

  const sets = useMemo(() => toRuleSetRowsFromNodes(nodes, usage, catalog), [nodes, usage, catalog]);

  const needsCache = useMemo(() => {
    if (text === null) {
      return false;
    }

    return sets.some((set) => set.type === RULE_SET_TYPE.Remote) && !hasRuleSetCache(text);
  }, [sets, text]);

  return {
    source: document.query,
    catalogQuery,
    catalog,
    sets,
    nodes,
    takenTags: sets.map((set) => set.tag).filter((tag) => tag !== ''),
    outbounds: toOutboundTags(document.config),
    needsCache,
  };
}

export interface RuleSetFilterState {
  query: string;
  setQuery: (query: string) => void;
  reset: () => void;
  sets: RuleSetRow[];
}

/**
 * Search over attached rule sets. Filtering is client-side: the whole config is already in the panel,
 * and there are tens of rule sets in it.
 */
export function useRuleSetFilter(sets: RuleSetRow[]): RuleSetFilterState {
  const [query, setQuery] = useState('');

  const shown = useMemo(() => filterRuleSets(sets, query), [sets, query]);

  const reset = useCallback(() => {
    setQuery('');
  }, []);

  return { query, setQuery, reset, sets: shown };
}

/** Which form is open in the rule set panel. */
export const RULE_SET_FORM = {
  Catalog: 'catalog',
  Custom: 'custom',
  Edit: 'edit',
} as const;

export type RuleSetForm = (typeof RULE_SET_FORM)[keyof typeof RULE_SET_FORM];

export interface RuleSetPanelState {
  /** `null` means the panel is closed. */
  form: RuleSetForm | null;
  /**
   * Last open form: the sheet slides away with an animation after closing and shows it
   * all that time, not emptiness.
   */
  shown: RuleSetForm;
  /** Position of the rule set open for editing; kept after closing, like `shown`. */
  editing: number | null;
  /** A toolbar button opens its own form, and a repeated press closes it. */
  toggle: (form: RuleSetForm) => void;
  /** Opens editing of a rule set by its position in `route.rule_set`. */
  edit: (index: number) => void;
  close: () => void;
}

/** Form in the rule set panel. */
export function useRuleSetPanel(): RuleSetPanelState {
  const [form, setForm] = useState<RuleSetForm | null>(null);
  const [shown, setShown] = useState<RuleSetForm>(RULE_SET_FORM.Catalog);
  const [editing, setEditing] = useState<number | null>(null);

  if (form !== null && form !== shown) {
    setShown(form);
  }

  const toggle = useCallback((next: RuleSetForm) => {
    setForm((current) => (current === next ? null : next));
  }, []);

  const edit = useCallback((index: number) => {
    setEditing(index);
    setForm(RULE_SET_FORM.Edit);
  }, []);

  const close = useCallback(() => {
    setForm(null);
  }, []);

  return { form, shown, editing, toggle, edit, close };
}
