import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ROUTE_KIND, type ConnectionKind, type ConnectionKindGroup, type RouteKind } from '@entities/Connection';
import { FACET_ACTIVE, FACET_CLASS, FACET_IDLE } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';

/**
 * Подпись судьбы пакета. Текст показывает тот, кто его показывает: у сводки на
 * обзоре свой словарь, и общий на два экрана связал бы их загрузку.
 */
const KIND_LABELS: Readonly<Record<RouteKind, ParseKeys<'pages/Connections'>>> = {
  [ROUTE_KIND.Proxy]: 'kinds.proxy',
  [ROUTE_KIND.Direct]: 'kinds.direct',
  [ROUTE_KIND.Block]: 'kinds.block',
  [ROUTE_KIND.Dns]: 'kinds.dns',
  [ROUTE_KIND.Other]: 'kinds.other',
};

/** Срез по действию: «куда ушло». Порядок чипов задан моделью, а не счётчиками. */
export function ConnectionKindFacet({
  groups,
  kind,
  onKindChange,
}: {
  groups: ConnectionKindGroup[];
  kind: ConnectionKind;
  onKindChange: (kind: ConnectionKind) => void;
}) {
  const { t } = useTranslation('pages/Connections');

  if (groups.length === 0) {
    return null;
  }

  return (
    <ul aria-label={t('kinds.label')} className='flex min-w-0 flex-wrap items-center gap-1.5'>
      <li>
        <button
          type='button'
          aria-pressed={kind === null}
          onClick={() => {
            onKindChange(null);
          }}
          className={cn(FACET_CLASS, kind === null ? FACET_ACTIVE : FACET_IDLE)}
        >
          {t('kinds.all')}
        </button>
      </li>
      {groups.map((group) => (
        <li key={group.kind}>
          <button
            type='button'
            aria-pressed={kind === group.kind}
            onClick={() => {
              onKindChange(kind === group.kind ? null : group.kind);
            }}
            className={cn(FACET_CLASS, kind === group.kind ? FACET_ACTIVE : FACET_IDLE)}
          >
            {t(KIND_LABELS[group.kind])}
            <span className='font-mono tabular-nums'>{group.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
