import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { DELAY_STATE, DELAY_TIMEOUT, useProxies, type ProxyGroup, type ProxyNode } from '@entities/Proxy';
import { useTestProxyDelay } from '@features/Proxy/ProxyDelay';
import { toShare } from '@shared/lib/chart';
import { SECTION_LABEL } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import { Button, Card, CardContent, CardHeader } from '@shared/ui';

const DELAY_TONE: Readonly<Record<string, string>> = {
  [DELAY_STATE.Fast]: 'bg-signal-ok',
  [DELAY_STATE.Slow]: 'bg-signal-warn',
  [DELAY_STATE.Failed]: 'bg-signal-bad',
  [DELAY_STATE.Unknown]: 'bg-signal-idle',
};

const PERCENT = 100;

/** Потолок абсолютной шкалы, миллисекунды: втрое выше порога «быстрый». */
const SCALE_CEILING = 900;

interface GroupDelay {
  group: string;
  node: ProxyNode;
}

/** Группа, выбравшая другую группу, пропускается: замер у них один. */
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
    return t('node.untested');
  }

  // Отказ соединиться, а не задержка: рантайм отдаёт его числом 65535.
  return node.delay >= DELAY_TIMEOUT ? t('node.timedOut') : t('node.delay', { value: node.delay });
}

function toMeter(node: ProxyNode): number {
  if (node.delay === null) {
    return 0;
  }

  return node.delay >= DELAY_TIMEOUT ? 1 : toShare(Math.min(node.delay, SCALE_CEILING), SCALE_CEILING);
}

/** Замер делает sing-box: из браузера мерялся бы канал до панели. */
export function ProxyLatency() {
  const { t } = useTranslation('widgets/ProxyLatency');
  const proxies = useProxies();
  const delay = useTestProxyDelay();
  const selected = proxies.data === undefined ? [] : toSelected(proxies.data.groups);

  return (
    <Card className='gap-3'>
      <CardHeader className='flex flex-row items-baseline justify-between gap-3'>
        <h3 className={SECTION_LABEL}>{t('title')}</h3>
        <Button
          variant='outline'
          size='sm'
          disabled={selected.length === 0 || delay.isPending}
          onClick={() => {
            for (const entry of selected) {
              delay.mutate(entry.node.name);
            }
          }}
        >
          {delay.isPending ? t('testing') : t('test')}
        </Button>
      </CardHeader>

      <CardContent>
        {selected.length === 0 ? (
          <p className='text-xs text-muted-foreground'>{proxies.isError ? t('unread') : t('empty')}</p>
        ) : (
          <ul className='flex flex-col gap-2.5'>
            {selected.map((entry) => (
              <li key={entry.group} className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1'>
                <p className='truncate text-xs' title={`${entry.group} · ${entry.node.name}`}>
                  {entry.group}
                  <span className='text-muted-foreground'> · </span>
                  <span className='font-mono'>{entry.node.name}</span>
                </p>
                <p className='font-mono text-xs text-muted-foreground tabular-nums'>{toDelayLabel(t, entry.node)}</p>
                <span className='col-span-2 block h-1.5 overflow-hidden rounded-full bg-meter-track'>
                  <span
                    className={cn('block h-full rounded-full', DELAY_TONE[entry.node.delayState])}
                    style={{ width: `${String(toMeter(entry.node) * PERCENT)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
