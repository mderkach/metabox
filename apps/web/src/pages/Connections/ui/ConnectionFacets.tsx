import type { ParseKeys } from 'i18next';
import { X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CONNECTION_FACET,
  CONNECTION_FACETS,
  hasFacetSelection,
  ROUTE_KIND,
  type ConnectionFacet,
} from '@entities/Connection';
import { useScrollEdges } from '@shared/lib/useScrollEdges';
import { cn } from '@shared/lib/utils';
import { Button, FacetFilter, type FacetText } from '@shared/ui';

import type { ConnectionsScreen } from '../lib';

const FACET_LABEL: Readonly<Record<ConnectionFacet, ParseKeys<'pages/Connections'>>> = {
  [CONNECTION_FACET.Source]: 'facet.source',
  [CONNECTION_FACET.Kind]: 'facet.kind',
  [CONNECTION_FACET.Rule]: 'facet.rule',
  [CONNECTION_FACET.Chain]: 'facet.chain',
  [CONNECTION_FACET.Network]: 'facet.network',
};

/** Packet fate label: the overview summary shows it too, so the dictionary is shared. */
const KIND_LABEL: ReadonlyMap<string, ParseKeys<'shared'>> = new Map([
  [ROUTE_KIND.Proxy, 'route.proxy'],
  [ROUTE_KIND.Direct, 'route.direct'],
  [ROUTE_KIND.Block, 'route.block'],
  [ROUTE_KIND.Dns, 'route.dns'],
  [ROUTE_KIND.Other, 'route.other'],
]);

/**
 * Toolbar facets and reset of all at once. On a narrow width, a separate row
 * under the search that scrolls horizontally: a cloud of buttons would take
 * half of a phone screen.
 *
 * A device is labeled with a name, while the IP goes into the URL: the name can
 * be changed, and a selection link must not break because of it.
 */
export function ConnectionFacets({ screen }: { screen: ConnectionsScreen }) {
  const { t } = useTranslation('pages/Connections');
  const { sourceLabel } = screen;

  const describe = useMemo<Readonly<Record<ConnectionFacet, (value: string) => FacetText>>>(
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

  const strip = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(strip, screen.facets);

  return (
    <div
      ref={strip}
      role='group'
      aria-label={t('facet.group')}
      className={cn(
        'flex min-w-0 items-center gap-1.5 max-md:order-last max-md:w-full max-md:overflow-x-auto',
        edges.start && 'max-md:mask-l-from-85%',
        edges.end && 'max-md:mask-r-from-85%'
      )}
    >
      {CONNECTION_FACETS.map((facet) => (
        <FacetFilter
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
