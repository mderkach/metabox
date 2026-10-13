import { useState, type ReactNode } from 'react';

import type { RuleRow } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import { SHEET_BOTTOM, Sheet, SheetContent } from '@shared/ui';

import { RulePanel } from './RulePanel';

interface RulePanelContent {
  rule: RuleRow;
  node: unknown;
  recognized: boolean;
  panelKey: number;
}

/**
 * Rule panel as a sheet on top of the list — on a narrow screen, where there is no room
 * for it beside the list. The sheet slides away with an animation after the selection is reset and all that time
 * shows the last rule together with its node, not emptiness and not a neighbor.
 */
export function RulePanelSheet({
  rule,
  node,
  recognized,
  panelKey,
  outbounds,
  ruleSets,
  actions = null,
  onClose,
}: {
  /** `null` means no rule is selected, the sheet is closed. */
  rule: RuleRow | null;
  node: unknown;
  recognized: boolean;
  /**
   * Panel key: its content is recreated when it changes, not when
   * the rule moved to a different number.
   */
  panelKey: number;
  outbounds: string[];
  ruleSets: string[];
  /** Actions on the rule: panel header, before the close button. */
  actions?: ReactNode;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<RulePanelContent | null>(null);

  if (
    rule !== null &&
    (shown?.rule !== rule || shown.node !== node || shown.recognized !== recognized || shown.panelKey !== panelKey)
  ) {
    setShown({ rule, node, recognized, panelKey });
  }

  return (
    <Sheet
      open={rule !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent side='bottom' showCloseButton={false} className={cn(SHEET_BOTTOM, 'max-h-[85svh] gap-0 p-0')}>
        {shown !== null && (
          <RulePanel
            key={shown.panelKey}
            rule={shown.rule}
            node={shown.node}
            recognized={shown.recognized}
            outbounds={outbounds}
            ruleSets={ruleSets}
            actions={actions}
            sheet
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
