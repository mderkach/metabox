import { useTranslation } from 'react-i18next';

import { DELAY_FAST, useProxies } from '@entities/Proxy';
import { useTestProxyDelays } from '@features/Proxy/ProxyDelay';
import {
  Button,
  CARD_TITLE,
  Card,
  CardContent,
  CardHeader,
  Empty,
  EMPTY_INLINE,
  EmptyDescription,
  EmptyHeader,
  QueryFailure,
  SkeletonRows,
  ValueAxis,
} from '@shared/ui';

import { toDelayLabel } from '../lib/ProxyLatency.delay';
import { toSelected } from '../model/ProxyLatency.model';
import { SCALE_CEILING, SCALE } from '../model/ProxyLatency.scale';
import { ProxyLatencyMeter } from './ProxyLatencyMeter';

/** The measurement is made by sing-box: from the browser the channel to the panel would be measured. */
export function ProxyLatency({
  onTested,
}: {
  /** The measurement passed for all selected nodes: a failure in at least one shows an error toast. */
  onTested: () => void;
}) {
  const { t } = useTranslation('widgets/ProxyLatency');
  const proxies = useProxies();
  const delay = useTestProxyDelays();
  const selected = proxies.data === undefined ? [] : toSelected(proxies.data.groups);

  return (
    <Card className='gap-3'>
      <CardHeader className='flex flex-row flex-wrap items-baseline gap-x-2.5 gap-y-1'>
        <h3 className={CARD_TITLE}>{t('title')}</h3>
        {/* The ceiling here is constant, while in neighboring summary panels it follows
            the series leader: without a named scale the lengths would read the same. It goes
            under the title row, otherwise it pushes the button onto a line of its own. */}
        <p className='order-last basis-full text-xs text-muted-foreground'>
          {t('scale', { ceiling: SCALE_CEILING, fast: DELAY_FAST })}
        </p>
        <span className='grow' />
        <Button
          variant='outline'
          size='sm'
          disabled={selected.length === 0 || delay.isPending}
          onClick={() => {
            void delay.test(selected.map((entry) => entry.node.name)).then(function announceTested(success) {
              if (success) onTested();
            });
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
                  <ProxyLatencyMeter node={entry.node} />
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
