import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ConfigDocumentState,
  hasRuleSetCache,
  parseConfig,
  readRules,
  readRuleSets,
  toOutboundTags,
  useConfig,
  useConfigDirty,
  useConfigText,
  type ConfigDocument,
} from '@entities/Config';
import {
  countRuleSetUsage,
  filterRuleSets,
  RULE_SET_TYPE,
  toRuleSetRowsFromNodes,
  type RuleSetRow,
} from '@entities/RuleSet';

export interface RuleSetEditorState {
  isPending: boolean;
  config: ConfigDocument | null;
  sets: RuleSetRow[];
  /** Имена уже подключённых наборов: второй набор с тем же именем не заводится. */
  takenTags: string[];
  /** Теги аутбаундов: через один из них набор можно качать. */
  outbounds: string[];
  /** Кэш наборов выключен, а удалённые наборы в конфиге есть. */
  needsCache: boolean;
  isDirty: boolean;
}

/**
 * Связывает запрос конфига, документ и список наборов для экрана.
 *
 * Узлы читаются из текста, а не из разобранной модели: набор, который схема не
 * приняла, обязан остаться видимым — иначе пользователь не найдёт как раз тот,
 * который надо чинить.
 */
export function useRuleSetEditor(): RuleSetEditorState {
  const config = useConfig();
  const load = ConfigDocumentState.use.load();
  const draft = ConfigDocumentState.use.draft();
  const isDirty = useConfigDirty();
  const text = config.data?.text ?? null;

  useEffect(
    function loadDocument() {
      if (text !== null) load(text);
    },
    [text, load]
  );

  const shownText = useConfigText() ?? text;

  const edited = useMemo(() => (draft === null ? null : parseConfig(draft)), [draft]);
  const document = edited?.config ?? config.data?.config ?? null;

  const nodes = useMemo(() => (shownText === null ? [] : readRuleSets(shownText)), [shownText]);

  // Ссылки считаются по тем же узлам правил, что показывает соседняя вкладка:
  // правило, сославшееся на набор изнутри логической группы, ссылается на него
  // не меньше прямого.
  const usage = useMemo(() => countRuleSetUsage(shownText === null ? [] : readRules(shownText)), [shownText]);

  const sets = useMemo(() => toRuleSetRowsFromNodes(nodes, usage), [nodes, usage]);

  const needsCache = useMemo(() => {
    if (shownText === null) {
      return false;
    }

    return sets.some((set) => set.type === RULE_SET_TYPE.Remote) && !hasRuleSetCache(shownText);
  }, [sets, shownText]);

  return {
    isPending: config.isPending,
    config: document,
    sets,
    takenTags: sets.map((set) => set.tag).filter((tag) => tag !== ''),
    outbounds: toOutboundTags(document),
    needsCache,
    isDirty,
  };
}

export interface RuleSetFilterState {
  query: string;
  setQuery: (query: string) => void;
  reset: () => void;
  sets: RuleSetRow[];
}

/**
 * Поиск по подключённым наборам. Отбор клиентский: конфиг целиком уже в панели,
 * и наборов в нём десятки.
 */
export function useRuleSetFilter(sets: RuleSetRow[]): RuleSetFilterState {
  const [query, setQuery] = useState('');

  const shown = useMemo(() => filterRuleSets(sets, query), [sets, query]);

  const reset = useCallback(() => {
    setQuery('');
  }, []);

  return { query, setQuery, reset, sets: shown };
}
