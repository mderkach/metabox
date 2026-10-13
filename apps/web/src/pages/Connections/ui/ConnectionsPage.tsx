import { Activity, startTransition, useCallback, useId, useMemo, useState, ViewTransition } from 'react';
import { useTranslation } from 'react-i18next';

import { CONNECTION_TAB, ConnectionState, useConnectionStream, type ConnectionRow } from '@entities/Connection';
import { useCloseAllConnections } from '@features/Connection/ConnectionClose';
import { usePanelAsSheet } from '@shared/lib/media';
import { useLiveRegion } from '@shared/lib/useLiveRegion';
import {
  Alert,
  AlertDescription,
  LiveRegion,
  SidePanelLayout,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';
import { ConnectionTable, useConnectionView, type ConnectionTableEmpty } from '@widgets/ConnectionTable';
import { PageHeader } from '@widgets/PageHeader';
import { RouteExplanation, RouteExplanationSheet } from '@widgets/RouteExplanation';

import { useConnectionsScreen, useWhileVisible } from '../lib';
import { ConnectionActions } from './ConnectionActions';
import { ConnectionExport } from './ConnectionExport';
import { ConnectionFacets } from './ConnectionFacets';
import { ConnectionSearch } from './ConnectionSearch';
import { ConnectionsEmpty } from './ConnectionsEmpty';
import { ConnectionsStreamStatus } from './ConnectionsStreamStatus';

/** Tab counter: the same look as for the configuration section tabs. */
const TAB_COUNT = 'text-xs text-muted-foreground tabular-nums';

export function ConnectionsPage() {
  const { t } = useTranslation('pages/Connections');
  useConnectionStream();

  const view = useConnectionView();
  const screen = useConnectionsScreen(view.interval);
  const [explainedId, setExplainedId] = useState<string | null>(null);
  // The same identifier goes into `aria-controls` of the row that expanded the panel.
  const explainPanelId = useId();
  const paused = ConnectionState.use.paused();
  const dropped = ConnectionState.use.dropped();
  const evicted = ConnectionState.use.evicted();
  // Both overflow numbers are from the store of one moment: a thinned table
  // output at a slow interval lags the evicted counter.
  const kept = ConnectionState.use.closed().length;
  const sampledAt = ConnectionState.use.sampledAt();
  const setPaused = ConnectionState.use.setPaused();
  const closeAll = useCloseAllConnections();
  const sheet = usePanelAsSheet();
  // A row leaves the list silently: one area per screen announces to a screen
  // reader that the connection is closed.
  const { message, announce } = useLiveRegion();

  const onExplain = useCallback((id: string) => {
    setExplainedId((current) => (current === id ? null : id));
  }, []);

  const onCloseExplanation = useCallback(() => {
    setExplainedId(null);
  }, []);

  const onTogglePause = useCallback(() => {
    setPaused(!paused);
  }, [paused, setPaused]);

  const onCloseAll = useCallback(() => {
    closeAll.mutate(undefined, {
      onSuccess: () => {
        announce(t('announce.closedAll'));
      },
    });
  }, [announce, closeAll, t]);

  const onClosed = useCallback(() => {
    announce(t('announce.closed'));
  }, [announce, t]);

  const explained = screen.active.rows.find((row) => row.id === explainedId);
  const explainedHost = explained?.host ?? '';
  const explainedSource = explained?.source ?? '';
  const activeShown = screen.tab === CONNECTION_TAB.Active;
  const closedShown = screen.tab === CONNECTION_TAB.Closed;
  const pending = sampledAt === null;

  // Tab bodies are memoized and callbacks are passed to them stable: otherwise
  // a hidden tab would be redrawn on every tick for a new function reference.
  const renderEmpty = useCallback(
    ({ filtered, reset }: ConnectionTableEmpty) => (
      <ConnectionsEmpty filtered={filtered} pending={pending} onReset={reset} />
    ),
    [pending]
  );

  const { sourceLabel } = screen;
  const renderFooter = useCallback(
    (rows: ConnectionRow[]) => <ConnectionExport rows={rows} sourceLabel={sourceLabel} />,
    [sourceLabel]
  );

  // The closed footer names the evicted ones; while the tab is hidden the numbers stand.
  const keptShown = useWhileVisible(kept, closedShown);
  const evictedShown = useWhileVisible(evicted, closedShown);
  const closedOverflow = useMemo(
    () => evictedShown > 0 && <p>{t('closedOverflow', { shown: keptShown, total: keptShown + evictedShown })}</p>,
    [evictedShown, keptShown, t]
  );

  return (
    <>
      <PageHeader title={t('section.connections', { ns: 'shared' })}>
        <ConnectionsStreamStatus paused={paused} />
        {dropped > 0 && (
          <p role='status' className='text-xs text-destructive'>
            {t('dropped', { count: dropped })}
          </p>
        )}
      </PageHeader>

      <LiveRegion message={message} />

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
            <span className={TAB_COUNT}>{screen.counts.active}</span>
          </TabsTrigger>
          <TabsTrigger value={CONNECTION_TAB.Closed}>
            {t('tab.closed')}
            <span className={TAB_COUNT}>{screen.counts.closed}</span>
          </TabsTrigger>
        </TabsList>

        {closedShown && (
          <Alert>
            <AlertDescription>{t('closedNote')}</AlertDescription>
          </Alert>
        )}

        {/* Below lg the explanation opens as a sheet, and one list remains
            in the column. The column scrolls on a short screen, where the list
            lacks its minimum height. */}
        <SidePanelLayout.Root
          open={!sheet && activeShown && explainedId !== null}
          className='min-h-0 grow max-lg:overflow-y-auto'
        >
          {/* Search, facets, view and actions are one toolbar for both
              tabs: only what a tab has of its own remains under `Activity`. */}
          <SidePanelLayout.Main>
            <ConnectionTable.Root>
              <ConnectionTable.Toolbar
                view={view}
                search={<ConnectionSearch query={screen.query} onQueryChange={screen.setQuery} />}
                facets={<ConnectionFacets screen={screen} />}
                actions={
                  <ConnectionActions
                    paused={paused}
                    onTogglePause={onTogglePause}
                    closableCount={activeShown ? screen.counts.active : null}
                    onCloseAll={onCloseAll}
                  />
                }
              />

              {/* `default='none'`: row updates inside a tab are not its animation. */}
              <TabsContent value={CONNECTION_TAB.Active} keepMounted className='flex min-h-0 grow flex-col'>
                <Activity mode={activeShown ? 'visible' : 'hidden'}>
                  <ViewTransition enter='fade-in' exit='fade-out' default='none'>
                    <ConnectionTable.Body
                      rows={screen.active.rows}
                      total={screen.active.total}
                      closable
                      selectedId={explainedId}
                      explainPanelId={explainPanelId}
                      onExplain={onExplain}
                      onClosed={onClosed}
                      footer={renderFooter}
                      empty={renderEmpty}
                      filtered={screen.filtered}
                      onReset={screen.reset}
                      filteredColumns={screen.filteredColumns}
                      view={view}
                    />
                  </ViewTransition>
                </Activity>
              </TabsContent>

              <TabsContent value={CONNECTION_TAB.Closed} keepMounted className='flex min-h-0 grow flex-col'>
                <Activity mode={closedShown ? 'visible' : 'hidden'}>
                  <ViewTransition enter='fade-in' exit='fade-out' default='none'>
                    <ConnectionTable.Body
                      rows={screen.closed.rows}
                      total={screen.closed.total}
                      closable={false}
                      footer={renderFooter}
                      overflow={closedOverflow}
                      empty={renderEmpty}
                      filtered={screen.filtered}
                      onReset={screen.reset}
                      filteredColumns={screen.filteredColumns}
                      view={view}
                    />
                  </ViewTransition>
                </Activity>
              </TabsContent>
            </ConnectionTable.Root>
          </SidePanelLayout.Main>

          {/* The explanation belongs to the row of the active tab and
              leaves with it; the selected row stays, and on return the panel
              opens again. */}
          <SidePanelLayout.Panel>
            {explainedId !== null && (
              <RouteExplanation
                key={explainedId}
                id={explainPanelId}
                connectionId={explainedId}
                host={explainedHost}
                source={explainedSource}
                onClose={onCloseExplanation}
              />
            )}
          </SidePanelLayout.Panel>
        </SidePanelLayout.Root>

        {sheet && (
          <RouteExplanationSheet
            id={explainPanelId}
            connectionId={explainedId}
            host={explainedHost}
            source={explainedSource}
            onClose={onCloseExplanation}
          />
        )}
      </Tabs>
    </>
  );
}
