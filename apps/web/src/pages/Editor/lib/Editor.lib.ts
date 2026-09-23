import { useMemo, useState } from 'react';

import { readRules, toOutboundTags, useConfigDocument, type ConfigDocumentView } from '@entities/Config';
import { useRuleHits } from '@entities/Route';
import {
  filterRules,
  toAppliedIndices,
  toRuleRowsFromNodes,
  toTargetGroups,
  type RuleRow,
  type RuleTargetFilter,
  type RuleTargetGroup,
} from '@entities/Rule';
import { RULE_HITS_STATE, type RuleHitsColumn } from '@widgets/Rule/RuleTable';

export interface RouteEditorState {
  /** Запрос конфига: отказ источника — своё состояние экрана, а не пустой список. */
  source: ConfigDocumentView['query'];
  issues: string[];
  rules: RuleRow[];
  outbounds: string[];
  /** Узлы правил как есть: панель правит текст узла, а не разобранную модель. */
  nodes: unknown[];
  /** Узлы правил файла с устройства, без правок черновика. */
  appliedNodes: unknown[];
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

  const appliedText = document.appliedText;
  const appliedNodes = useMemo(() => (appliedText === null ? [] : readRules(appliedText)), [appliedText]);

  return {
    source: document.query,
    issues: document.issues,
    rules,
    outbounds: toOutboundTags(document.config),
    nodes,
    appliedNodes,
  };
}

export interface RuleMarks {
  /** Строки, которых в применённом конфиге нет: новые и изменённые в черновике. */
  edited: ReadonlySet<string>;
  hits: RuleHitsColumn;
}

/**
 * Отметки строк по применённому конфигу: что изменено в черновике и сколько
 * раз сработало. Счёт демон ведёт по правилам работающего процесса, поэтому
 * строка получает его через своё правило в применённом файле, а не по номеру.
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

    // Список правил процесса другой длины — процесс работает не на файле с
    // устройства, и его номера к строкам не относятся (ADR-0007).
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
