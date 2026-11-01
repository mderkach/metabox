import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { DELAY_TIMEOUT, SERVICE_GROUPS, useProxies, type ProxyNode } from '@entities/Proxy';
import { useSelectProxy } from '@features/Proxy/ProxySelect';
import { cn } from '@shared/lib/utils';
import {
  CARD_TITLE,
  QueryFailure,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkeletonRows,
} from '@shared/ui';
import { DELAY_TONE } from '@widgets/ProxyGroups';

function toDelayLabel(t: TFunction<'pages/Overview'>, node: ProxyNode | undefined): string {
  const delay = node?.delay ?? null;

  if (delay === null) {
    return t('delay.untested', { ns: 'shared' });
  }

  // A connection failure, not a latency: the runtime returns it as the number 65535.
  return delay >= DELAY_TIMEOUT
    ? t('delay.timedOut', { ns: 'shared' })
    : t('delay.value', { ns: 'shared', value: delay });
}

/**
 * The node the traffic leaves through, switched in place: from a phone this is
 * the reason to open the panel. Only selector groups are offered: a URL test
 * picks its node itself, and its choice is on the proxies screen.
 */
export function OverviewNode({ onSelected }: { onSelected: (message: string) => void }) {
  const { t } = useTranslation('pages/Overview');
  const proxies = useProxies();
  const select = useSelectProxy();
  const groups = (proxies.data?.groups ?? []).filter((group) => group.selectable && !SERVICE_GROUPS.has(group.name));

  return (
    <div className='flex flex-col gap-3'>
      <h3>
        <Link
          to='/proxies'
          className='flex w-fit items-center gap-1 transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11'
        >
          <span className={CARD_TITLE}>{t('node.title')}</span>
          <ArrowUpRight aria-hidden='true' className='size-3.5 text-muted-foreground' />
        </Link>
      </h3>

      {proxies.isPending && <SkeletonRows rows={1} className='p-0' />}
      {proxies.isLoadingError && <QueryFailure messageKey='source.proxies' query={proxies} />}
      {proxies.isSuccess && groups.length === 0 && (
        <p className='text-sm text-pretty text-muted-foreground'>{t('node.none')}</p>
      )}

      {groups.length > 0 && (
        <ul className='flex flex-col gap-2'>
          {groups.map((group) => {
            const current = group.nodes.find((node) => node.name === group.now);

            return (
              <li key={group.name} className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
                <Select
                  items={group.nodes.map((node) => ({ value: node.name, label: node.name }))}
                  value={group.now}
                  onValueChange={(node: string | null) => {
                    if (node === null || node === group.now) {
                      return;
                    }

                    select.mutate(
                      { group: group.name, node },
                      {
                        onSuccess: () => {
                          onSelected(t('node.selected', { group: group.name, node }));
                        },
                      }
                    );
                  }}
                >
                  <SelectTrigger
                    size='sm'
                    className='w-60 max-w-full font-mono'
                    aria-label={t('node.select', { group: group.name })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {group.nodes.map((node) => (
                      <SelectItem key={node.name} value={node.name} className='font-mono'>
                        {node.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='flex min-w-0 items-baseline gap-2 text-xs'>
                  <span className='truncate text-muted-foreground'>{group.name}</span>
                  <span
                    className={cn(
                      'font-mono whitespace-nowrap tabular-nums',
                      current === undefined ? 'text-muted-foreground' : DELAY_TONE[current.delayState]
                    )}
                  >
                    {toDelayLabel(t, current)}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
