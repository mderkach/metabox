import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  isLatencyServer,
  serverDelay,
  SERVICE_GROUPS,
  toServerDelayLabel,
  useProxies,
  type ServerLatencies,
} from '@entities/Proxy';
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

import { OverviewCoreGap } from './OverviewCoreGap';

/**
 * The node the traffic leaves through, switched in place: from a phone this is
 * the reason to open the panel. Only selector groups are offered: a URL test
 * picks its node itself, and its choice is on the proxies screen.
 */
export function OverviewNode({
  onSelected,
  stopped,
  latencies,
  latencyAvailable,
}: {
  onSelected: (message: string) => void;
  /** The core is confirmed stopped and cannot switch a group. */
  stopped: boolean;
  latencies?: ServerLatencies | undefined;
  latencyAvailable?: boolean;
}) {
  const { t } = useTranslation('pages/Overview');
  const proxies = useProxies();
  const select = useSelectProxy();
  const configGroups = (proxies.data?.groups ?? []).filter((group) => !SERVICE_GROUPS.has(group.name));
  const groups = configGroups.filter((group) => group.selectable);

  return (
    <div className='flex flex-col gap-3'>
      <h2>
        <Link
          to='/proxies'
          className='flex w-fit items-center gap-1 transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11'
        >
          <span className={CARD_TITLE}>{t('node.title')}</span>
          <ArrowUpRight aria-hidden='true' className='size-3.5 text-muted-foreground' />
        </Link>
      </h2>

      {stopped && <OverviewCoreGap gap='stopped' />}
      {!stopped && proxies.isPending && <SkeletonRows rows={1} className='p-0' />}
      {!stopped && proxies.isLoadingError && <QueryFailure messageKey='source.proxies' query={proxies} />}
      {!stopped && proxies.isSuccess && groups.length === 0 && (
        <p className='text-sm text-pretty text-muted-foreground'>
          {t(configGroups.length === 0 ? 'node.noGroups' : 'node.none')}
        </p>
      )}

      {!stopped && groups.length > 0 && (
        <ul className='flex flex-col gap-2'>
          {groups.map((group) => {
            const current = group.nodes.find((node) => node.name === group.now);
            const latency = current && latencies?.get(current.name);

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
                  {current !== undefined && isLatencyServer(current) && (
                    <span
                      className={cn(
                        'font-mono whitespace-nowrap tabular-nums',
                        DELAY_TONE[serverDelay(latency).delayState]
                      )}
                    >
                      {toServerDelayLabel(t, latency, latencyAvailable)}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
