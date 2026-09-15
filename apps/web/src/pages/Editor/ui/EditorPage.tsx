import { Link, useSearch } from '@tanstack/react-router';
import { Info, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useConfigPath } from '@entities/Daemon';
import { isRuleRecognized } from '@entities/Rule';
import { ConfigApplyHistory } from '@features/Config/ConfigApply';
import { FACET_ACTIVE, FACET_CLASS, FACET_IDLE, FACET_MORE } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import { Badge, Button, buttonVariants, Input } from '@shared/ui';
import { ConfigTabs } from '@widgets/Config/ConfigTabs';
import { RulePanel } from '@widgets/Rule/RulePanel';
import { RuleTable } from '@widgets/Rule/RuleTable';

import { toSelectedRuleId, useRouteEditor, useRuleFilter } from '../lib/Editor.lib';

/** Сколько замечаний схемы показывать, чтобы они не вытеснили экран. */
const VISIBLE_ISSUES = 5;

/** Сколько исходов показать сразу: в большом конфиге их полтора десятка. */
const VISIBLE_TARGETS = 6;

export function EditorPage() {
  const { t } = useTranslation('pages/Editor');
  const editor = useRouteEditor();
  const configPath = useConfigPath();
  const filter = useRuleFilter(editor.rules);
  // Номер правила из адреса — начальный выбор: экран соединений ведёт сюда на
  // сработавший узел. Дальше выбором владеет сам экран, иначе закрытая панель
  // открывалась бы заново на каждый рендер.
  const { rule } = useSearch({ strict: false });
  const [selectedId, setSelectedId] = useState<string | null>(() => toSelectedRuleId(rule));
  const [allTargets, setAllTargets] = useState(false);

  const onSelect = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  const onClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const selected = editor.rules.find((row) => row.id === selectedId) ?? null;
  const selectedNode = selected === null ? null : editor.nodes[selected.index - 1];
  const shownTargets = allTargets ? filter.targets : filter.targets.slice(0, VISIBLE_TARGETS);

  return (
    <>
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-6'>
        <h1 className='text-2xl font-semibold'>{t('title')}</h1>
        <p className='font-mono text-xs text-muted-foreground'>{configPath}</p>
        {editor.isDirty && <Badge variant='secondary'>{t('draft')}</Badge>}
        <span className='grow' />
        <ConfigApplyHistory />
        <Link to='/config/raw' className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {t('raw')}
        </Link>
      </header>

      <ConfigTabs config={editor.config} />

      <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
        <p className='flex items-start gap-2 text-sm text-pretty text-muted-foreground'>
          <Info className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden='true' />
          <span>
            <Trans t={t} i18nKey='order' components={{ accent: <span className='font-medium text-foreground' /> }} />
          </span>
        </p>

        {editor.isPending && <p className='text-sm text-muted-foreground'>{t('pending')}</p>}

        {editor.issues.length > 0 && <ConfigNotParsed issues={editor.issues} />}

        {editor.rules.length > 0 && (
          <>
            <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2'>
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

              <ul aria-label={t('targets.label')} className='flex min-w-0 flex-wrap items-center gap-1.5'>
                {shownTargets.map((group) => (
                  <li key={group.target}>
                    <button
                      type='button'
                      aria-pressed={filter.target === group.target}
                      onClick={() => {
                        filter.setTarget(filter.target === group.target ? null : group.target);
                      }}
                      className={cn(
                        FACET_CLASS,
                        'font-mono',
                        filter.target === group.target ? FACET_ACTIVE : FACET_IDLE
                      )}
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
                        ? t('targets.collapse')
                        : t('targets.more', { count: filter.targets.length - VISIBLE_TARGETS })}
                    </button>
                  </li>
                )}
              </ul>

              <p role='status' className='text-xs text-muted-foreground'>
                {filter.filtered
                  ? t('shown', {
                      shown: t('count.rule', { ns: 'shared', count: filter.rules.length }),
                      total: editor.rules.length,
                    })
                  : t('count.rule', { ns: 'shared', count: editor.rules.length })}
              </p>
            </div>

            <div className='flex min-h-0 grow flex-col gap-4 lg:flex-row'>
              <RuleTable
                rules={filter.rules}
                selectedId={selectedId}
                onSelect={onSelect}
                empty={
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
                }
              />

              {selected !== null && (
                <RulePanel
                  key={selected.id}
                  rule={selected}
                  node={selectedNode}
                  recognized={isRuleRecognized(selectedNode)}
                  outbounds={editor.outbounds}
                  onClose={onClose}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
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
    <div className='rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive'>
      <p className='font-medium'>{t('broken.title')}</p>
      <p className='mt-1 text-pretty'>{t('broken.description')}</p>
      <ul className='mt-2 flex flex-col gap-1 font-mono text-xs'>
        {shown.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      {hidden > 0 && <p className='mt-1 text-xs'>{t('broken.more', { count: hidden })}</p>}
    </div>
  );
}
