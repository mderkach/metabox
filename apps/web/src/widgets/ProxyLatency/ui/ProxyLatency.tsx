import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useOutboundMetadata, useProxies, type useProxyLatency } from '@entities/Proxy';
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

import { toSelected } from '../model/ProxyLatency.model';
import { SCALE_CEILING, SCALE } from '../model/ProxyLatency.scale';
import { ProxyLatencyRow } from './ProxyLatencyRow';

/** The measurement is made by sing-box: from the browser the channel to the panel would be measured. */
export function ProxyLatency({
  latency,
  onTested,
  placeholder,
}: {
  latency: ReturnType<typeof useProxyLatency>;
  /** The measurement passed for all requested nodes: a failure in at least one shows an error toast. */
  onTested: () => void;
  /** Replaces the latencies and disables the test when the page knows they cannot be measured now. */
  placeholder?: ReactNode;
}) {
  const { t } = useTranslation('widgets/ProxyLatency');
  const proxies = useProxies();
  const outboundMetadata = useOutboundMetadata();
  const metadata = outboundMetadata.data;
  const delay = useTestProxyDelays();
  const unavailable = latency.data?.available === false;
  const selected = proxies.data === undefined ? [] : toSelected(proxies.data);
  const [testing, setTesting] = useState<{ names: string[]; batch: boolean } | null>(null);

  async function test(names: string[], batch: boolean): Promise<void> {
    setTesting({ names, batch });

    try {
      if (await delay.test(names)) onTested();
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card className='gap-3'>
      <CardHeader className='flex flex-row flex-wrap items-baseline gap-x-2.5 gap-y-1'>
        <h3 className={CARD_TITLE}>{t('title')}</h3>
        {/* The ceiling here is constant, while in neighboring summary panels it follows
            the series leader: without a named scale the lengths would read the same. It goes
            under the title row, otherwise it pushes the button onto a line of its own. */}
        <p className='order-last basis-full text-xs text-muted-foreground'>{t('scale', { ceiling: SCALE_CEILING })}</p>
        <span className='grow' />
        <Button
          variant='outline'
          size='sm'
          disabled={placeholder !== undefined || selected.length === 0 || unavailable || delay.isPending}
          onClick={() => {
            void test(
              selected.map((entry) => entry.node.name),
              true
            );
          }}
        >
          {delay.isPending && testing?.batch === true
            ? t('delay.testing', { ns: 'shared' })
            : t('delay.test', { ns: 'shared' })}
        </Button>
      </CardHeader>

      <CardContent>
        {placeholder}
        {placeholder === undefined && proxies.isPending && <SkeletonRows rows={2} className='p-0' />}
        {placeholder === undefined && proxies.isLoadingError && (
          <QueryFailure messageKey='source.proxies' query={proxies} />
        )}
        {placeholder === undefined && selected.length > 0 && latency.isLoadingError && (
          <QueryFailure messageKey='source.latency' query={latency} />
        )}
        {placeholder === undefined && proxies.isSuccess && selected.length === 0 && (
          <Empty className={EMPTY_INLINE}>
            <EmptyHeader>
              <EmptyDescription>{t('empty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {placeholder === undefined && selected.length > 0 && (
          <div className='flex flex-col gap-2.5'>
            <ul className='flex flex-col gap-2.5'>
              {selected.map((entry) => (
                <ProxyLatencyRow
                  key={entry.node.name}
                  name={entry.node.name}
                  group={entry.group}
                  label={metadata?.get(entry.node.name)?.label}
                  manualNorm={metadata?.get(entry.node.name)?.normMs}
                  legacyNorm={outboundMetadata.isError && metadata === undefined}
                  latency={latency.data?.servers.get(entry.node.name)}
                  available={!unavailable && !latency.isLoadingError}
                  testing={delay.isPending && testing?.names.includes(entry.node.name) === true}
                  busy={delay.isPending || unavailable}
                  onTest={() => {
                    void test([entry.node.name], false);
                  }}
                />
              ))}
            </ul>
            <ValueAxis scale={SCALE} format={(value) => t('delay.value', { ns: 'shared', value })} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
