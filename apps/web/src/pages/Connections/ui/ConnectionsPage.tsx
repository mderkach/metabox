import { useCallback, useState } from 'react';

import {
  ConnectionState,
  useCloseAllConnections,
  useConnectionCounts,
  useConnectionStream,
} from '@entities/Connection';
import { Alert, AlertDescription, Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';
import { ConnectionTable } from '@widgets/ConnectionTable';
import { RouteExplanation } from '@widgets/RouteExplanation';

const TAB = {
  Active: 'active',
  Closed: 'closed',
} as const;

type Tab = (typeof TAB)[keyof typeof TAB];

export function ConnectionsPage() {
  useConnectionStream();

  const [tab, setTab] = useState<Tab>(TAB.Active);
  const [explainedId, setExplainedId] = useState<string | null>(null);
  const active = ConnectionState.use.active();
  const closed = ConnectionState.use.closed();
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
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border px-4 py-2.5 sm:px-6'>
        <h1 className='text-base font-medium'>Соединения</h1>
        <p className='text-xs text-muted-foreground'>поток идёт снапшотами раз в секунду</p>
        {dropped > 0 && (
          // Молча замереть на старых данных хуже, чем сказать, что снапшоты не
          // разбираются: список выглядел бы исправным, но не обновлялся.
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
          onClick={() => {
            closeAll.mutate();
          }}
        >
          Закрыть все
        </Button>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value === TAB.Closed ? TAB.Closed : TAB.Active);
        }}
        className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'
      >
        <TabsList variant='line'>
          <TabsTrigger value={TAB.Active}>
            Активные
            <Badge variant='secondary'>{counts.active}</Badge>
          </TabsTrigger>
          <TabsTrigger value={TAB.Closed}>
            Закрытые
            <Badge variant='secondary'>{counts.closed}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={TAB.Active} className='flex min-h-0 grow flex-col gap-4 lg:flex-row'>
          <ConnectionTable rows={active} closable selectedId={explainedId} onExplain={onExplain} />

          {explainedId !== null && (
            <RouteExplanation key={explainedId} connectionId={explainedId} onClose={onCloseExplanation} />
          )}
        </TabsContent>

        <TabsContent value={TAB.Closed} className='flex min-h-0 grow flex-col gap-4'>
          <Alert>
            <AlertDescription>
              Закрытые собирает панель: рантайм отдаёт только живые, и соединение, пропавшее между снапшотами, иначе
              исчезло бы без следа. История держится, пока открыта вкладка.
            </AlertDescription>
          </Alert>

          <ConnectionTable rows={closed} closable={false} />
        </TabsContent>
      </Tabs>
    </>
  );
}
