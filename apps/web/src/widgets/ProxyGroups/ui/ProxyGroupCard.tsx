import type { ParseKeys } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProxyGroup } from '@entities/Proxy';
import { useTestProxyDelay } from '@features/Proxy/ProxyDelay';
import { useSelectProxy } from '@features/Proxy/ProxySelect';
import { Badge, Button, Card, CardContent, CardHeader } from '@shared/ui';

import { ProxyNodeTile } from './ProxyNodeTile';

const GROUP_LABEL: Readonly<Record<string, ParseKeys<'widgets/ProxyGroups'> | undefined>> = {
  Selector: 'type.selector',
  URLTest: 'type.urlTest',
  Fallback: 'type.fallback',
  LoadBalance: 'type.loadBalance',
};

export function ProxyGroupCard({ group }: { group: ProxyGroup }) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const select = useSelectProxy();
  const delay = useTestProxyDelay();
  const label = GROUP_LABEL[group.type];
  const kind = label === undefined ? group.type : t(label);
  const active = group.nodes.find((node) => node.selected) ?? null;

  const onSelect = useCallback(
    (node: string) => {
      select.mutate({ group: group.name, node });
    },
    [group.name, select]
  );

  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border px-4 py-3'>
        <h2 className='font-mono text-sm font-medium'>{group.name}</h2>
        <Badge variant='outline'>{kind}</Badge>
        <p className='text-xs text-muted-foreground'>{group.selectable ? t('card.manual') : t('card.automatic')}</p>
        <span className='grow' />
        <p className='text-xs text-muted-foreground'>{t('count.node', { ns: 'shared', count: group.nodes.length })}</p>
        <Button
          variant='outline'
          size='sm'
          disabled={delay.isPending}
          onClick={() => {
            delay.mutate(group.name);
          }}
        >
          {t('card.test')}
        </Button>
      </CardHeader>

      <CardContent className='flex flex-col gap-3 px-4 py-3'>
        {/* Активный узел назван словами: в большой группе выбранная плитка уезжает
            за пределы первого ряда. */}
        <p className='text-xs text-muted-foreground'>
          {t('card.current')}{' '}
          {active === null ? (
            <span className='text-muted-foreground'>{t('card.none')}</span>
          ) : (
            <span className='font-mono text-foreground'>{active.name}</span>
          )}
        </p>

        <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
          {group.nodes.map((node) => (
            <ProxyNodeTile key={node.name} node={node} selectable={group.selectable} onSelect={onSelect} />
          ))}
        </ul>

        {!group.selectable && <p className='text-xs text-muted-foreground'>{t('card.hint')}</p>}
      </CardContent>
    </Card>
  );
}
