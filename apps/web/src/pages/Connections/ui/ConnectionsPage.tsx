import { Activity, startTransition, useCallback, useId, useState, ViewTransition } from 'react';
import { useTranslation } from 'react-i18next';

import { CONNECTION_TAB, ConnectionState, useConnectionStream, type ConnectionRow } from '@entities/Connection';
import { useCloseAllConnections } from '@features/Connection/ConnectionClose';
import { usePanelAsSheet } from '@shared/lib/media';
import { Alert, AlertDescription, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';
import { ConnectionTable, useConnectionView, type ConnectionTableEmpty } from '@widgets/ConnectionTable';
import { PageHeader } from '@widgets/PageHeader';
import { RouteExplanation, RouteExplanationSheet } from '@widgets/RouteExplanation';

import { useConnectionsScreen } from '../lib';
import { ConnectionActions } from './ConnectionActions';
import { ConnectionExport } from './ConnectionExport';
import { ConnectionFacets } from './ConnectionFacets';
import { ConnectionSearch } from './ConnectionSearch';
import { ConnectionsEmpty } from './ConnectionsEmpty';
import { ConnectionsStreamStatus } from './ConnectionsStreamStatus';

/** Счётчик вкладки: тот же вид, что у вкладок разделов конфигурации. */
const TAB_COUNT = 'text-xs text-muted-foreground tabular-nums';

export function ConnectionsPage() {
  const { t } = useTranslation('pages/Connections');
  useConnectionStream();

  const view = useConnectionView();
  const screen = useConnectionsScreen(view.interval);
  const [explainedId, setExplainedId] = useState<string | null>(null);
  // Тот же идентификатор уходит в `aria-controls` раскрывшей панель строки.
  const explainPanelId = useId();
  const paused = ConnectionState.use.paused();
  const dropped = ConnectionState.use.dropped();
  const sampledAt = ConnectionState.use.sampledAt();
  const setPaused = ConnectionState.use.setPaused();
  const closeAll = useCloseAllConnections();
  const sheet = usePanelAsSheet();

  // Без Transition обновление срочное, и граница вокруг панели не анимируется.
  const onExplain = useCallback((id: string) => {
    startTransition(() => {
      setExplainedId((current) => (current === id ? null : id));
    });
  }, []);

  const onCloseExplanation = useCallback(() => {
    startTransition(() => {
      setExplainedId(null);
    });
  }, []);

  const onTogglePause = useCallback(() => {
    setPaused(!paused);
  }, [paused, setPaused]);

  const onCloseAll = useCallback(() => {
    closeAll.mutate();
  }, [closeAll]);

  const explainedHost = screen.active.rows.find((row) => row.id === explainedId)?.host ?? '';

  const renderEmpty = ({ filtered, reset }: ConnectionTableEmpty) => (
    <ConnectionsEmpty filtered={filtered} pending={sampledAt === null} onReset={reset} />
  );

  const renderFooter = (rows: ConnectionRow[]) => <ConnectionExport rows={rows} />;

  const search = <ConnectionSearch query={screen.query} onQueryChange={screen.setQuery} />;
  const facets = <ConnectionFacets screen={screen} />;

  return (
    <>
      <PageHeader title={t('section.connections', { ns: 'shared' })}>
        <ConnectionsStreamStatus paused={paused} interval={view.interval} />
        {dropped > 0 && (
          <p role='status' className='text-xs text-destructive'>
            {t('dropped', { count: dropped })}
          </p>
        )}
      </PageHeader>

      <Tabs
        value={screen.tab}
        onValueChange={(value) => {
          startTransition(() => {
            screen.setTab(value === CONNECTION_TAB.Closed ? CONNECTION_TAB.Closed : CONNECTION_TAB.Active);
          });
        }}
        className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'
      >
        <TabsList variant='line'>
          <TabsTrigger value={CONNECTION_TAB.Active}>
            {t('tab.active')}
            <span className={TAB_COUNT}>{screen.active.total}</span>
          </TabsTrigger>
          <TabsTrigger value={CONNECTION_TAB.Closed}>
            {t('tab.closed')}
            <span className={TAB_COUNT}>{screen.closed.total}</span>
          </TabsTrigger>
        </TabsList>
        {/* `default='none'`: обновления строк внутри вкладки — не её анимация. */}
        <TabsContent value={CONNECTION_TAB.Active} keepMounted className='flex min-h-0 grow flex-col'>
          <Activity mode={screen.tab === CONNECTION_TAB.Active ? 'visible' : 'hidden'}>
            <ViewTransition enter='fade-in' exit='fade-out' default='none'>
              {/* Ниже lg объяснение открывается листом, и в колонке остаётся
                  один список. Колонка прокручивается на низком экране, где
                  списку не хватает его минимальной высоты. */}
              <div className='flex min-h-0 grow flex-col gap-4 max-lg:overflow-y-auto lg:flex-row'>
                <ConnectionTable
                  rows={screen.active.rows}
                  total={screen.active.total}
                  closable
                  selectedId={explainedId}
                  explainPanelId={explainPanelId}
                  onExplain={onExplain}
                  search={search}
                  facets={facets}
                  footer={renderFooter}
                  empty={renderEmpty}
                  filtered={screen.filtered}
                  onReset={screen.reset}
                  view={view}
                  actions={
                    <ConnectionActions
                      paused={paused}
                      onTogglePause={onTogglePause}
                      closableCount={screen.active.total}
                      onCloseAll={onCloseAll}
                    />
                  }
                />

                {!sheet && explainedId !== null && (
                  <ViewTransition enter='panel-in' exit='panel-out'>
                    <RouteExplanation
                      key={explainedId}
                      id={explainPanelId}
                      connectionId={explainedId}
                      host={explainedHost}
                      onClose={onCloseExplanation}
                    />
                  </ViewTransition>
                )}

                {sheet && (
                  <RouteExplanationSheet
                    id={explainPanelId}
                    connectionId={explainedId}
                    host={explainedHost}
                    onClose={onCloseExplanation}
                  />
                )}
              </div>
            </ViewTransition>
          </Activity>
        </TabsContent>

        <TabsContent value={CONNECTION_TAB.Closed} keepMounted className='flex min-h-0 grow flex-col'>
          <Activity mode={screen.tab === CONNECTION_TAB.Closed ? 'visible' : 'hidden'}>
            <ViewTransition enter='fade-in' exit='fade-out' default='none'>
              <div className='flex min-h-0 grow flex-col gap-4'>
                <Alert>
                  <AlertDescription>{t('closedNote')}</AlertDescription>
                </Alert>

                <ConnectionTable
                  rows={screen.closed.rows}
                  total={screen.closed.total}
                  closable={false}
                  search={search}
                  facets={facets}
                  footer={renderFooter}
                  empty={renderEmpty}
                  filtered={screen.filtered}
                  onReset={screen.reset}
                  view={view}
                  actions={
                    <ConnectionActions
                      paused={paused}
                      onTogglePause={onTogglePause}
                      closableCount={null}
                      onCloseAll={onCloseAll}
                    />
                  }
                />
              </div>
            </ViewTransition>
          </Activity>
        </TabsContent>
      </Tabs>
    </>
  );
}
