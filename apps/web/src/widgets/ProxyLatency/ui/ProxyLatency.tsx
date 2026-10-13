import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { DELAY_FAST, DELAY_STATE, DELAY_TIMEOUT, useProxies, type ProxyGroup, type ProxyNode } from '@entities/Proxy';
import { useTestProxyDelay } from '@features/Proxy/ProxyDelay';
import { toShare, toValueScale } from '@shared/lib/chart';
import { cn } from '@shared/lib/utils';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Empty,
  EMPTY_INLINE,
  EmptyDescription,
  EmptyHeader,
  QueryFailure,
  SECTION_LABEL,
  SkeletonRows,
  ValueAxis,
} from '@shared/ui';

const DELAY_TONE: Readonly<Record<string, string>> = {
  [DELAY_STATE.Fast]: 'bg-signal-ok',
  [DELAY_STATE.Slow]: 'bg-signal-warn',
  [DELAY_STATE.Failed]: 'bg-signal-bad',
  [DELAY_STATE.Unknown]: 'bg-signal-idle',
};

const PERCENT = 100;

/** Ticks at thirds of the ceiling: the first of them is the "fast" threshold. */
const SCALE_INTERVALS = 3;

/** Absolute scale ceiling, milliseconds: three times the "fast" threshold. */
const SCALE_CEILING = DELAY_FAST * SCALE_INTERVALS;
const SCALE = toValueScale(SCALE_CEILING, [DELAY_FAST]);

interface GroupDelay {
  group: string;
  node: ProxyNode;
}

/** A group that selected another group is skipped: there is one measurement for them. */
function toSelected(groups: ProxyGroup[]): GroupDelay[] {
  const names = new Set(groups.map((group) => group.name));

  return groups.flatMap((group) => {
    if (group.now !== null && names.has(group.now)) {
      return [];
    }

    const node = group.nodes.find((candidate) => candidate.name === group.now);

    return node === undefined ? [] : [{ group: group.name, node }];
  });
}

function toDelayLabel(t: TFunction<'widgets/ProxyLatency'>, node: ProxyNode): string {
  if (node.delay === null) {
    return t('delay.untested', { ns: 'shared' });
  }

  // A connection failure, not a latency: the runtime returns it as the number 65535.
  return node.delay >= DELAY_TIMEOUT
    ? t('delay.timedOut', { ns: 'shared' })
    : t('delay.value', { ns: 'shared', value: node.delay });
}

/** Bar length is the share of the scale ceiling; an unchecked node gets no bar at all. */
function toMeter(node: ProxyNode): number | null {
  if (node.delay === null) {
    return null;
  }

  return node.delay >= DELAY_TIMEOUT ? 1 : toShare(Math.min(node.delay, SCALE_CEILING), SCALE_CEILING);
}

/** The measurement is made by sing-box: from the browser the channel to the panel would be measured. */
export function ProxyLatency({
  onTested,
}: {
  /** The measurement passed for all selected nodes: a failure in at least one shows an error toast. */
  onTested: () => void;
}) {
  const { t } = useTranslation('widgets/ProxyLatency');
  const proxies = useProxies();
  const delay = useTestProxyDelay();
  const selected = proxies.data === undefined ? [] : toSelected(proxies.data.groups);

  return (
    <Card className='gap-3'>
      <CardHeader className='flex flex-row flex-wrap items-baseline gap-x-2.5 gap-y-1'>
        <h3 className={SECTION_LABEL}>{t('title')}</h3>
        {/* The ceiling here is constant, while in neighboring summary panels it follows
            the series leader: without a named scale the lengths would read the same. */}
        <p className='text-xs text-muted-foreground'>{t('scale', { ceiling: SCALE_CEILING, fast: DELAY_FAST })}</p>
        <span className='grow' />
        <Button
          variant='outline'
          size='sm'
          disabled={selected.length === 0 || delay.isPending}
          onClick={() => {
            // The `mutate` callback fires only for the last call, so
            // the announcement waits for all measurements at once, not for the last one started.
            void Promise.allSettled(selected.map(async (entry) => delay.mutateAsync(entry.node.name))).then(
              function announceTested(results) {
                if (results.every((result) => result.status === 'fulfilled')) {
                  onTested();
                }
              }
            );
          }}
        >
          {delay.isPending ? t('delay.testing', { ns: 'shared' }) : t('delay.test', { ns: 'shared' })}
        </Button>
      </CardHeader>

      <CardContent>
        {proxies.isPending && <SkeletonRows rows={2} className='p-0' />}
        {proxies.isLoadingError && <QueryFailure messageKey='source.proxies' query={proxies} />}
        {proxies.isSuccess && selected.length === 0 && (
          <Empty className={EMPTY_INLINE}>
            <EmptyHeader>
              <EmptyDescription>{t('empty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {selected.length > 0 && (
          <div className='flex flex-col gap-2.5'>
            <ul className='flex flex-col gap-2.5'>
              {selected.map((entry) => (
                <li key={entry.group} className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1'>
                  <p className='truncate text-xs' title={`${entry.group} · ${entry.node.name}`}>
                    {entry.group}
                    <span className='text-muted-foreground'> · </span>
                    <span className='font-mono'>{entry.node.name}</span>
                  </p>
                  <p className='font-mono text-xs text-muted-foreground tabular-nums'>{toDelayLabel(t, entry.node)}</p>
                  <Meter node={entry.node} />
                </li>
              ))}
            </ul>
            <ValueAxis scale={SCALE} format={(value) => t('delay.value', { ns: 'shared', value })} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Latency bar. An unchecked node gets an empty dashed track:
 * a solid track with zero fill reads as "zero milliseconds", that is,
 * as the fastest node in the list.
 */
function Meter({ node }: { node: ProxyNode }) {
  const share = toMeter(node);

  if (share === null) {
    return <span className='col-span-2 block h-1.5 rounded-full border border-dashed border-border' />;
  }

  return (
    <span className='col-span-2 block h-1.5 overflow-hidden rounded-full bg-meter-track'>
      <span
        className={cn('block h-full rounded-full', DELAY_TONE[node.delayState])}
        style={{ width: `${String(share * PERCENT)}%` }}
      />
    </span>
  );
}
