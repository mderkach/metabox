import { useCallback, useState } from 'react';

import { toRuleRowsFromNodes, type NewRulePlace, type RuleRow } from '@entities/Rule';

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
 *
 * `requestedId` is the rule from the address: it opens when it changes, and
 * otherwise the screen owns the selection, so a closed panel stays closed.
 */
export function useRuleSelection(
  requestedId: string | null,
  rules: readonly RuleRow[],
  guardedLink?: string
): RuleSelection {
  const [selection, setSelection] = useState<RuleSelectionState>({
    id: requestedId,
    key: 0,
    pending: null,
    created: null,
  });
  const [requested, setRequested] = useState({ id: requestedId, guardedLink });

  const { created } = selection;

  if (created !== null && rules.some((row) => row.id === created.id)) {
    setSelection({ ...selection, created: null });
  }

  const openedGuardedLink = guardedLink !== undefined && requested.guardedLink !== guardedLink;
  if (requested.id !== requestedId || requested.guardedLink !== guardedLink) {
    setRequested({ id: requestedId, guardedLink });

    if (requestedId !== null || openedGuardedLink) {
      setSelection({ id: requestedId, key: selection.key + 1, pending: null, created: null });
    }
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
