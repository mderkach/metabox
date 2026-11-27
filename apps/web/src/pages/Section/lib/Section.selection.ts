import { useState } from 'react';

import { nodeName } from '../model/Section.name';
import type { SectionPanelNode } from '../ui/SectionPanel';

type PanelTarget = { kind: 'add' } | { kind: 'node'; index: number };

interface PanelState {
  open: boolean;
  target: PanelTarget;
}

const CLOSED: PanelState = { open: false, target: { kind: 'add' } };

export function useSectionSelection(
  nodes: readonly unknown[],
  path: readonly string[],
  addable: boolean,
  requestedNode?: number
) {
  const [panel, setPanel] = useState<PanelState>(CLOSED);
  const [requested, setRequested] = useState<number | undefined>(undefined);
  // A deleted node is gone from the text, and the sheet still slides away with it, not empty.
  const [held, setHeld] = useState<SectionPanelNode | null>(null);
  if (requested !== requestedNode) {
    setRequested(requestedNode);

    if (requestedNode !== undefined) {
      setPanel({ open: true, target: { kind: 'node', index: requestedNode - 1 } });
    }
  }

  // A node removed from the text by other means closes its panel.
  const target = panel.target;
  const picked = target.kind === 'node' && target.index < nodes.length ? nodes[target.index] : undefined;
  const shown = panel.open && (target.kind === 'add' ? addable : picked !== undefined);
  const adding = shown && target.kind === 'add';

  function toggleAdding() {
    setPanel(adding ? { ...panel, open: false } : { open: true, target: { kind: 'add' } });
  }

  function openNode(index: number) {
    setPanel({ open: true, target: { kind: 'node', index } });
  }

  function stepNode(step: 1 | -1) {
    const next = target.kind === 'node' ? target.index + step : -1;

    if (next >= 0 && next < nodes.length) {
      openNode(next);
    }
  }

  function closePanel() {
    setPanel({ ...panel, open: false });
  }

  // The new node is the last one: it opens so that its form is filled in next.
  function openAdded() {
    openNode(nodes.length);
  }

  const pickedNode =
    picked === undefined || target.kind !== 'node'
      ? null
      : { index: target.index, node: picked, name: nodeName(path, picked, target.index) };

  if (pickedNode !== null && (held === null || held.node !== pickedNode.node || held.index !== pickedNode.index)) {
    setHeld(pickedNode);
  }

  const sheetNode = target.kind === 'add' ? null : held;
  const hasSheetTarget = target.kind === 'add' ? addable : sheetNode !== null;

  return {
    shown,
    adding,
    target,
    pickedNode,
    sheetNode,
    hasSheetTarget,
    toggleAdding,
    openNode,
    stepNode,
    closePanel,
    openAdded,
  };
}
