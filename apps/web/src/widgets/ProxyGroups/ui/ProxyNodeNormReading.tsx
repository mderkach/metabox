import { DELAY_STATE, LATENCY_CEILING_MS, type toLatencyReading } from '@entities/Proxy';

import type { ProxyNodeDiagnosticInfo } from './ProxyNodeDiagnostic';

import layout from './ProxyNodeLayout.module.css';

const PERCENT = 100;

export function ProxyNodeNormReading({
  reading,
  diagnostic,
}: {
  reading: ReturnType<typeof toLatencyReading>;
  diagnostic: ProxyNodeDiagnosticInfo['status'];
}) {
  let state = reading.meter.delayState;
  if (diagnostic !== undefined) state = diagnostic.failed === true ? DELAY_STATE.Failed : DELAY_STATE.Unknown;
  const delay = diagnostic === undefined && state !== DELAY_STATE.Failed ? reading.meter.delay : null;
  const scale = Math.max(LATENCY_CEILING_MS, delay ?? 0, reading.usual ?? 0);

  return (
    <div data-slot='proxy-node-reading' className={`${layout.reading} hidden min-[1101px]:block`}>
      <div
        aria-hidden='true'
        data-slot='proxy-node-meter'
        data-state={state}
        className='relative h-1.5 min-w-0 rounded-full bg-meter-track'
      >
        {delay !== null && (
          <span
            data-slot='proxy-node-meter-fill'
            className='absolute inset-y-0 left-0 rounded-full bg-signal-ok/35'
            style={{ width: `${String((delay / scale) * PERCENT)}%` }}
          />
        )}
        {reading.usual !== null && (
          <span
            data-slot='proxy-node-norm-marker'
            data-value={reading.usual}
            className='absolute inset-y-[-0.125rem] border-s border-foreground'
            style={{ left: `${String((reading.usual / scale) * PERCENT)}%` }}
          />
        )}
      </div>
    </div>
  );
}
