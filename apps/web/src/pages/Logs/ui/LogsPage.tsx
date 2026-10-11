import type { ParseKeys } from 'i18next';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DEFAULT_LOG_LEVEL,
  LOG_SOURCE,
  LOG_STREAM_STATUS,
  LogState,
  mergeLogEntries,
  useLogStream,
  useLogTail,
  type LogLevel,
  type LogStreamStatus,
} from '@entities/Log';
import { LogClearButton } from '@features/Log/LogClear';
import { formatDateTime } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Label,
  QueryFailure,
  SURFACE,
  SkeletonRows,
  Switch,
} from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';

import { LogsLevelSelect } from './LogsLevelSelect';
import { LogsList } from './LogsList';

const STATUS_VIEW: Readonly<Record<LogStreamStatus, { tone: string; label: ParseKeys<'pages/Logs'> }>> = {
  [LOG_STREAM_STATUS.Open]: { tone: 'text-signal-ok', label: 'stream.open' },
  [LOG_STREAM_STATUS.Connecting]: { tone: 'text-signal-warn', label: 'stream.connecting' },
  [LOG_STREAM_STATUS.Reconnecting]: { tone: 'text-signal-warn', label: 'stream.reconnecting' },
  [LOG_STREAM_STATUS.Closed]: { tone: 'text-signal-bad', label: 'stream.closed' },
};

const SOURCE_LABEL: Readonly<Record<string, ParseKeys<'pages/Logs'> | undefined>> = {
  [LOG_SOURCE.Logread]: 'source.logread',
  [LOG_SOURCE.File]: 'source.file',
};

/**
 * Лог sing-box: хвост запросом, дальше строки потоком. Уровень уходит и в
 * хвост, и в поток — отбирает демон, а не экран: на `info` строк `debug` в
 * панель не приходит вовсе.
 */
export function LogsPage() {
  const { t } = useTranslation('pages/Logs');
  const [level, setLevel] = useState<LogLevel>(DEFAULT_LOG_LEVEL);
  const [follow, setFollow] = useState(true);
  const followId = useId();
  const tail = useLogTail(level);
  const stream = useLogStream(level);
  const streamed = LogState.use.entries();
  const lost = LogState.use.lost();
  const status = LogState.use.status();
  const entries = useMemo(() => mergeLogEntries(tail.data?.entries ?? [], streamed), [tail.data, streamed]);
  const source = tail.data?.source ?? null;
  const since = tail.data?.since ?? null;
  const sourceKey = source === null ? undefined : SOURCE_LABEL[source];
  const sourceLabel = sourceKey === undefined ? t('source.other', { source }) : t(sourceKey);

  return (
    <>
      <PageHeader title={t('section.logs', { ns: 'shared' })}>
        <p role='status' className={cn('flex items-center gap-1.5 text-xs', STATUS_VIEW[status].tone)}>
          <span aria-hidden='true' className='size-2 rounded-full bg-current' />
          {t(STATUS_VIEW[status].label)}
        </p>
        {source !== null && <p className='text-xs text-muted-foreground'>{sourceLabel}</p>}
      </PageHeader>

      <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
        {status === LOG_STREAM_STATUS.Closed && (
          <Alert variant='destructive' className='max-sm:pr-2.5'>
            <TriangleAlert />
            <AlertTitle>{t('closed.title')}</AlertTitle>
            <AlertDescription>{t('closed.description')}</AlertDescription>
            <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
              <Button size='sm' variant='outline' onClick={stream.reconnect}>
                <RotateCw data-icon='inline-start' />
                {t('closed.reconnect')}
              </Button>
            </AlertAction>
          </Alert>
        )}

        {lost > 0 && (
          <Alert className='max-sm:pr-2.5'>
            <TriangleAlert />
            <AlertTitle>{t('lost.title', { count: lost })}</AlertTitle>
            <AlertDescription>{t('lost.description')}</AlertDescription>
            <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
              <Button size='sm' variant='outline' onClick={stream.reconnect}>
                {t('lost.reload')}
              </Button>
            </AlertAction>
          </Alert>
        )}

        <section className={cn('flex min-h-0 min-w-0 grow flex-col overflow-hidden', SURFACE)}>
          <div className='flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3.5 py-2.5'>
            <LogsLevelSelect level={level} onLevelChange={setLevel} />
            {/* Строка переключателя под пальцем высотой в его хит-область: иначе
                она наезжает на выбор уровня, когда тулбар переносится. */}
            <div className='flex items-center gap-2 pointer-coarse:min-h-11'>
              <Switch id={followId} checked={follow} onCheckedChange={setFollow} />
              <Label htmlFor={followId} className='text-sm'>
                {t('follow')}
              </Label>
            </div>
            <span className='grow' />
            <LogClearButton source={source} />
          </div>

          {tail.isPending && <SkeletonRows className='p-4' />}

          {tail.isLoadingError && (
            <div className='p-4'>
              <QueryFailure messageKey='source.logs' query={tail} />
            </div>
          )}

          {tail.isSuccess && entries.length === 0 && (
            <Empty className='grow'>
              <EmptyHeader>
                <EmptyTitle>{t('empty.title')}</EmptyTitle>
                <EmptyDescription className='max-w-prose text-pretty'>
                  {t('empty.description', { level })}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {entries.length > 0 && <LogsList entries={entries} follow={follow} />}

          <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3.5 py-2 text-xs text-muted-foreground'>
            <p>{t('footer.rows', { count: entries.length })}</p>
            {since !== null && <p>{t('footer.since', { time: formatDateTime(since) })}</p>}
          </div>
        </section>
      </div>
    </>
  );
}
