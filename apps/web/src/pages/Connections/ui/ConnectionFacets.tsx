import type { ParseKeys } from 'i18next';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CONNECTION_FACET,
  CONNECTION_FACETS,
  hasFacetSelection,
  ROUTE_KIND,
  type ConnectionFacet,
} from '@entities/Connection';
import { Button } from '@shared/ui';

import type { ConnectionsScreen } from '../lib';
import { ConnectionFacetFilter, type ConnectionFacetText } from './ConnectionFacetFilter';

const FACET_LABEL: Readonly<Record<ConnectionFacet, ParseKeys<'pages/Connections'>>> = {
  [CONNECTION_FACET.Source]: 'facet.source',
  [CONNECTION_FACET.Kind]: 'facet.kind',
  [CONNECTION_FACET.Rule]: 'facet.rule',
  [CONNECTION_FACET.Chain]: 'facet.chain',
  [CONNECTION_FACET.Network]: 'facet.network',
};

/** Подпись судьбы пакета: её же показывает сводка на обзоре, поэтому словарь общий. */
const KIND_LABEL: ReadonlyMap<string, ParseKeys<'shared'>> = new Map([
  [ROUTE_KIND.Proxy, 'route.proxy'],
  [ROUTE_KIND.Direct, 'route.direct'],
  [ROUTE_KIND.Block, 'route.block'],
  [ROUTE_KIND.Dns, 'route.dns'],
  [ROUTE_KIND.Other, 'route.other'],
]);

/**
 * Фасеты тулбара и сброс всех разом. На узкой ширине — отдельная строка под
 * поиском, которая прокручивается по горизонтали: облако кнопок заняло бы
 * половину экрана телефона.
 *
 * Устройство подписано именем, а в адрес уходит IP: имя можно сменить, и
 * ссылка на отбор от этого не должна сломаться.
 */
export function ConnectionFacets({ screen }: { screen: ConnectionsScreen }) {
  const { t } = useTranslation('pages/Connections');
  const { sourceLabel } = screen;

  const describe = useMemo<Readonly<Record<ConnectionFacet, (value: string) => ConnectionFacetText>>>(
    () => ({
      [CONNECTION_FACET.Source]: (value) => {
        const label = sourceLabel(value);

        return { label, detail: label === value ? null : value };
      },
      [CONNECTION_FACET.Kind]: (value) => {
        const key = KIND_LABEL.get(value);

        return { label: key === undefined ? value : t(key, { ns: 'shared' }), detail: null };
      },
      [CONNECTION_FACET.Rule]: (value) => ({
        label: value === '' ? t('rule.unconditional', { ns: 'shared' }) : value,
        detail: null,
      }),
      [CONNECTION_FACET.Chain]: (value) => ({ label: value, detail: null }),
      [CONNECTION_FACET.Network]: (value) => ({ label: value, detail: null }),
    }),
    [sourceLabel, t]
  );

  return (
    <div
      role='group'
      aria-label={t('facet.group')}
      className='flex min-w-0 items-center gap-1.5 max-md:order-last max-md:w-full max-md:overflow-x-auto'
    >
      {CONNECTION_FACETS.map((facet) => (
        <ConnectionFacetFilter
          key={facet}
          label={t(FACET_LABEL[facet])}
          values={screen.facets[facet]}
          selected={screen.selection[facet]}
          describe={describe[facet]}
          onSelectedChange={(values) => {
            screen.setFacet(facet, values);
          }}
        />
      ))}

      {hasFacetSelection(screen.selection) && (
        <Button variant='ghost' size='sm' onClick={screen.resetFacets} className='text-muted-foreground max-md:h-11'>
          <X />
          {t('facet.resetAll')}
        </Button>
      )}
    </div>
  );
}
