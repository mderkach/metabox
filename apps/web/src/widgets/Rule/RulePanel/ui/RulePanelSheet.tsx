import { useState, type ReactNode } from 'react';

import type { RuleRow } from '@entities/Rule';
import { Sheet, SheetContent } from '@shared/ui';

import { RulePanel } from './RulePanel';

interface RulePanelContent {
  rule: RuleRow;
  node: unknown;
  recognized: boolean;
  panelKey: number;
}

/**
 * Панель правила листом поверх списка — на узком экране, где рядом с ним ей
 * нет места. Лист уезжает анимацией уже после сброса выбора и всё это время
 * показывает последнее правило вместе с его узлом, а не пустоту и не соседа.
 */
export function RulePanelSheet({
  rule,
  node,
  recognized,
  panelKey,
  outbounds,
  actions = null,
  onClose,
}: {
  /** `null` — правило не выбрано, лист закрыт. */
  rule: RuleRow | null;
  node: unknown;
  recognized: boolean;
  /**
   * Ключ панели: её содержимое пересоздаётся, когда он меняется, а не когда
   * правило переехало на другой номер.
   */
  panelKey: number;
  outbounds: string[];
  /** Действия над правилом: шапка панели, перед кнопкой закрытия. */
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
      <SheetContent side='bottom' showCloseButton={false} className='max-h-[85svh] gap-0 p-0'>
        {shown !== null && (
          <RulePanel
            key={shown.panelKey}
            rule={shown.rule}
            node={shown.node}
            recognized={shown.recognized}
            outbounds={outbounds}
            actions={actions}
            sheet
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
