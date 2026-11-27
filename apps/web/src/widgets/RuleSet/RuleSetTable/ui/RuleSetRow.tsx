import { ChevronDown, Pencil } from 'lucide-react';
import { memo, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleSetRow as RuleSetRowModel, useCachedRuleSets } from '@entities/RuleSet';
import type { CachedRuleSet } from '@entities/RuleSet';
import { RuleSetDeleteButton } from '@features/RuleSet/RuleSetDelete';
import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';
import type { RuleSetLinks } from '../model/RuleSetTable.links';
import { isEditable } from '../model/RuleSetTable.model';
import { CELL } from './RuleSetCells';
import { RULE_SET_COLUMN, RULE_SET_COLUMNS } from './RuleSetColumns';
import { RuleSetDetails } from './RuleSetDetails';

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
  links,
  rowIndex,
  expanded,
  reveal,
  cached,
  draftOnly,
  cache,
  onToggleDetails,
  onEdit,
  onNodeRemoved,
}: {
  links: RuleSetLinks;
  set: RuleSetRowModel;
  rowIndex: number;
  expanded: boolean;
  reveal: boolean;
  cached: CachedRuleSet | undefined;
  draftOnly: boolean;
  cache?: ReturnType<typeof useCachedRuleSets>;
  onToggleDetails?: (tag: string) => void;
  /** Without it the row does not offer editing. */
  onEdit?: (index: number) => void;
  onNodeRemoved: () => void;
}) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);
  const detailsId = useId();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(
    function scrollToLinkedSet() {
      const row = rowRef.current;

      if (reveal && typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
    },
    [reveal]
  );

  const checked = draftOnly || cached?.state !== 'cached' ? undefined : cached;

  return (
    <div ref={rowRef} role='row' aria-rowindex={rowIndex} className={cn(RULE_SET_COLUMN.Row, 'relative md:pl-12')}>
      {RULE_SET_COLUMNS.map((def, position) => {
        const Cell = CELL[def.id];

        return (
          <span
            key={def.id}
            role='cell'
            className={cn(
              def.meta.className,
              checked === undefined && def.accessorFn(set, position) === null && 'max-md:hidden'
            )}
          >
            <Cell byTag={links.byTag} set={set} cached={checked} />
          </span>
        );
      })}

      <span role='cell' className={RULE_SET_COLUMN.RowActions}>
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

        <RuleSetDeleteButton index={set.index} tag={set.tag} usedBy={set.usedBy} onNodeRemoved={onNodeRemoved} />
      </span>
      {onToggleDetails !== undefined && set.tag !== '' && (
        <span role='cell' className='col-span-2 md:absolute md:top-2.5 md:left-2'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='w-full max-md:min-h-11 md:size-8 md:p-0'
            aria-label={t(expanded ? 'details.hideNamed' : 'details.showNamed', { tag: set.tag })}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => {
              onToggleDetails(set.tag);
            }}
          >
            <ChevronDown className={cn(expanded && 'rotate-180')} />
            <span className='md:hidden'>{t(expanded ? 'details.hide' : 'details.show')}</span>
          </Button>
        </span>
      )}
      <div role='cell' aria-colspan={RULE_SET_COLUMNS.length + 1} hidden={!expanded} className='col-span-2 basis-full'>
        <section id={detailsId} aria-label={t('details.toggle', { tag: set.tag })}>
          {expanded && <RuleSetDetails links={links} set={set} cached={cached} cache={cache} draftOnly={draftOnly} />}
        </section>
      </div>
    </div>
  );
}

export const RuleSetRow = memo(RuleSetRowProto);
