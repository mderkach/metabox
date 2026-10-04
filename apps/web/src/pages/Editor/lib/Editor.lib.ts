import { useNavigate, useSearch } from '@tanstack/react-router';
import { startTransition, useCallback, useMemo, useState } from 'react';

import {
  readRules,
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
  toTargetGroups,
  type RuleRow,
  type RuleSetFilter,
  type RuleTargetFilter,
  type RuleTargetGroup,
} from '@entities/Rule';
import { RULE_HITS_STATE, type RuleHitsColumn } from '@widgets/Rule/RuleTable';

export interface RouteEditorState {
  /** Запрос конфига: отказ источника — своё состояние экрана, а не пустой список. */
  source: ConfigDocumentView['query'];
  issues: ConfigIssue[];
  rules: RuleRow[];
  outbounds: string[];
  /** Выход нового правила — маршрут по умолчанию; `null` — выхода нет. */
  finalOutbound: string | null;
  /** Тип аутбаунда по тегу: выход правила красится по нему, а не по имени. */
  outboundTypes: ReadonlyMap<string, string>;
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

  const config = document.config;
  const outboundTypes = useMemo(() => toOutboundTypes(config), [config]);

  const appliedText = document.appliedText;
  const appliedNodes = useMemo(() => (appliedText === null ? [] : readRules(appliedText)), [appliedText]);

  return {
    source: document.query,
    issues: document.issues,
    rules,
    outbounds: toOutboundTags(config),
    finalOutbound: toFinalOutbound(config),
    outboundTypes,
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
    // устройства, и его номера к строкам не относятся.
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
 * узел, и промах на единицу открыл бы соседнее правило.
 */
export function toSelectedRuleId(rule: number | undefined): string | null {
  return rule === undefined ? null : toRuleId(rule);
}

/** Строка списка по номеру правила с единицы: её `id` — индекс узла с нуля. */
function toRuleId(index: number): string {
  return String(index - 1);
}

interface RuleSelectionState {
  /** Выбранная строка; `null` — панель закрыта. */
  id: string | null;
  /**
   * Ключ панели. Растёт, когда пользователь выбирает правило или добавляет
   * новое, и стоит на месте при перестановке: панель остаётся той же — с
   * открытой вкладкой, введённым текстом и фокусом, — хотя правило переехало
   * на другой номер. При закрытии не сбрасывается: лист на узком экране держит
   * прежнее содержимое, и совпавший ключ не пересоздал бы его для другого
   * правила.
   */
  key: number;
}

export interface RuleSelection extends RuleSelectionState {
  /** Выбор строкой списка; повторный выбор той же строки закрывает панель. */
  select: (id: string) => void;
  close: () => void;
  /** Новое правило открывается в панели. */
  onAdded: (index: number) => void;
  /** Панель идёт за переставленным правилом на его новый номер. */
  onMoved: (index: number) => void;
  onDeleted: () => void;
}

/**
 * Выбранное правило и ключ его панели.
 *
 * Строка адресуется позицией в `route.rules`, а не собственным идентификатором
 * — его у правил sing-box нет, — поэтому перестановка и удаление обязаны
 * сдвигать выбор тем же обновлением, что и черновик. Они идут без
 * `startTransition`: стор обновляется синхронно, и в Transition был бы кадр,
 * где выбор указывает на прежнюю позицию, а под ней уже соседний узел — панель
 * показала бы чужое правило.
 */
export function useRuleSelection(initialId: string | null): RuleSelection {
  const [selection, setSelection] = useState<RuleSelectionState>({ id: initialId, key: 0 });

  // Без Transition обновление срочное, и граница вокруг панели не анимируется.
  const select = useCallback((id: string) => {
    startTransition(() => {
      setSelection((current) => (current.id === id ? { ...current, id: null } : { id, key: current.key + 1 }));
    });
  }, []);

  const close = useCallback(() => {
    startTransition(() => {
      setSelection((current) => ({ ...current, id: null }));
    });
  }, []);

  // Новое правило встаёт в конец и номера остальных не сдвигает: прежний выбор
  // остаётся верным, пока Transition не закончится.
  const onAdded = useCallback((index: number) => {
    startTransition(() => {
      setSelection((current) => ({ id: toRuleId(index), key: current.key + 1 }));
    });
  }, []);

  const onMoved = useCallback((index: number) => {
    setSelection((current) => ({ ...current, id: toRuleId(index) }));
  }, []);

  const onDeleted = useCallback(() => {
    setSelection((current) => ({ ...current, id: null }));
  }, []);

  return { ...selection, select, close, onAdded, onMoved, onDeleted };
}

export interface RuleFilterState {
  query: string;
  setQuery: (query: string) => void;
  target: RuleTargetFilter;
  setTarget: (target: RuleTargetFilter) => void;
  /** Сет из адреса: с ним приходят из каталога наборов. */
  ruleSet: RuleSetFilter;
  setRuleSet: (ruleSet: RuleSetFilter) => void;
  /** Снять поиск и оба отбора: показать список целиком. */
  reset: () => void;
  /** Выходы считаются по всему списку: фасет не должен исчезать от своего выбора. */
  targets: RuleTargetGroup[];
  rules: RuleRow[];
}

/**
 * Поиск и отбор по выходу и сету. Отбор клиентский: конфиг целиком уже в
 * панели, и до 500 правил фильтруются за доли миллисекунды.
 *
 * Сет живёт в адресе — на него ведёт ссылка из каталога наборов, — а поиск и
 * выход остаются состоянием экрана.
 */
export function useRuleFilter(rules: RuleRow[]): RuleFilterState {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<RuleTargetFilter>(null);
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const ruleSet = search.rule_set ?? null;

  // Снятый отбор заменяет адрес, а не добавляет запись в историю: «назад»
  // вернул бы отбор, который пользователь только что снял.
  const setRuleSet = useCallback(
    (next: RuleSetFilter) => {
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, rule_set: next ?? undefined }),
        replace: true,
      });
    },
    [navigate]
  );

  const reset = useCallback(() => {
    setQuery('');
    setTarget(null);

    if (ruleSet !== null) {
      setRuleSet(null);
    }
  }, [ruleSet, setRuleSet]);

  const targets = useMemo(() => toTargetGroups(rules), [rules]);
  const shown = useMemo(() => filterRules(rules, query, target, ruleSet), [rules, query, target, ruleSet]);

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
