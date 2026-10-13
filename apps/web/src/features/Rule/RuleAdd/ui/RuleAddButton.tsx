import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import { newRuleNode } from '@entities/Rule';
import { Button } from '@shared/ui';

/**
 * A new rule at the end of `route.rules`: without conditions, with an outbound
 * to the default route. The array may be absent from the file, and the insert
 * creates it.
 *
 * Without an outbound the button goes dim and says why: sing-box rejects a rule
 * without `outbound`, and the panel may not invent a tag that is not in the
 * config.
 */
export function RuleAddButton({
  index,
  outbound,
  onAdded,
}: {
  /** New rule number, from one: the `route.rules` length plus one. */
  index: number;
  /** New rule outbound; `null` means there is no outbound, adding is impossible. */
  outbound: string | null;
  onAdded: (index: number) => void;
}) {
  const { t } = useTranslation('features/Rule/RuleAdd');
  const insert = ConfigDocumentState.use.insert();

  return (
    <>
      {outbound === null && <p className='text-xs text-muted-foreground'>{t('unavailable')}</p>}
      <Button
        variant='outline'
        size='sm'
        disabled={outbound === null}
        onClick={() => {
          if (outbound === null) {
            return;
          }

          insert(ruleNodePath(index), newRuleNode(outbound));
          onAdded(index);
        }}
      >
        <Plus />
        {t('add')}
      </Button>
    </>
  );
}
