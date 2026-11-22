import { useTranslation } from 'react-i18next';

import { LATENCY_LEVEL, toDelayLabel, toLatencyReading, toServerDelayLabel, type ServerLatency } from '@entities/Proxy';
import { Button } from '@shared/ui';

import { ProxyLatencyMeter } from './ProxyLatencyMeter';

export function ProxyLatencyRow({
  name,
  group,
  label,
  manualNorm,
  legacyNorm,
  latency,
  available,
  testing,
  busy,
  onTest,
}: {
  name: string;
  group?: string | undefined;
  label?: string | undefined;
  manualNorm?: number | undefined;
  legacyNorm: boolean;
  latency: ServerLatency | undefined;
  available: boolean;
  testing: boolean;
  busy: boolean;
  onTest: () => void;
}) {
  const { t, i18n } = useTranslation('widgets/ProxyLatency');
  const recent = latency?.recent ?? [];
  const { usual, level, meter } = toLatencyReading(latency, manualNorm, legacyNorm);

  return (
    <li className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-xs'>
      <p className='min-w-0 wrap-anywhere'>
        {group !== undefined && <span className='text-muted-foreground'>{group} · </span>}
        {label !== undefined && <span className='font-medium'>{label} </span>}
        <span className='font-mono'>{name}</span>
      </p>
      <Button
        variant='ghost'
        size='sm'
        aria-disabled={busy}
        aria-busy={testing}
        className='aria-disabled:opacity-50'
        aria-label={t('testServer', { name })}
        onClick={() => {
          if (!busy) onTest();
        }}
      >
        {testing ? t('delay.testing', { ns: 'shared' }) : t('delay.test', { ns: 'shared' })}
      </Button>
      <p className='col-span-2 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground tabular-nums'>
        <span>{toServerDelayLabel(t, latency, available)}</span>
        {usual !== null && (
          <span>{t(manualNorm === undefined ? 'usualComputed' : 'usualManual', { value: usual })}</span>
        )}
        {level === LATENCY_LEVEL.AboveNorm && <span className='text-signal-warn'>{t('aboveNorm')}</span>}
        {level === LATENCY_LEVEL.AboveCeiling && <span className='text-signal-warn'>{t('aboveCeiling')}</span>}
      </p>
      <ProxyLatencyMeter node={meter} />
      {recent.length > 0 && (
        <details aria-label={t('historyServer', { name })} className='col-span-2'>
          <summary className='w-fit cursor-pointer rounded-sm py-1 text-muted-foreground select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11'>
            {t('history')}
          </summary>
          <ul className='space-y-1 text-muted-foreground tabular-nums'>
            {recent.toReversed().map((point, index) => (
              <li key={`${point.at}:${index}`} className='flex flex-wrap justify-between gap-x-2'>
                <time dateTime={point.at}>
                  {new Date(point.at).toLocaleString(i18n.resolvedLanguage, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>
                <span>
                  {point.delayMS === null
                    ? t('delay.timedOut', { ns: 'shared' })
                    : toDelayLabel(t, { delay: point.delayMS })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
