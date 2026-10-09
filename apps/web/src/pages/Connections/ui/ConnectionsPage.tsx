import { Activity, startTransition, useCallback, useId, useMemo, useState, ViewTransition } from 'react';
import { useTranslation } from 'react-i18next';

import { CONNECTION_TAB, ConnectionState, useConnectionStream, type ConnectionRow } from '@entities/Connection';
import { useCloseAllConnections } from '@features/Connection/ConnectionClose';
import { usePanelAsSheet } from '@shared/lib/media';
import { useLiveRegion } from '@shared/lib/useLiveRegion';
import { Alert, AlertDescription, LiveRegion, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';
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
  const evicted = ConnectionState.use.evicted();
  // Оба числа переполнения — из стора одного момента: прореженная выдача
  // таблицы на медленном интервале отстаёт от счётчика вытесненных.
  const kept = ConnectionState.use.closed().length;
  const sampledAt = ConnectionState.use.sampledAt();
  const setPaused = ConnectionState.use.setPaused();
  const closeAll = useCloseAllConnections();
  const sheet = usePanelAsSheet();
  // Строка уходит из списка молча: что соединение закрыто, скринридеру
  // объявляет одна область на экран.
  const { message, announce } = useLiveRegion();

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
    closeAll.mutate(undefined, {
      onSuccess: () => {
        announce(t('announce.closedAll'));
      },
    });
  }, [announce, closeAll, t]);

  const onClosed = useCallback(() => {
    announce(t('announce.closed'));
  }, [announce, t]);

  const explainedHost = screen.active.rows.find((row) => row.id === explainedId)?.host ?? '';
  const activeShown = screen.tab === CONNECTION_TAB.Active;
  const closedShown = screen.tab === CONNECTION_TAB.Closed;
  const pending = sampledAt === null;

  // Тела вкладок мемоизированы, и колбэки им отдаются стабильными: иначе скрытая
  // вкладка перерисовывалась бы на каждый тик ради новой ссылки на функцию.
  const renderEmpty = useCallback(
    ({ filtered, reset }: ConnectionTableEmpty) => (
      <ConnectionsEmpty filtered={filtered} pending={pending} onReset={reset} />
    ),
    [pending]
  );

  const renderFooter = useCallback((rows: ConnectionRow[]) => <ConnectionExport rows={rows} />, []);

  // Подвал закрытых называет вытесненные; пока вкладка спрятана, числа стоят.
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

        {/* Ниже lg объяснение открывается листом, и в колонке остаётся один
            список. Колонка прокручивается на низком экране, где списку не
            хватает его минимальной высоты. */}
        <div className='flex min-h-0 grow flex-col gap-4 max-lg:overflow-y-auto lg:flex-row'>
          {/* Поиск, срезы, вид и действия — один тулбар на обе вкладки: под
              `Activity` остаётся только то, что у вкладки своё. */}
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

            {/* `default='none'`: обновления строк внутри вкладки — не её анимация. */}
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
                    view={view}
                  />
                </ViewTransition>
              </Activity>
            </TabsContent>
          </ConnectionTable.Root>

          {/* Объяснение принадлежит строке активной вкладки и прячется вместе с
              ней, сохраняя своё состояние. */}
          <Activity mode={activeShown ? 'visible' : 'hidden'}>
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
          </Activity>
        </div>

        {sheet && (
          <RouteExplanationSheet
            id={explainPanelId}
            connectionId={explainedId}
            host={explainedHost}
            onClose={onCloseExplanation}
          />
        )}
      </Tabs>
    </>
  );
}
