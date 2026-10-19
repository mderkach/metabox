import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { FACET_ACTIVE, FACET_CLASS, FACET_IDLE, FACET_MORE } from '@shared/ui';

import type { RuleFilterState } from '../lib/Editor.lib';

/** How many outbounds to show at once: a big config has a dozen and a half. */
const VISIBLE_TARGETS = 6;

/** Outbound facet: the second toolbar row, because there are a dozen and a half outbounds. */
export function EditorTargetFacets({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');
  const [allTargets, setAllTargets] = useState(false);
  const shown = allTargets ? filter.targets : filter.targets.slice(0, VISIBLE_TARGETS);

  return (
    <ul aria-label={t('targets.label')} className='flex min-w-0 flex-wrap items-center gap-1.5'>
      {shown.map((group) => (
        <li key={group.target}>
          <button
            type='button'
            aria-pressed={filter.target === group.target}
            onClick={() => {
              filter.setTarget(filter.target === group.target ? null : group.target);
            }}
            className={cn(FACET_CLASS, 'font-mono', filter.target === group.target ? FACET_ACTIVE : FACET_IDLE)}
          >
            {group.target}
            <span className='tabular-nums'>{group.count}</span>
          </button>
        </li>
      ))}
      {filter.targets.length > VISIBLE_TARGETS && (
        <li>
          <button
            type='button'
            aria-expanded={allTargets}
            onClick={() => {
              setAllTargets((current) => !current);
            }}
            className={cn(FACET_CLASS, FACET_MORE)}
          >
            {allTargets
              ? t('list.collapse', { ns: 'shared' })
              : t('list.more', { ns: 'shared', count: filter.targets.length - VISIBLE_TARGETS })}
          </button>
        </li>
      )}
    </ul>
  );
}
