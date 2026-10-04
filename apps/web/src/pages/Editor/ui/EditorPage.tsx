import { useSearch } from '@tanstack/react-router';
import { CircleAlert, CircleQuestionMark, Search, X } from 'lucide-react';
import { useCallback, useState, ViewTransition, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { ConfigIssue } from '@entities/Config';
import { isRuleRecognized } from '@entities/Rule';
import { RuleAddButton } from '@features/Rule/RuleAdd';
import { RuleDeleteButton } from '@features/Rule/RuleDelete';
import { RuleReorderButtons } from '@features/Rule/RuleReorder';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  QueryFailure,
  SEARCH_FIELD,
  Separator,
  SURFACE,
  SkeletonRows,
} from '@shared/ui';
import { RulePanel, RulePanelSheet } from '@widgets/Rule/RulePanel';
import { RuleTable } from '@widgets/Rule/RuleTable';

import {
  toSelectedRuleId,
  useRouteEditor,
  useRuleFilter,
  useRuleMarks,
  useRuleSelection,
  type RuleFilterState,
} from '../lib/Editor.lib';

/** Сколько замечаний схемы показывать, чтобы они не вытеснили экран. */
const VISIBLE_ISSUES = 5;

/** Сколько выходов показать сразу: в большом конфиге их полтора десятка. */
const VISIBLE_TARGETS = 6;

export function EditorPage() {
  const editor = useRouteEditor();
  const filter = useRuleFilter(editor.rules);
  const marks = useRuleMarks(editor);
  const asSheet = usePanelAsSheet();
  // Номер правила из адреса — начальный выбор: экран соединений ведёт сюда на
  // сработавший узел. Дальше выбором владеет сам экран, иначе закрытая панель
  // открывалась бы заново на каждый рендер.
  const { rule } = useSearch({ strict: false });
  const selection = useRuleSelection(toSelectedRuleId(rule));
  const { reset: resetFilter } = filter;
  const { onAdded: selectAdded } = selection;

  // Новое правило под отбор почти никогда не попадает: без снятия отбора оно
  // открылось бы в панели, но в списке его бы не было.
  const onAdded = useCallback(
    (index: number) => {
      resetFilter();
      selectAdded(index);
    },
    [resetFilter, selectAdded]
  );

  const selected = editor.rules.find((row) => row.id === selection.id) ?? null;
  const selectedNode = selected === null ? null : editor.nodes[selected.index - 1];
  // Номер нового правила — по узлам файла, а не по строкам: строку получает
  // только узел-объект, а вставка адресуется позицией в массиве.
  const add = <RuleAddButton index={editor.nodes.length + 1} outbound={editor.finalOutbound} onAdded={onAdded} />;
  const actions =
    selected === null ? null : (
      <>
        <RuleReorderButtons index={selected.index} total={editor.nodes.length} onMoved={selection.onMoved} />
        <Separator orientation='vertical' className='mx-1 h-5' />
        <RuleDeleteButton index={selected.index} onDeleted={selection.onDeleted} />
      </>
    );

  return (
    <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
      <RuleOrderHint />

      {editor.source.isPending && <SkeletonRows className={SURFACE} />}

      {editor.source.isLoadingError && <QueryFailure messageKey='source.config' query={editor.source} />}

      {editor.issues.length > 0 && <ConfigNotParsed issues={editor.issues} />}

      {editor.source.isSuccess && editor.rules.length === 0 && editor.issues.length === 0 && <NoRules add={add} />}

      {editor.rules.length > 0 && (
        <div className='flex min-h-0 grow flex-col gap-4 lg:flex-row'>
          <RuleTable
            rules={filter.rules}
            total={editor.rules.length}
            selectedId={selection.id}
            edited={marks.edited}
            hits={marks.hits}
            outboundTypes={editor.outboundTypes}
            onSelect={selection.select}
            search={
              <>
                <RuleSearch filter={filter} />
                <RuleSetChip filter={filter} />
              </>
            }
            actions={add}
            facets={<RuleTargetFacets filter={filter} />}
            empty={<EmptyState filter={filter} />}
          />

          {selected !== null && !asSheet && (
            // Граница снаружи `key`: смена строки идёт как `update`, а не
            // как exit и enter одновременно, иначе панель мигает.
            <ViewTransition enter='panel-in' exit='panel-out'>
              <RulePanel
                key={selection.key}
                rule={selected}
                node={selectedNode}
                recognized={isRuleRecognized(selectedNode)}
                outbounds={editor.outbounds}
                ruleSets={editor.ruleSets}
                actions={actions}
                onClose={selection.close}
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
          panelKey={selection.key}
          outbounds={editor.outbounds}
          ruleSets={editor.ruleSets}
          actions={actions}
          onClose={selection.close}
        />
      )}
    </div>
  );
}

/**
 * Суть порядка стоит строкой, объяснение — по запросу: читают его один раз, а
 * место над списком оно занимало бы на каждом заходе.
 */
function RuleOrderHint() {
  const { t } = useTranslation('pages/Editor');

  return (
    <div className='flex items-center gap-1 text-sm text-muted-foreground'>
      <p className='text-pretty'>
        <Trans t={t} i18nKey='order.short' components={{ accent: <span className='font-medium text-foreground' /> }} />
      </p>
      <Popover>
        <PopoverTrigger render={<Button variant='ghost' size='icon-xs' aria-label={t('order.more')} />}>
          <CircleQuestionMark />
        </PopoverTrigger>
        <PopoverContent align='start' className='w-80'>
          <p className='text-pretty'>{t('order.details')}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Поиск: левый край тулбара таблицы. */
function RuleSearch({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');

  return (
    <div className={SEARCH_FIELD}>
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

/**
 * Отбор по сету из адреса. Снимается здесь же: без признака урезанный список
 * читался бы как весь.
 */
function RuleSetChip({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');

  if (filter.ruleSet === null) {
    return null;
  }

  return (
    <button
      type='button'
      aria-label={t('ruleSet.clear', { tag: filter.ruleSet })}
      onClick={() => {
        filter.setRuleSet(null);
      }}
      className={cn(FACET_CLASS, FACET_ACTIVE)}
    >
      {t('ruleSet.label')}
      <span className='font-mono'>{filter.ruleSet}</span>
      <X className='size-3' aria-hidden='true' />
    </button>
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
        <Button variant='outline' size='sm' onClick={filter.reset}>
          {t('list.resetFilter', { ns: 'shared' })}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Конфиг прочитан, а правил в нём нет: это состояние конфига, а не загрузки. */
function NoRules({ add }: { add: ReactNode }) {
  const { t } = useTranslation('pages/Editor');

  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyTitle>{t('empty.title')}</EmptyTitle>
        <EmptyDescription>{t('empty.description')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{add}</EmptyContent>
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
function ConfigNotParsed({ issues }: { issues: ConfigIssue[] }) {
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
            <li key={issue.text}>{issue.text}</li>
          ))}
        </ul>
        {hidden > 0 && <p className='mt-1 text-xs'>{t('broken.more', { count: hidden })}</p>}
      </AlertDescription>
    </Alert>
  );
}
