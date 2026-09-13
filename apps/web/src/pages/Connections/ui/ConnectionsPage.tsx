import { Download, Search } from 'lucide-react';
import { useCallback, useState } from 'react';

import { ConnectionState, useConnectionCounts, useConnectionStream } from '@entities/Connection';
import { useCloseAllConnections } from '@features/Connection/ConnectionClose';
import { downloadConnections, EXPORT_FORMAT } from '@features/Connection/ConnectionExport';
import { plural } from '@shared/lib/format';
import { FACET_ACTIVE, FACET_CLASS, FACET_IDLE, FACET_MORE } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import { Alert, AlertDescription, Badge, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';
import { ConnectionTable } from '@widgets/ConnectionTable';
import { RouteExplanation } from '@widgets/RouteExplanation';

import { CONNECTION_TAB, useConnectionsScreen } from '../lib';

const CONNECTION_FORMS = ['соединение', 'соединения', 'соединений'] as const;

/** Сколько устройств показать сразу: на роутере их бывает под три десятка. */
const VISIBLE_SOURCES = 8;

export function ConnectionsPage() {
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
        <h1 className='text-2xl font-semibold'>Соединения</h1>
        <p className='text-xs text-muted-foreground'>поток идёт снапшотами раз в секунду</p>
        {dropped > 0 && (
          <p role='status' className='text-xs text-destructive'>
            снапшотов не разобрано: {dropped}
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
          {paused ? 'Продолжить' : 'Пауза'}
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
          Закрыть все
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
            Активные
            <Badge variant='secondary'>{counts.active}</Badge>
          </TabsTrigger>
          <TabsTrigger value={CONNECTION_TAB.Closed}>
            Закрытые
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
              placeholder='Хост, источник, правило или узел'
              className='pl-8'
              aria-label='Поиск по соединениям'
            />
          </div>

          <ul aria-label='Устройства' className='flex min-w-0 flex-wrap items-center gap-1.5'>
            <li>
              <button
                type='button'
                aria-pressed={screen.source === null}
                onClick={() => {
                  screen.setSource(null);
                }}
                className={cn(FACET_CLASS, screen.source === null ? FACET_ACTIVE : FACET_IDLE)}
              >
                Все
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
                  {allSources ? 'Свернуть' : `Ещё ${String(screen.sources.length - VISIBLE_SOURCES)}`}
                </button>
              </li>
            )}
          </ul>

          {screen.filtered && (
            <p role='status' className='text-xs text-muted-foreground'>
              {plural(screen.rows.length, CONNECTION_FORMS)} из {screen.total}
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
            <AlertDescription>
              Закрытые собирает панель: рантайм отдаёт только живые, и соединение, пропавшее между снапшотами, иначе
              исчезло бы без следа. История держится, пока открыта вкладка.
            </AlertDescription>
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
  if (filtered) {
    return (
      <div className='flex flex-col items-center gap-2'>
        <p className='text-sm text-muted-foreground'>Ничего не нашлось по этому запросу.</p>
        <Button variant='outline' size='sm' onClick={onReset}>
          Сбросить отбор
        </Button>
      </div>
    );
  }

  return (
    <p className='text-sm text-muted-foreground'>
      Соединений нет. Поток идёт: строки появятся, как только трафик пойдёт через sing-box.
    </p>
  );
}
