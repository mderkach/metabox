import { useCallback } from 'react';

import { useSelectProxy, useTestProxyDelay, type ProxyGroup } from '@entities/Proxy';
import { plural } from '@shared/lib/format';
import { Badge, Button, Card, CardContent, CardHeader } from '@shared/ui';

import { ProxyNodeRow } from './ProxyNodeRow';

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

  const onSelect = useCallback(
    (node: string) => {
      select.mutate({ group: group.name, node });
    },
    [group.name, select]
  );

  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <CardHeader className='flex flex-row items-center gap-2.5 border-b border-border px-4 py-3'>
        <h2 className='text-sm font-medium'>{group.name}</h2>
        <Badge variant='outline'>{kind}</Badge>
        <p className='text-xs text-muted-foreground'>
          {group.selectable ? 'узел выбираете вы' : 'узел выбирает sing-box сам'}
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

      <CardContent className='px-0'>
        <ul>
          {group.nodes.map((node) => (
            <ProxyNodeRow key={node.name} node={node} selectable={group.selectable} onSelect={onSelect} />
          ))}
        </ul>

        {!group.selectable && (
          <p className='border-t border-border px-4 py-2.5 text-xs text-muted-foreground'>
            Узел выбирает {kind} по задержке. Чтобы закреплять узел вручную, группа в конфиге должна быть селектором.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
