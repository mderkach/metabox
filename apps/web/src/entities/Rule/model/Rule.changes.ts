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
 * Routing rule change. `index` is the number from one, as in the rule list: for
 * a deleted one in the applied config, for the others in the draft.
 */
export type RuleChange =
  | { kind: typeof RULE_CHANGE.Added | typeof RULE_CHANGE.Removed | typeof RULE_CHANGE.Changed; index: number }
  /** Conditions are the same, where the rule sends traffic changed: the outbound or the action. */
  | { kind: typeof RULE_CHANGE.Target; index: number; from: string; to: string }
  /** The node did not change, but stands in another place, and order in sing-box is the logic. */
  | { kind: typeof RULE_CHANGE.Moved; index: number; previous: number };

/** Outbound and action fields: without them only the conditions remain of the node. */
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
 * Splits a list comparison into chunks of consecutive differences. A node is
 * compared whole, so a moved rule looks deleted in one place and added in
 * another, and `toRuleChanges` sorts that out.
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
 * What the draft changes in `route.rules` compared with the applied config.
 * Changes go in draft order, deleted ones at the end of their chunk.
 *
 * A node found whole in another place of the list is a move. A "deleted —
 * added" pair reads as an edit of one rule: first nodes with identical
 * conditions are matched within a chunk of differences, then across the whole
 * list, so that a moved and edited rule does not fall apart into a deletion and
 * an addition, and only then the remaining ones in order within the chunk.
 */
export function toRuleChanges(applied: readonly unknown[], draft: readonly unknown[]): RuleChange[] {
  // On an empty list a line-by-line diff would see one empty line.
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
