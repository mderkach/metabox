import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useRuleTitle, type RuleRow as RuleRowModel } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

import { RULE_HIT, RULE_HITS_STATE, type RuleHitCell, type RuleHitsColumn } from '../model';
import { RuleRow } from './RuleRow';
import { RuleTableHeader } from './RuleTableHeader';

/** Estimate for the first frame: the virtualizer measures the exact height itself. */
const ROW_ESTIMATE = 52;
const OVERSCAN = 8;

const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/** The header row is also a table row: row numbering starts with it. */
const HEADER_ROWS = 1;

const NO_EDITS: ReadonlySet<string> = new Set();

const NO_OUTBOUND_TYPES: ReadonlyMap<string, string> = new Map();

const HITS_NOTE = {
  [RULE_HITS_STATE.Failed]: 'hits.failed',
  [RULE_HITS_STATE.Mismatch]: 'hits.mismatch',
} as const;

/**
 * Rule list in file order: toolbar, column header, virtualized rows
 * and a footer with a counter.
 *
 * There is no sorting in the list and never will be: rules are checked top to bottom, and
 * a reordered list would show an order that does not exist in
 * routing.
 *
 * Virtualized — a config can have up to 500 rules — so the table
 * is built with roles, not the `table` tag: rows are positioned absolutely.
 */
export function RuleTable({
  rules,
  total,
  selectedId,
  empty,
  search = null,
  actions = null,
  edited = NO_EDITS,
  hits = null,
  outboundTypes = NO_OUTBOUND_TYPES,
  onSelect,
}: {
  rules: RuleRowModel[];
  /** How many rules are in the config before filtering: the footer reports both values. */
  total: number;
  selectedId: string | null;
  /** What to show instead of the list when there are no rows. */
  empty: ReactNode;
  /** Search: left edge of the toolbar. */
  search?: ReactNode;
  /** List actions: right edge of the toolbar. */
  actions?: ReactNode;
  /** Rows changed in the draft. */
  edited?: ReadonlySet<string>;
  /** Hit count; `null` means the screen does not show it. */
  hits?: RuleHitsColumn | null;
  /** Outbound type by tag; a tag absent here is colored by name. */
  outboundTypes?: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation('widgets/Rule/RuleTable');
  const { title } = useRuleTitle();
  const counts = hits?.state === RULE_HITS_STATE.Counted ? hits.counts : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const listed = rules.length > 0;

  // The sticky header scrolls together with the rows: without its height the
  // virtualizer puts a row under it at the top and short of the edge at the bottom.
  useEffect(
    function measureHeader() {
      const header = scrollRef.current?.firstElementChild;

      if (!listed || !(header instanceof HTMLElement)) {
        return;
      }

      const observer = new ResizeObserver(() => {
        setHeaderHeight(header.offsetHeight);
      });

      observer.observe(header);

      return function stopMeasuringHeader() {
        observer.disconnect();
      };
    },
    [listed]
  );

  const virtualizer = useVirtualizer({
    count: rules.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
    scrollMargin: headerHeight,
    scrollPaddingStart: headerHeight,
  });

  const selectedPosition = useMemo(() => rules.findIndex((rule) => rule.id === selectedId), [rules, selectedId]);

  const viewportHeight = virtualizer.scrollRect?.height ?? 0;
  const followSelection = useRef(true);
  const lastViewportHeight = useRef(viewportHeight);

  // The first input on the list ends the load: after that the person decides where it is scrolled.
  useEffect(
    function stopFollowingOnInput() {
      const scroller = scrollRef.current;

      if (scroller === null) {
        return;
      }

      function stopFollowing() {
        followSelection.current = false;
      }

      for (const event of USER_INPUT_EVENTS) {
        scroller.addEventListener(event, stopFollowing, { passive: true });
      }

      return function resumeFollowing() {
        for (const event of USER_INPUT_EVENTS) {
          scroller.removeEventListener(event, stopFollowing);
        }
      };
    },
    [listed]
  );

  // The selected row may be outside the window: a new rule at the end, a moved
  // one, a link to a rule far down. `auto` leaves a visible row where it is.
  useEffect(
    function revealSelected() {
      followSelection.current = true;

      if (selectedPosition >= 0) {
        virtualizer.scrollToIndex(selectedPosition, { align: 'auto' });
      }
    },
    [selectedPosition, virtualizer]
  );

  // The window shrinks while the blocks above it load and pushes the selected row out;
  // a later change (a rotated phone) must not pull the list back.
  useEffect(
    function revealSelectedOnShrink() {
      const shrank = viewportHeight < lastViewportHeight.current;

      lastViewportHeight.current = viewportHeight;

      if (shrank && followSelection.current && selectedPosition >= 0) {
        virtualizer.scrollToIndex(selectedPosition, { align: 'auto' });
      }
    },
    [viewportHeight, selectedPosition, virtualizer]
  );

  return (
    <section className={cn('flex min-h-0 grow flex-col overflow-hidden max-lg:min-h-96', SURFACE)}>
      <div className='flex shrink-0 flex-col gap-2 border-b border-border px-3.5 py-2.5'>
        <div className='flex flex-wrap items-center gap-2'>
          {search}
          {actions !== null && <div className='ml-auto flex items-center gap-2'>{actions}</div>}
        </div>
      </div>

      {rules.length === 0 ? (
        <div className='flex grow items-center justify-center px-4 py-10 text-center'>{empty}</div>
      ) : (
        <div
          ref={scrollRef}
          data-virtual-viewport=''
          role='table'
          aria-label={t('label')}
          aria-rowcount={rules.length + HEADER_ROWS}
          className='min-h-0 grow overflow-y-auto'
        >
          <RuleTableHeader hits={counts !== null} />

          <div role='rowgroup' className='relative' style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
            {virtualizer.getVirtualItems().map((item) => {
              const rule = rules[item.index];

              return (
                <div
                  key={rule.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className='absolute inset-x-0 top-0'
                  style={{ transform: `translateY(${String(item.start - headerHeight)}px)` }}
                >
                  <RuleRow
                    rule={rule}
                    title={title(rule)}
                    rowIndex={item.index + 1 + HEADER_ROWS}
                    selected={rule.id === selectedId}
                    edited={edited.has(rule.id)}
                    hits={counts === null ? undefined : toHitCell(counts, rule.id)}
                    outboundTypes={outboundTypes}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3.5 py-2 text-xs text-muted-foreground'>
        <p role='status'>
          {rules.length === total
            ? t('count.rule', { ns: 'shared', count: total })
            : t('list.shown', { ns: 'shared', shown: rules.length, total })}
        </p>
        <HitsNote hits={hits} />
      </div>
    </section>
  );
}

function toHitCell(counts: ReadonlyMap<string, number | null>, id: string): RuleHitCell {
  if (!counts.has(id)) {
    return RULE_HIT.Edited;
  }

  return counts.get(id) ?? RULE_HIT.Unobserved;
}

/** Why there is no count: without this line an empty column would look like breakage. */
function HitsNote({ hits }: { hits: RuleHitsColumn | null }) {
  const { t } = useTranslation('widgets/Rule/RuleTable');

  if (hits === null || hits.state === RULE_HITS_STATE.Pending || hits.state === RULE_HITS_STATE.Counted) {
    return null;
  }

  return <p className='ml-auto'>{t(HITS_NOTE[hits.state])}</p>;
}
