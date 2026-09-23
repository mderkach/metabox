import { DIFF_KIND, diffLines } from '@shared/lib/diff';

import { toTarget } from './Rule.adapter';
import { RULE_ACTION_FIELDS } from './Rule.constants';

export const RULE_CHANGE = {
  Added: 'added',
  Removed: 'removed',
  Changed: 'changed',
  Target: 'target',
  Moved: 'moved',
} as const;

/**
 * Изменение правила маршрутизации. `index` — номер с единицы, как в списке
 * правил: у удалённого — в применённом конфиге, у остальных — в черновике.
 */
export type RuleChange =
  | { kind: typeof RULE_CHANGE.Added | typeof RULE_CHANGE.Removed | typeof RULE_CHANGE.Changed; index: number }
  /** Условия те же, сменилось, куда правило отправляет трафик: аутбаунд или действие. */
  | { kind: typeof RULE_CHANGE.Target; index: number; from: string; to: string }
  /** Узел не менялся, но стоит на другом месте — а порядок в sing-box и есть логика. */
  | { kind: typeof RULE_CHANGE.Moved; index: number; previous: number };

/** Поля аутбаунда и действия: без них от узла остаются условия. */
const TARGET_FIELDS = new Set([
  'outbound',
  'action',
  ...Object.values(RULE_ACTION_FIELDS).flatMap((fields) => fields ?? []),
]);

interface Side {
  index: number;
  node: unknown;
  key: string;
}

interface Block {
  removed: Side[];
  added: Side[];
}

function conditionsKey(node: unknown): string {
  if (typeof node !== 'object' || node === null) return JSON.stringify(node);

  return JSON.stringify(Object.entries(node).filter(([key]) => !TARGET_FIELDS.has(key)));
}

function targetOf(node: unknown): string | null {
  return typeof node === 'object' && node !== null ? toTarget(node).target : null;
}

function toPair(before: Side, after: Side): RuleChange {
  const from = targetOf(before.node);
  const to = targetOf(after.node);

  return from !== null && to !== null && from !== to
    ? { kind: RULE_CHANGE.Target, index: after.index, from, to }
    : { kind: RULE_CHANGE.Changed, index: after.index };
}

/**
 * Разбивает сравнение списков на куски подряд идущих отличий. Узел
 * сравнивается целиком, поэтому переставленное правило выглядит удалённым в
 * одном месте и добавленным в другом — это разбирает `toRuleChanges`.
 */
function toBlocks(applied: readonly unknown[], draft: readonly unknown[]): Block[] {
  const lines = diffLines(
    applied.map((node) => JSON.stringify(node)).join('\n'),
    draft.map((node) => JSON.stringify(node)).join('\n')
  );
  const blocks: Block[] = [];
  let open: Block | null = null;

  for (const line of lines) {
    if (line.kind === DIFF_KIND.Same) {
      open = null;

      continue;
    }

    if (open === null) {
      open = { removed: [], added: [] };
      blocks.push(open);
    }

    if (line.kind === DIFF_KIND.Removed && line.before !== null) {
      open.removed.push({ index: line.before, node: applied[line.before - 1], key: line.text });
    }

    if (line.kind === DIFF_KIND.Added && line.after !== null) {
      open.added.push({ index: line.after, node: draft[line.after - 1], key: line.text });
    }
  }

  return blocks;
}

/**
 * Что черновик меняет в `route.rules` по сравнению с применённым конфигом.
 * Изменения идут по порядку черновика, удалённые — в конце своего куска.
 *
 * Узел, который целиком нашёлся в другом месте списка, — перестановка. Пара
 * «удалено — добавлено» читается как правка одного правила: сначала сводятся
 * узлы с одинаковыми условиями — внутри куска отличий, затем по всему списку,
 * чтобы переставленное и поправленное правило не распалось на удаление и
 * добавление, — и только потом оставшиеся по порядку внутри куска.
 */
export function toRuleChanges(applied: readonly unknown[], draft: readonly unknown[]): RuleChange[] {
  // На пустом списке построчный диф увидел бы одну пустую строку.
  if (applied.length === 0) return draft.map((_, index) => ({ kind: RULE_CHANGE.Added, index: index + 1 }));

  if (draft.length === 0) return applied.map((_, index) => ({ kind: RULE_CHANGE.Removed, index: index + 1 }));

  const blocks = toBlocks(applied, draft);
  const loose = new Map<string, Side[]>();

  for (const side of blocks.flatMap((block) => block.removed)) {
    loose.set(side.key, [...(loose.get(side.key) ?? []), side]);
  }

  const moved = new Map<Side, Side>();

  for (const side of blocks.flatMap((block) => block.added)) {
    const origin = loose.get(side.key)?.shift();

    if (origin !== undefined) moved.set(side, origin);
  }

  const movedFrom = new Set(moved.values());
  const removedOf = (block: Block) => block.removed.filter((side) => !movedFrom.has(side));
  const addedOf = (block: Block) => block.added.filter((side) => !moved.has(side));
  const pairs = new Map<Side, Side>();
  const paired = new Set<Side>();

  const pairByConditions = (removed: readonly Side[], added: readonly Side[]) => {
    for (const before of removed.filter((side) => !paired.has(side))) {
      const after = added.find((side) => !pairs.has(side) && conditionsKey(side.node) === conditionsKey(before.node));

      if (after !== undefined) {
        pairs.set(after, before);
        paired.add(before);
      }
    }
  };

  for (const block of blocks) pairByConditions(removedOf(block), addedOf(block));

  pairByConditions(blocks.flatMap(removedOf), blocks.flatMap(addedOf));

  for (const block of blocks) {
    const restRemoved = removedOf(block).filter((side) => !paired.has(side));

    for (const [position, after] of addedOf(block)
      .filter((side) => !pairs.has(side))
      .entries()) {
      const before = restRemoved.at(position);

      if (before !== undefined) {
        pairs.set(after, before);
        paired.add(before);
      }
    }
  }

  const changes: RuleChange[] = [];

  for (const block of blocks) {
    for (const after of block.added) {
      const origin = moved.get(after);
      const before = pairs.get(after);

      if (origin !== undefined) {
        changes.push({ kind: RULE_CHANGE.Moved, index: after.index, previous: origin.index });
      } else if (before === undefined) {
        changes.push({ kind: RULE_CHANGE.Added, index: after.index });
      } else {
        changes.push(toPair(before, after));
      }
    }

    for (const before of removedOf(block)) {
      if (!paired.has(before)) changes.push({ kind: RULE_CHANGE.Removed, index: before.index });
    }
  }

  return changes;
}
