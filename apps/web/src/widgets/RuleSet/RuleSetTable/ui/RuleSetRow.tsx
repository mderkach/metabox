import { Pencil } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleSetRow as RuleSetRowModel } from '@entities/RuleSet';
import { cn } from '@shared/lib/utils';
import { Button, Separator } from '@shared/ui';

import { isEditable } from '../model/RuleSetTable.model';
import { CELL } from './RuleSetCells';
import { RULE_SET_COLUMN, RULE_SET_COLUMNS } from './RuleSetColumns';
import { RuleSetRemove } from './RuleSetRemove';

/**
 * Rule set row.
 *
 * The rule set name is the first thing read: rules reference it. Below
 * comes the origin — whose list the route trusts — then what the device knows
 * about the file, and on the right what the rule set was attached for in the
 * first place: how many rules use it.
 *
 * Below `md` the row is a card, and a cell without a value folds away there: a column
 * of dashes under every remote set would only repeat that the source is silent.
 */
function RuleSetRowProto({
  set,
  rowIndex,
  onEdit,
  onRemove,
}: {
  set: RuleSetRowModel;
  rowIndex: number;
  /** Without it the row does not offer editing. */
  onEdit?: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  return (
    <div role='row' aria-rowindex={rowIndex} className={RULE_SET_COLUMN.Row}>
      {RULE_SET_COLUMNS.map((def, position) => {
        const Cell = CELL[def.id];

        return (
          <span
            key={def.id}
            role='cell'
            className={cn(def.meta.className, def.accessorFn(set, position) === null && 'max-md:hidden')}
          >
            <Cell set={set} />
          </span>
        );
      })}

      <span role='cell' className={RULE_SET_COLUMN.RowActions}>
        <Separator orientation='vertical' className='h-5' />

        {onEdit !== undefined && isEditable(set) && (
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('row.edit', { tag: set.tag })}
            onClick={() => {
              onEdit(set.index);
            }}
          >
            <Pencil />
          </Button>
        )}

        <RuleSetRemove
          tag={set.tag}
          usedBy={set.usedBy}
          onConfirm={() => {
            onRemove(set.index);
          }}
        />
      </span>
    </div>
  );
}

export const RuleSetRow = memo(RuleSetRowProto);
