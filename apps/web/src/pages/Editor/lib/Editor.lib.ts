import { useMemo, useState } from 'react';

import { readRules, toOutboundTags, useConfigDocument } from '@entities/Config';
import {
  filterRules,
  toRuleRowsFromNodes,
  toTargetGroups,
  type RuleRow,
  type RuleTargetFilter,
  type RuleTargetGroup,
} from '@entities/Rule';

export interface RouteEditorState {
  isPending: boolean;
  issues: string[];
  rules: RuleRow[];
  outbounds: string[];
  /** Узлы правил как есть: панель правит текст узла, а не разобранную модель. */
  nodes: unknown[];
}

/**
 * Список правил для экрана. Документ раздела читает общий хук, здесь остаётся
 * только его разбор в строки.
 *
 * Маппинг вызывается здесь, а не в разметке: он пробегает весь список, и на
 * 500 правилах повторялся бы на каждое нажатие клавиши в поиске.
 */
export function useRouteEditor(): RouteEditorState {
  const document = useConfigDocument();
  const text = document.text;

  // Узлы читаются из текста, а не из разобранной модели: правило, которое
  // схема не приняла, обязано остаться видимым в списке.
  const nodes = useMemo(() => (text === null ? [] : readRules(text)), [text]);

  const rules = useMemo(() => toRuleRowsFromNodes(nodes), [nodes]);

  return {
    isPending: document.isPending,
    issues: document.issues,
    rules,
    outbounds: toOutboundTags(document.config),
    nodes,
  };
}

/**
 * Строка списка по номеру правила из адреса.
 *
 * В адресе номер как в интерфейсе, с единицы, а строка адресуется индексом
 * узла `route.rules`, считая с нуля: экран соединений ведёт сюда на конкретный
 * узел, и промах на единицу открыл бы соседнее правило (ADR-0007).
 */
export function toSelectedRuleId(rule: number | undefined): string | null {
  return rule === undefined ? null : String(rule - 1);
}

export interface RuleFilterState {
  query: string;
  setQuery: (query: string) => void;
  target: RuleTargetFilter;
  setTarget: (target: RuleTargetFilter) => void;
  /** Исходы считаются по всему списку: фасет не должен исчезать от своего выбора. */
  targets: RuleTargetGroup[];
  rules: RuleRow[];
}

/**
 * Поиск и отбор по исходу. Отбор клиентский: конфиг целиком уже в панели, и
 * до 500 правил фильтруются за доли миллисекунды.
 */
export function useRuleFilter(rules: RuleRow[]): RuleFilterState {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<RuleTargetFilter>(null);

  const targets = useMemo(() => toTargetGroups(rules), [rules]);
  const shown = useMemo(() => filterRules(rules, query, target), [rules, query, target]);

  return {
    query,
    setQuery,
    target,
    setTarget,
    targets,
    rules: shown,
  };
}
