import type { ParseKeys } from 'i18next';
import { Download, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConnectionState, useConnectionCounts, useConnectionStream, type ConnectionRow } from '@entities/Connection';
import { useCloseAllConnections } from '@features/Connection/ConnectionClose';
import { downloadConnections, EXPORT_FORMAT, type ExportFormat } from '@features/Connection/ConnectionExport';
import { FACET_ACTIVE, FACET_CLASS, FACET_IDLE, FACET_MORE } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';
import { ConnectionTable } from '@widgets/ConnectionTable';
import { RouteExplanation } from '@widgets/RouteExplanation';

import { CONNECTION_TAB, useConnectionsScreen, type ConnectionsScreen } from '../lib';

/** Сколько устройств показать сразу: на роутере их бывает под три десятка. */
const VISIBLE_SOURCES = 8;

const EXPORT_FORMATS = [
  { format: EXPORT_FORMAT.Csv, label: 'export.csv' },
  { format: EXPORT_FORMAT.Json, label: 'export.json' },
] as const satisfies readonly { format: ExportFormat; label: ParseKeys<'pages/Connections'> }[];

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

  const onTogglePause = useCallback(() => {
    setPaused(!paused);
  }, [paused, setPaused]);

  const onToggleSources = useCallback(() => {
    setAllSources((current) => !current);
  }, []);

  const onCloseAll = useCallback(() => {
    closeAll.mutate();
  }, [closeAll]);

  const search = <ConnectionSearch screen={screen} />;
  const facets = <ConnectionFacets screen={screen} allSources={allSources} onToggleSources={onToggleSources} />;
  const footer = <ConnectionExport rows={screen.rows} />;
  const empty = <EmptyState filtered={screen.filtered} onReset={screen.reset} />;

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

        <TabsContent value={CONNECTION_TAB.Active} className='flex min-h-0 grow flex-col gap-4 lg:flex-row'>
          <ConnectionTable
            rows={screen.rows}
            total={screen.total}
            closable
            selectedId={explainedId}
            onExplain={onExplain}
            search={search}
            facets={facets}
            footer={footer}
            empty={empty}
            actions={
              <ConnectionActions
                paused={paused}
                onTogglePause={onTogglePause}
                onCloseAll={counts.active === 0 ? null : onCloseAll}
              />
            }
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
            total={screen.total}
            closable={false}
            search={search}
            facets={facets}
            footer={footer}
            empty={empty}
            actions={<ConnectionActions paused={paused} onTogglePause={onTogglePause} onCloseAll={null} />}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * Действия над списком. Стоят в тулбаре таблицы, а не в шапке страницы: они
 * работают с её строками, и на расстоянии связь не читается.
 *
 * «Закрыть все» отделено разделителем и тоном опасности: пауза ничего не меняет
 * на устройстве, а это рвёт живые соединения. Контур, а не заливка: залитый тон
 * опасности среди обычных кнопок читается как сообщение об ошибке. Когда рвать
 * нечего, действия нет вовсе.
 */
function ConnectionActions({
  paused,
  onTogglePause,
  onCloseAll,
}: {
  paused: boolean;
  onTogglePause: () => void;
  /** `null` — закрывать нечего: вкладка закрытых или пустой список. */
  onCloseAll: (() => void) | null;
}) {
  const { t } = useTranslation('pages/Connections');

  return (
    <>
      <Button variant='outline' size='sm' onClick={onTogglePause}>
        {paused ? t('resume') : t('pause')}
      </Button>

      {onCloseAll !== null && (
        <>
          <Separator orientation='vertical' className='mx-0.5 h-5' />
          <Button
            variant='outline'
            size='sm'
            className='border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive'
            onClick={onCloseAll}
          >
            {t('closeAll')}
          </Button>
        </>
      )}
    </>
  );
}

/** Выгрузка: подвал таблицы, рядом со счётчиком — уходит ровно то, что он называет. */
function ConnectionExport({ rows }: { rows: ConnectionRow[] }) {
  const { t } = useTranslation('pages/Connections');

  return (
    <>
      {EXPORT_FORMATS.map(({ format, label }) => (
        <Button
          key={format}
          variant='ghost'
          size='xs'
          disabled={rows.length === 0}
          onClick={() => {
            downloadConnections(rows, format, new Date());
          }}
        >
          <Download />
          {t(label)}
        </Button>
      ))}
    </>
  );
}

/** Поиск: левый край тулбара таблицы. */
function ConnectionSearch({ screen }: { screen: ConnectionsScreen }) {
  const { t } = useTranslation('pages/Connections');

  return (
    <div className='relative w-full max-w-72'>
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
  );
}

/** Срез по устройству: вторая строка тулбара, потому что устройств бывает много. */
function ConnectionFacets({
  screen,
  allSources,
  onToggleSources,
}: {
  screen: ConnectionsScreen;
  allSources: boolean;
  onToggleSources: () => void;
}) {
  const { t } = useTranslation('pages/Connections');

  return (
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
            onClick={onToggleSources}
            className={cn(FACET_CLASS, FACET_MORE)}
          >
            {allSources ? t('sources.collapse') : t('sources.more', { count: screen.sources.length - VISIBLE_SOURCES })}
          </button>
        </li>
      )}
    </ul>
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
