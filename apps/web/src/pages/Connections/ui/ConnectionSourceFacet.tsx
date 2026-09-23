import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionSource, ConnectionSourceGroup } from '@entities/Connection';
import { cn } from '@shared/lib/utils';
import { FACET_ACTIVE, FACET_CLASS, FACET_IDLE, FACET_MORE } from '@shared/ui';

/** Сколько устройств показать сразу: на роутере их бывает под три десятка. */
const VISIBLE_SOURCES = 8;

/** Срез по устройству: «чьё оно». Счётчики считаются по вкладке целиком. */
export function ConnectionSourceFacet({
  groups,
  total,
  source,
  onSourceChange,
}: {
  groups: ConnectionSourceGroup[];
  total: number;
  source: ConnectionSource;
  onSourceChange: (source: ConnectionSource) => void;
}) {
  const { t } = useTranslation('pages/Connections');
  const [all, setAll] = useState(false);

  const onToggleAll = useCallback(() => {
    setAll((current) => !current);
  }, []);

  return (
    <ul aria-label={t('sources.label')} className='flex min-w-0 flex-wrap items-center gap-1.5'>
      <li>
        <button
          type='button'
          aria-pressed={source === null}
          onClick={() => {
            onSourceChange(null);
          }}
          className={cn(FACET_CLASS, source === null ? FACET_ACTIVE : FACET_IDLE)}
        >
          {t('sources.all')}
          <span className='font-mono tabular-nums'>{total}</span>
        </button>
      </li>
      {(all ? groups : groups.slice(0, VISIBLE_SOURCES)).map((group) => (
        <li key={group.source}>
          <button
            type='button'
            aria-pressed={source === group.source}
            onClick={() => {
              onSourceChange(source === group.source ? null : group.source);
            }}
            className={cn(FACET_CLASS, source === group.source ? FACET_ACTIVE : FACET_IDLE)}
          >
            <span className='font-mono'>{group.source}</span>
            <span className='font-mono tabular-nums'>{group.count}</span>
          </button>
        </li>
      ))}
      {groups.length > VISIBLE_SOURCES && (
        <li>
          <button type='button' aria-expanded={all} onClick={onToggleAll} className={cn(FACET_CLASS, FACET_MORE)}>
            {all
              ? t('list.collapse', { ns: 'shared' })
              : t('list.more', { ns: 'shared', count: groups.length - VISIBLE_SOURCES })}
          </button>
        </li>
      )}
    </ul>
  );
}
