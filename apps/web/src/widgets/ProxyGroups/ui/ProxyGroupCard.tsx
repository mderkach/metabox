import { useCallback } from 'react';

import type { ProxyGroup } from '@entities/Proxy';
import { useTestProxyDelay } from '@features/Proxy/ProxyDelay';
import { useSelectProxy } from '@features/Proxy/ProxySelect';
import { plural } from '@shared/lib/format';
import { Badge, Button, Card, CardContent, CardHeader } from '@shared/ui';

import { ProxyNodeTile } from './ProxyNodeTile';

const NODE_FORMS = ['узел', 'узла', 'узлов'] as const;

const GROUP_LABEL: Readonly<Record<string, string>> = {
  Selector: 'селектор',
  URLTest: 'URL-тест',
  Fallback: 'резерв',
  LoadBalance: 'балансировка',
};

export function ProxyGroupCard({ group }: { group: ProxyGroup }) {
  const select = useSelectProxy();
  const delay = useTestProxyDelay();
  const kind = GROUP_LABEL[group.type] ?? group.type;
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
        <p className='text-xs text-muted-foreground'>
          {group.selectable ? 'узел выбираете вы' : 'узел выбирается автоматически, по задержке'}
        </p>
        <span className='grow' />
        <p className='text-xs text-muted-foreground'>{plural(group.nodes.length, NODE_FORMS)}</p>
        <Button
          variant='outline'
          size='sm'
          disabled={delay.isPending}
          onClick={() => {
            delay.mutate(group.name);
          }}
        >
          Проверить
        </Button>
      </CardHeader>

      <CardContent className='flex flex-col gap-3 px-4 py-3'>
        {/* Активный узел назван словами: в большой группе выбранная плитка уезжает
            за пределы первого ряда. */}
        <p className='text-xs text-muted-foreground'>
          сейчас:{' '}
          {active === null ? (
            <span className='text-muted-foreground'>не выбран</span>
          ) : (
            <span className='font-mono text-foreground'>{active.name}</span>
          )}
        </p>

        <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
          {group.nodes.map((node) => (
            <ProxyNodeTile key={node.name} node={node} selectable={group.selectable} onSelect={onSelect} />
          ))}
        </ul>

        {!group.selectable && (
          <p className='text-xs text-muted-foreground'>
            Чтобы закреплять узел вручную, группа в конфиге должна быть селектором.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
