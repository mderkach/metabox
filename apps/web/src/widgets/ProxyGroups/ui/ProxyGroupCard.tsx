import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProxyGroup } from '@entities/Proxy';
import { useTestProxyDelay } from '@features/Proxy/ProxyDelay';
import { useSelectProxy } from '@features/Proxy/ProxySelect';
import { cn } from '@shared/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SECTION_HEADING,
} from '@shared/ui';

import { toGroupLabel } from './ProxyGroupLabel';
import { ProxyNodeTile } from './ProxyNodeTile';

export function ProxyGroupCard({
  group,
  onSelected,
  onTested,
}: {
  group: ProxyGroup;
  onSelected: (group: string, node: string) => void;
  onTested: (group: string) => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const select = useSelectProxy();
  const delay = useTestProxyDelay();
  const kind = toGroupLabel(t, group.type);
  const active = group.nodes.find((node) => node.selected) ?? null;
  const testing = delay.isPending && delay.variables === group.name;

  const onSelect = useCallback(
    (node: string) => {
      select.mutate(
        { group: group.name, node },
        {
          onSuccess: () => {
            onSelected(group.name, node);
          },
        }
      );
    },
    [group.name, onSelected, select]
  );

  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1', SECTION_HEADING)}>
          <h3 className='font-mono'>{group.name}</h3>
          <Badge variant='outline'>{kind}</Badge>
        </CardTitle>
        <CardDescription>
          {group.selectable ? t('card.manual') : t('card.automatic')}
          {' · '}
          {t('count.node', { ns: 'shared', count: group.nodes.length })}
        </CardDescription>
        <CardAction>
          {/* Имя различает три одинаковые кнопки на экране: с клавиатуры подряд
              идут «Проверить», «Проверить», «Проверить», и какая из них чья —
              неизвестно. Подпись на время замера меняется только у своей
              карточки: мутация одна на экран, а работает она с одной группой. */}
          <Button
            variant='outline'
            size='sm'
            disabled={delay.isPending}
            aria-label={t('card.testGroup', { group: group.name })}
            onClick={() => {
              delay.mutate(group.name, {
                onSuccess: () => {
                  onTested(group.name);
                },
              });
            }}
          >
            {testing ? t('delay.testing', { ns: 'shared' }) : t('delay.test', { ns: 'shared' })}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className='flex flex-col gap-3'>
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
      </CardContent>
    </Card>
  );
}
