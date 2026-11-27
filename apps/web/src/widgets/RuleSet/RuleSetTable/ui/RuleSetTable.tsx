import { useTable } from '@tanstack/react-table';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleSetRow as RuleSetRowModel, useCachedRuleSets } from '@entities/RuleSet';
import type { CachedRuleSet } from '@entities/RuleSet';
import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';
import type { RuleSetLinks } from '../model/RuleSetTable.links';
import { RULE_SET_COLUMNS, RULE_SET_TABLE_FEATURES } from './RuleSetColumns';
import { RuleSetRow } from './RuleSetRow';
import { RuleSetTableHeader } from './RuleSetTableHeader';

/** The header row is also a table row: row numbering starts with it. */
const HEADER_ROWS = 1;

/**
 * Attached rule sets in file order: toolbar with search, column header, rows
 * and a footer with a counter. The list holds no forms: a toolbar button opens
 * the form in the panel beside it.
 *
 * The list is deliberately not virtualized: there are tens of rule sets in a config, not hundreds —
 * a virtualizer here would cost absolute positioning for savings
 * nobody can see. The table is built with roles anyway: the header must name
 * the columns, not only mark them up with styles.
 */
export function RuleSetTable({
  sets,
  links,
  total,
  empty,
  search = null,
  actions = null,
  openedTag,
  appliedTags,
  cache,
  onEdit,
  onNodeRemoved,
}: {
  links: RuleSetLinks;
  sets: RuleSetRowModel[];
  openedTag?: string;
  appliedTags?: ReadonlySet<string>;
  cache?: ReturnType<typeof useCachedRuleSets>;
  /** How many rule sets are in the config before filtering: the footer reports both values. */
  total: number;
  empty: ReactNode;
  /** Search: left edge of the toolbar. */
  search?: ReactNode;
  /** List actions: right edge of the toolbar. */
  actions?: ReactNode;
  /** Opens editing of a rule set; without it rows do not offer editing. */
  onEdit?: (index: number) => void;
  onNodeRemoved: () => void;
}) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);
  const table = useTable({ features: RULE_SET_TABLE_FEATURES, columns: RULE_SET_COLUMNS, data: sets });
  const rows = table.getRowModel().rows;
  const shown = useMemo(() => rows.map((row) => row.original), [rows]);
  const saved = useMemo(
    () => new Map<string, CachedRuleSet>(cache?.data?.map((entry) => [entry.tag, entry])),
    [cache?.data]
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    openedTag === undefined ? new Set() : new Set([openedTag])
  );
  const toggleDetails = useCallback((tag: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);

      if (next.has(tag)) next.delete(tag);
      else next.add(tag);

      return next;
    });
  }, []);

  return (
    <section className={cn('flex min-w-0 grow flex-col overflow-hidden', SURFACE)}>
      <h2 className='sr-only'>{t('title')}</h2>

      <div className='flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5'>
        {search}
        {actions !== null && <div className='ml-auto flex items-center gap-2'>{actions}</div>}
      </div>

      {sets.length === 0 ? (
        <div className='flex items-center justify-center px-4 py-10 text-center'>{empty}</div>
      ) : (
        <div role='table' aria-label={t('title')} aria-rowcount={sets.length + HEADER_ROWS}>
          <RuleSetTableHeader />

          <div role='rowgroup'>
            {shown.map((set, position) => (
              <RuleSetRow
                links={links}
                key={set.id}
                set={set}
                rowIndex={position + 1 + HEADER_ROWS}
                expanded={expanded.has(set.tag)}
                reveal={set.tag === openedTag}
                cached={saved.get(set.tag)}
                draftOnly={appliedTags !== undefined && !appliedTags.has(set.tag)}
                cache={cache}
                onToggleDetails={toggleDetails}
                onEdit={onEdit}
                onNodeRemoved={onNodeRemoved}
              />
            ))}
          </div>
        </div>
      )}

      <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3.5 py-2 text-xs text-muted-foreground'>
        <p role='status'>
          {sets.length === total
            ? t('footer.rows', { count: total })
            : t('list.shown', { ns: SHARED_NS, shown: sets.length, total })}
        </p>
      </div>
    </section>
  );
}
