import { useSearch } from '@tanstack/react-router';
import { CircleAlert, Info, Search } from 'lucide-react';
import { startTransition, useCallback, useState, ViewTransition } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { isRuleRecognized } from '@entities/Rule';
import { usePanelAsSheet } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  FACET_ACTIVE,
  FACET_CLASS,
  FACET_IDLE,
  FACET_MORE,
  Input,
  QueryFailure,
  SURFACE,
  SkeletonRows,
} from '@shared/ui';
import { RulePanel, RulePanelSheet } from '@widgets/Rule/RulePanel';
import { RuleTable } from '@widgets/Rule/RuleTable';

import { toSelectedRuleId, useRouteEditor, useRuleFilter, useRuleMarks, type RuleFilterState } from '../lib/Editor.lib';

/** Сколько замечаний схемы показывать, чтобы они не вытеснили экран. */
const VISIBLE_ISSUES = 5;

/** Сколько выходов показать сразу: в большом конфиге их полтора десятка. */
const VISIBLE_TARGETS = 6;

export function EditorPage() {
  const { t } = useTranslation('pages/Editor');
  const editor = useRouteEditor();
  const filter = useRuleFilter(editor.rules);
  const marks = useRuleMarks(editor);
  const asSheet = usePanelAsSheet();
  // Номер правила из адреса — начальный выбор: экран соединений ведёт сюда на
  // сработавший узел. Дальше выбором владеет сам экран, иначе закрытая панель
  // открывалась бы заново на каждый рендер.
  const { rule } = useSearch({ strict: false });
  const [selectedId, setSelectedId] = useState<string | null>(() => toSelectedRuleId(rule));

  // Без Transition обновление срочное, и граница вокруг панели не анимируется.
  const onSelect = useCallback((id: string) => {
    startTransition(() => {
      setSelectedId((current) => (current === id ? null : id));
    });
  }, []);

  const onClose = useCallback(() => {
    startTransition(() => {
      setSelectedId(null);
    });
  }, []);

  const selected = editor.rules.find((row) => row.id === selectedId) ?? null;
  const selectedNode = selected === null ? null : editor.nodes[selected.index - 1];

  return (
    <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
      <p className='flex items-start gap-2 text-sm text-pretty text-muted-foreground'>
        <Info className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden='true' />
        <span>
          <Trans t={t} i18nKey='order' components={{ accent: <span className='font-medium text-foreground' /> }} />
        </span>
      </p>

      {editor.source.isPending && <SkeletonRows className={SURFACE} />}

      {editor.source.isLoadingError && <QueryFailure messageKey='source.config' query={editor.source} />}

      {editor.issues.length > 0 && <ConfigNotParsed issues={editor.issues} />}

      {editor.source.isSuccess && editor.rules.length === 0 && editor.issues.length === 0 && <NoRules />}

      {editor.rules.length > 0 && (
        <div className='flex min-h-0 grow flex-col gap-4 lg:flex-row'>
          <RuleTable
            rules={filter.rules}
            total={editor.rules.length}
            selectedId={selectedId}
            edited={marks.edited}
            hits={marks.hits}
            onSelect={onSelect}
            search={<RuleSearch filter={filter} />}
            facets={<RuleTargetFacets filter={filter} />}
            empty={<EmptyState filter={filter} />}
          />

          {selected !== null && !asSheet && (
            // Граница снаружи `key`: смена строки идёт как `update`, а не
            // как exit и enter одновременно, иначе панель мигает.
            <ViewTransition enter='panel-in' exit='panel-out'>
              <RulePanel
                key={selected.id}
                rule={selected}
                node={selectedNode}
                recognized={isRuleRecognized(selectedNode)}
                outbounds={editor.outbounds}
                onClose={onClose}
              />
            </ViewTransition>
          )}
        </div>
      )}

      {/* Ниже lg панели рядом со списком нет места, а под ним она уходит ниже
          сгиба и сжимает список до трёх строк: там она открывается листом. */}
      {asSheet && (
        <RulePanelSheet
          rule={selected}
          node={selectedNode}
          recognized={isRuleRecognized(selectedNode)}
          outbounds={editor.outbounds}
          onClose={onClose}
        />
      )}
    </div>
  );
}

/** Поиск: левый край тулбара таблицы. */
function RuleSearch({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');

  return (
    <div className='relative w-full max-w-80'>
      <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        value={filter.query}
        onChange={(event) => {
          filter.setQuery(event.target.value);
        }}
        placeholder={t('search.placeholder')}
        className='pl-8'
        aria-label={t('search.label')}
      />
    </div>
  );
}

/** Срез по выходу: вторая строка тулбара, потому что выходов бывает полтора десятка. */
function RuleTargetFacets({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');
  const [allTargets, setAllTargets] = useState(false);
  const shown = allTargets ? filter.targets : filter.targets.slice(0, VISIBLE_TARGETS);

  return (
    <ul aria-label={t('targets.label')} className='flex min-w-0 flex-wrap items-center gap-1.5'>
      {shown.map((group) => (
        <li key={group.target}>
          <button
            type='button'
            aria-pressed={filter.target === group.target}
            onClick={() => {
              filter.setTarget(filter.target === group.target ? null : group.target);
            }}
            className={cn(FACET_CLASS, 'font-mono', filter.target === group.target ? FACET_ACTIVE : FACET_IDLE)}
          >
            {group.target}
            <span className='tabular-nums'>{group.count}</span>
          </button>
        </li>
      ))}
      {filter.targets.length > VISIBLE_TARGETS && (
        <li>
          <button
            type='button'
            aria-expanded={allTargets}
            onClick={() => {
              setAllTargets((current) => !current);
            }}
            className={cn(FACET_CLASS, FACET_MORE)}
          >
            {allTargets
              ? t('list.collapse', { ns: 'shared' })
              : t('list.more', { ns: 'shared', count: filter.targets.length - VISIBLE_TARGETS })}
          </button>
        </li>
      )}
    </ul>
  );
}

function EmptyState({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t('list.notFound', { ns: 'shared' })}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            filter.setQuery('');
            filter.setTarget(null);
          }}
        >
          {t('list.resetFilter', { ns: 'shared' })}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Конфиг прочитан, а правил в нём нет: это состояние конфига, а не загрузки. */
function NoRules() {
  const { t } = useTranslation('pages/Editor');

  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyTitle>{t('empty.title')}</EmptyTitle>
        <EmptyDescription>{t('empty.description')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * Конфиг пришёл, но схема его не приняла.
 *
 * Пустой список правил вместо этого сообщения читался бы как «правил нет», и
 * пользователь начал бы чинить не то. Замечания схемы показываются дословно:
 * по ним видно, какой узел не разобран.
 */
function ConfigNotParsed({ issues }: { issues: string[] }) {
  const { t } = useTranslation('pages/Editor');
  const shown = issues.slice(0, VISIBLE_ISSUES);
  const hidden = issues.length - shown.length;

  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>{t('broken.title')}</AlertTitle>
      <AlertDescription>
        <p className='text-pretty'>{t('broken.description')}</p>
        <ul className='mt-2 flex flex-col gap-1 font-mono text-xs'>
          {shown.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        {hidden > 0 && <p className='mt-1 text-xs'>{t('broken.more', { count: hidden })}</p>}
      </AlertDescription>
    </Alert>
  );
}
