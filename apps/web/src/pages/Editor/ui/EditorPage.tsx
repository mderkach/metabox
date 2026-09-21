import { useSearch } from '@tanstack/react-router';
import { CircleAlert, Info, Search } from 'lucide-react';
import { startTransition, useCallback, useState, ViewTransition } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { isRuleRecognized } from '@entities/Rule';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FACET_ACTIVE,
  FACET_CLASS,
  FACET_IDLE,
  FACET_MORE,
  Input,
} from '@shared/ui';
import { RulePanel } from '@widgets/Rule/RulePanel';
import { RuleTable } from '@widgets/Rule/RuleTable';

import { toSelectedRuleId, useRouteEditor, useRuleFilter, type RuleFilterState } from '../lib/Editor.lib';

/** Сколько замечаний схемы показывать, чтобы они не вытеснили экран. */
const VISIBLE_ISSUES = 5;

/** Сколько исходов показать сразу: в большом конфиге их полтора десятка. */
const VISIBLE_TARGETS = 6;

export function EditorPage() {
  const { t } = useTranslation('pages/Editor');
  const editor = useRouteEditor();
  const filter = useRuleFilter(editor.rules);
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

      {editor.isPending && <p className='text-sm text-muted-foreground'>{t('pending')}</p>}

      {editor.issues.length > 0 && <ConfigNotParsed issues={editor.issues} />}

      {/* Ниже lg это колонка: панель забирает свою высоту, и списку с
          `min-h-0 grow` доставался ноль. Там обе части получают высоту, а
          прокручивается сама колонка. */}
      {editor.rules.length > 0 && (
        <div className='flex min-h-0 grow flex-col gap-4 max-lg:overflow-y-auto lg:flex-row'>
          <RuleTable
            rules={filter.rules}
            total={editor.rules.length}
            selectedId={selectedId}
            onSelect={onSelect}
            search={<RuleSearch filter={filter} />}
            facets={<RuleTargetFacets filter={filter} />}
            empty={<EmptyState filter={filter} />}
          />

          {selected !== null && (
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

/** Срез по исходу: вторая строка тулбара, потому что исходов бывает полтора десятка. */
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
            {allTargets ? t('targets.collapse') : t('targets.more', { count: filter.targets.length - VISIBLE_TARGETS })}
          </button>
        </li>
      )}
    </ul>
  );
}

function EmptyState({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');

  return (
    <div className='flex flex-col items-center gap-2'>
      <p className='text-sm text-muted-foreground'>{t('notFound')}</p>
      <Button
        variant='outline'
        size='sm'
        onClick={() => {
          filter.setQuery('');
          filter.setTarget(null);
        }}
      >
        {t('resetFilter')}
      </Button>
    </div>
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
