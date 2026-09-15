import { Download, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConnectionState, useConnectionCounts, useConnectionStream } from '@entities/Connection';
import { useCloseAllConnections } from '@features/Connection/ConnectionClose';
import { downloadConnections, EXPORT_FORMAT } from '@features/Connection/ConnectionExport';
import { FACET_ACTIVE, FACET_CLASS, FACET_IDLE, FACET_MORE } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import { Alert, AlertDescription, Badge, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';
import { ConnectionTable } from '@widgets/ConnectionTable';
import { RouteExplanation } from '@widgets/RouteExplanation';

import { CONNECTION_TAB, useConnectionsScreen } from '../lib';

/** Сколько устройств показать сразу: на роутере их бывает под три десятка. */
const VISIBLE_SOURCES = 8;

export function ConnectionsPage() {
  const { t } = useTranslation('pages/Connections');
  useConnectionStream();

  const screen = useConnectionsScreen();
  const [explainedId, setExplainedId] = useState<string | null>(null);
  const [allSources, setAllSources] = useState(false);
  const paused = ConnectionState.use.paused();
  const dropped = ConnectionState.use.dropped();
  const setPaused = ConnectionState.use.setPaused();
  const counts = useConnectionCounts();
  const closeAll = useCloseAllConnections();

  const onExplain = useCallback((id: string) => {
    setExplainedId((current) => (current === id ? null : id));
  }, []);

  const onCloseExplanation = useCallback(() => {
    setExplainedId(null);
  }, []);

  return (
    <>
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-6'>
        <h1 className='text-2xl font-semibold'>{t('title')}</h1>
        <p className='text-xs text-muted-foreground'>{t('subtitle')}</p>
        {dropped > 0 && (
          <p role='status' className='text-xs text-destructive'>
            {t('dropped', { count: dropped })}
          </p>
        )}
        <span className='grow' />
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setPaused(!paused);
          }}
        >
          {paused ? t('resume') : t('pause')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={screen.rows.length === 0}
          onClick={() => {
            downloadConnections(screen.rows, EXPORT_FORMAT.Csv, new Date());
          }}
        >
          <Download />
          CSV
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={screen.rows.length === 0}
          onClick={() => {
            downloadConnections(screen.rows, EXPORT_FORMAT.Json, new Date());
          }}
        >
          <Download />
          JSON
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            closeAll.mutate();
          }}
        >
          {t('closeAll')}
        </Button>
      </header>

      <Tabs
        value={screen.tab}
        onValueChange={(value) => {
          screen.setTab(value === CONNECTION_TAB.Closed ? CONNECTION_TAB.Closed : CONNECTION_TAB.Active);
        }}
        className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'
      >
        <TabsList variant='line'>
          <TabsTrigger value={CONNECTION_TAB.Active}>
            {t('tab.active')}
            <Badge variant='secondary'>{counts.active}</Badge>
          </TabsTrigger>
          <TabsTrigger value={CONNECTION_TAB.Closed}>
            {t('tab.closed')}
            <Badge variant='secondary'>{counts.closed}</Badge>
          </TabsTrigger>
        </TabsList>

        <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2'>
          <div className='relative w-full max-w-80'>
            <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={screen.query}
              onChange={(event) => {
                screen.setQuery(event.target.value);
              }}
              placeholder={t('search.placeholder')}
              className='pl-8'
              aria-label={t('search.label')}
            />
          </div>

          <ul aria-label={t('sources.label')} className='flex min-w-0 flex-wrap items-center gap-1.5'>
            <li>
              <button
                type='button'
                aria-pressed={screen.source === null}
                onClick={() => {
                  screen.setSource(null);
                }}
                className={cn(FACET_CLASS, screen.source === null ? FACET_ACTIVE : FACET_IDLE)}
              >
                {t('sources.all')}
                <span className='font-mono tabular-nums'>{screen.total}</span>
              </button>
            </li>
            {(allSources ? screen.sources : screen.sources.slice(0, VISIBLE_SOURCES)).map((group) => (
              <li key={group.source}>
                <button
                  type='button'
                  aria-pressed={screen.source === group.source}
                  onClick={() => {
                    screen.setSource(screen.source === group.source ? null : group.source);
                  }}
                  className={cn(FACET_CLASS, screen.source === group.source ? FACET_ACTIVE : FACET_IDLE)}
                >
                  <span className='font-mono'>{group.source}</span>
                  <span className='font-mono tabular-nums'>{group.count}</span>
                </button>
              </li>
            ))}
            {screen.sources.length > VISIBLE_SOURCES && (
              <li>
                <button
                  type='button'
                  aria-expanded={allSources}
                  onClick={() => {
                    setAllSources((current) => !current);
                  }}
                  className={cn(FACET_CLASS, FACET_MORE)}
                >
                  {allSources
                    ? t('sources.collapse')
                    : t('sources.more', { count: screen.sources.length - VISIBLE_SOURCES })}
                </button>
              </li>
            )}
          </ul>

          {screen.filtered && (
            <p role='status' className='text-xs text-muted-foreground'>
              {t('shown', {
                shown: t('count.connection', { ns: 'shared', count: screen.rows.length }),
                total: screen.total,
              })}
            </p>
          )}
        </div>

        <TabsContent value={CONNECTION_TAB.Active} className='flex min-h-0 grow flex-col gap-4 lg:flex-row'>
          <ConnectionTable
            rows={screen.rows}
            closable
            selectedId={explainedId}
            onExplain={onExplain}
            empty={<EmptyState filtered={screen.filtered} onReset={screen.reset} />}
          />

          {explainedId !== null && (
            <RouteExplanation key={explainedId} connectionId={explainedId} onClose={onCloseExplanation} />
          )}
        </TabsContent>

        <TabsContent value={CONNECTION_TAB.Closed} className='flex min-h-0 grow flex-col gap-4'>
          <Alert>
            <AlertDescription>{t('closedNote')}</AlertDescription>
          </Alert>

          <ConnectionTable
            rows={screen.rows}
            closable={false}
            empty={<EmptyState filtered={screen.filtered} onReset={screen.reset} />}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  const { t } = useTranslation('pages/Connections');
  if (filtered) {
    return (
      <div className='flex flex-col items-center gap-2'>
        <p className='text-sm text-muted-foreground'>{t('notFound')}</p>
        <Button variant='outline' size='sm' onClick={onReset}>
          {t('resetFilter')}
        </Button>
      </div>
    );
  }

  return <p className='text-sm text-muted-foreground'>{t('empty')}</p>;
}
