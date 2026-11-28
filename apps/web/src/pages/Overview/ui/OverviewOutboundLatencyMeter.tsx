import { LATENCY_CEILING_MS } from '@entities/Proxy';

const PERCENT = 100;

export function OverviewOutboundLatencyMeter({ delay, usual }: { delay: number; usual: number }) {
  const scale = Math.max(LATENCY_CEILING_MS, delay, usual);

  return (
    <div aria-hidden='true' className='relative my-1.5 hidden h-1.5 rounded-full bg-meter-track lg:block'>
      <span className='block h-full rounded-full bg-signal-ok/35' style={{ width: `${(usual / scale) * PERCENT}%` }} />
      <span
        className='absolute inset-y-[-0.125rem] border-s-2 border-foreground'
        style={{ insetInlineStart: `${(delay / scale) * PERCENT}%` }}
      />
    </div>
  );
}
