import { RuleSchema, type Config } from '@shared/api/generated';

import { RULE_ACTION_FIELDS, RULE_MATCHER_KEYS } from './Rule.constants';
import { RULE_TARGET, type RuleBranch, type RuleGroup, type RuleMatcher, type RuleRow } from './Rule.model';

/** Действие по умолчанию: правило без `action` маршрутизирует. */
const DEFAULT_ACTION = 'route';

/** Значение ветки union у логического правила. */
const LOGICAL_TYPE = 'logical';

function toValues(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }

  return [String(raw)];
}

function toMatchers(rule: object): RuleMatcher[] {
  const matchers: RuleMatcher[] = [];

  for (const key of RULE_MATCHER_KEYS) {
    const raw: unknown = Reflect.get(rule, key);

    if (raw === undefined || raw === null) {
      continue;
    }

    matchers.push({ key, values: toValues(raw) });
  }

  return matchers;
}

function isLogical(rule: object): boolean {
  return Reflect.get(rule, 'type') === LOGICAL_TYPE;
}

/**
 * Условия логического правила лежат во вложенных `rules`, а не в самом
 * правиле. Без разбора вложенности такое правило выглядело бы как правило без
 * условий, то есть как перехватывающее весь трафик, — и пользователь решил бы,
 * что всё, что ниже, не выполняется.
 */
function toGroup(rule: object): RuleGroup | null {
  if (!isLogical(rule)) {
    return null;
  }

  const nested: unknown = Reflect.get(rule, 'rules');
  const children: RuleBranch[] = Array.isArray(nested)
    ? nested.filter((child): child is object => typeof child === 'object' && child !== null).map(toBranch)
    : [];

  return {
    mode: String(Reflect.get(rule, 'mode') ?? 'and'),
    invert: Reflect.get(rule, 'invert') === true,
    children,
  };
}

function toBranch(rule: object): RuleBranch {
  return { matchers: toMatchers(rule), group: toGroup(rule) };
}

function toTarget(rule: object): Pick<RuleRow, 'target' | 'targetKind'> {
  const outbound: unknown = Reflect.get(rule, 'outbound');

  if (typeof outbound === 'string' && outbound.length > 0) {
    return { target: outbound, targetKind: RULE_TARGET.Outbound };
  }

  const action: unknown = Reflect.get(rule, 'action');

  return {
    target: typeof action === 'string' ? action : DEFAULT_ACTION,
    targetKind: RULE_TARGET.Action,
  };
}

function toTargetDetail(rule: object, target: string): string | null {
  const fields = RULE_ACTION_FIELDS[target];

  if (fields === undefined) {
    return null;
  }

  const parts: string[] = [];

  for (const field of fields) {
    const raw: unknown = Reflect.get(rule, field);

    if (raw !== undefined && raw !== null) {
      parts.push(`${field}: ${toValues(raw).join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function toSearchText(branch: RuleBranch): string[] {
  const own = branch.matchers.flatMap((matcher) => [matcher.key, ...matcher.values]);
  const nested = branch.group?.children.flatMap(toSearchText) ?? [];

  return [...own, ...nested];
}

/**
 * Разворачивает `route.rules` в плоские строки списка.
 *
 * Порядок сохраняется дословно: в sing-box он и есть логика — срабатывает
 * первое подходящее правило, а не самое точное.
 */
export function toRuleRows(config: Config | null): RuleRow[] {
  return toRuleRowsFromNodes(config?.route?.rules ?? []);
}

/**
 * То же по узлам, прочитанным из текста файла.
 *
 * Экран правил обязан открываться и тогда, когда схема не приняла конфиг
 * целиком: одно незнакомое правило иначе спрятало бы весь список, а
 * пользователю нужно как раз найти это правило (UX-3, AC-25).
 */
export function toRuleRowsFromNodes(nodes: readonly unknown[]): RuleRow[] {
  const rows: RuleRow[] = [];

  for (const [position, node] of nodes.entries()) {
    // Позиция берётся в исходном массиве, а не в отфильтрованном: по ней
    // правка адресует узел в файле (`route.rules[index - 1]`), и пропущенный
    // не-объект сдвинул бы все следующие правки на чужие узлы.
    if (typeof node !== 'object' || node === null) {
      continue;
    }

    const branch = toBranch(node);
    const target = toTarget(node);

    rows.push({
      id: String(position),
      index: position + 1,
      matchers: branch.matchers,
      group: branch.group,
      invert: Reflect.get(node, 'invert') === true,
      targetDetail: toTargetDetail(node, target.target),
      isCatchAll: branch.matchers.length === 0 && branch.group === null,
      searchText: [...toSearchText(branch), target.target].join(' '),
      ...target,
    });
  }

  return rows;
}

/** Узел принят схемой форка: для него есть форма, а не только текстовый режим. */
export function isRuleRecognized(node: unknown): boolean {
  return RuleSchema.safeParse(node).success;
}

/**
 * Замечания схемы к узлу правила; пусто — узел принят.
 *
 * Замечание не запрещает запись: арбитр валидности — `sing-box check` на
 * устройстве, а не схема панели (UX-4). Иначе узел, которого схема не знает,
 * нельзя было бы ни поправить, ни сохранить, — а именно текстом его и правят
 * (AC-25).
 */
export function checkRuleNode(node: unknown): string[] {
  const checked = RuleSchema.safeParse(node);

  if (checked.success) {
    return [];
  }

  return checked.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}
