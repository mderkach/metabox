import { useTrafficHistory } from '@entities/Daemon';
import { formatAge } from '@shared/lib/format';
import { SECTION_LABEL } from '@shared/lib/styles';
import { MS_IN_SECOND } from '@shared/lib/time';
import { Card, CardContent, CardHeader } from '@shared/ui';

import { DaemonTraffic } from './DaemonTraffic';

/** Сколько отсечек времени ставится на ось. */
const TICKS = 5;

/** По одной точке линию не проведёшь. */
const MIN_POINTS = 2;

/**
 * Часы берутся у браузера: точка приходит без времени, потому что у роутера
 * нет часов реального времени и до синхронизации NTP он стартует с эпохи.
 */
function toClockTicks(points: number, stepSeconds: number): string[] {
  const spanMs = points * stepSeconds * MS_IN_SECOND;
  const now = Date.now();

  return Array.from({ length: TICKS }, (_, index) => {
    const at = new Date(now - spanMs + (spanMs * index) / (TICKS - 1));

    return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  });
}

/** Трафик за всё время, что копил демон. Панель держит только последнюю минуту. */
export function DaemonHistory() {
  const history = useTrafficHistory();
  const points = history.data?.points ?? [];
  const step = history.data?.stepSeconds ?? 0;

  return (
    <Card className='gap-3'>
      <CardHeader className='flex flex-row items-baseline justify-between gap-3'>
        <h3 className={SECTION_LABEL}>Трафик за всё время</h3>
        {points.length >= MIN_POINTS && (
          <p className='text-xs text-muted-foreground'>{formatAge(points.length * step)} наблюдения</p>
        )}
      </CardHeader>

      <CardContent>
        {points.length < MIN_POINTS ? (
          <p className='flex h-24 items-center text-xs text-muted-foreground'>Демон копит историю</p>
        ) : (
          <DaemonTraffic
            samples={points}
            ticks={toClockTicks(points.length, step)}
            window={`за ${formatAge(points.length * step)}`}
          />
        )}
      </CardContent>
    </Card>
  );
}
