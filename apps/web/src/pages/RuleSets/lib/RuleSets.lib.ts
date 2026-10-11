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
  /** Запрос конфига: отказ источника — своё состояние экрана, а не пустой список. */
  source: ConfigDocumentView['query'];
  /** Запрос каталога: без него строки не узнают поставщика, а форма — категорий. */
  catalogQuery: ReturnType<typeof useRuleSetCatalog>;
  catalog: RuleSetCatalog;
  sets: RuleSetRow[];
  /** Узлы `route.rule_set` как есть: правка сета сравнивает с ними набранное. */
  nodes: unknown[];
  /** Имена уже подключённых наборов: второй набор с тем же именем не заводится. */
  takenTags: string[];
  /** Теги аутбаундов: через один из них набор можно качать. */
  outbounds: string[];
  /** Кэш наборов выключен, а удалённые наборы в конфиге есть. */
  needsCache: boolean;
}

/**
 * Список наборов для экрана. Документ раздела читает общий хук, здесь остаётся
 * только его разбор в строки.
 *
 * Узлы читаются из текста, а не из разобранной модели: набор, который схема не
 * приняла, обязан остаться видимым — иначе пользователь не найдёт как раз тот,
 * который надо чинить.
 */
export function useRuleSetEditor(): RuleSetEditorState {
  const document = useConfigDocument();
  const catalogQuery = useRuleSetCatalog();
  const catalog = catalogQuery.data ?? EMPTY_CATALOG;
  const text = document.text;

  const nodes = useMemo(() => (text === null ? [] : readRuleSets(text)), [text]);

  // Ссылки считаются по тем же узлам правил, что показывает соседняя вкладка:
  // правило, сославшееся на набор изнутри логической группы, ссылается на него
  // не меньше прямого.
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

/** Какая форма открыта в панели сета. */
export const RULE_SET_FORM = {
  Catalog: 'catalog',
  Custom: 'custom',
  Edit: 'edit',
} as const;

export type RuleSetForm = (typeof RULE_SET_FORM)[keyof typeof RULE_SET_FORM];

export interface RuleSetPanelState {
  /** `null` — панель закрыта. */
  form: RuleSetForm | null;
  /**
   * Последняя открытая форма: лист уезжает анимацией уже после закрытия и всё
   * это время показывает её, а не пустоту.
   */
  shown: RuleSetForm;
  /** Позиция сета, открытого на правку; держится и после закрытия, как `shown`. */
  editing: number | null;
  /** Кнопка тулбара открывает свою форму, а повторное нажатие закрывает её. */
  toggle: (form: RuleSetForm) => void;
  /** Открывает правку сета по его позиции в `route.rule_set`. */
  edit: (index: number) => void;
  close: () => void;
}

/** Форма в панели сета. */
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
