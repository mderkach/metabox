import { useSearch } from '@tanstack/react-router';
import { CircleAlert, Search, X } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { CONFIG_SECTION, type ConfigIssue } from '@entities/Config';
import { isRuleRecognized, newRulePlace } from '@entities/Rule';
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
  QueryFailure,
  SEARCH_FIELD,
  Separator,
  SidePanelLayout,
  SURFACE,
  SkeletonRows,
} from '@shared/ui';
import { ConfigSectionSettings } from '@widgets/Config/ConfigSectionSettings';
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

/** How many schema remarks to show so they do not crowd out the screen. */
const VISIBLE_ISSUES = 5;

/** How many outbounds to show at once: a big config has a dozen and a half. */
const VISIBLE_TARGETS = 6;

export function EditorPage() {
  const editor = useRouteEditor();
  const filter = useRuleFilter(editor.rules);
  const marks = useRuleMarks(editor);
  const asSheet = usePanelAsSheet();
  // The rule number from the address is the initial selection: the connections screen leads here to
  // the node that hit. After that the screen owns the selection, otherwise a closed panel
  // would reopen on every render.
  const { rule } = useSearch({ strict: false });
  const selection = useRuleSelection(toSelectedRuleId(rule));
  const { reset: resetFilter } = filter;
  const { onAdded: selectAdded } = selection;

  // A new rule almost never passes the filter: without clearing the filter it
  // would open in the panel but not be in the list.
  const onAdded = useCallback(
    (index: number) => {
      resetFilter();
      selectAdded(index);
    },
    [resetFilter, selectAdded]
  );

  const selected = editor.rules.find((row) => row.id === selection.id) ?? null;
  const selectedNode = selected === null ? null : editor.nodes[selected.index - 1];
  const place = useMemo(
    () => newRulePlace(editor.rules, editor.nodes.length, editor.finalOutbound),
    [editor.rules, editor.nodes.length, editor.finalOutbound]
  );
  const add = (
    <RuleAddButton
      index={place?.index ?? editor.nodes.length + 1}
      outbound={place?.outbound ?? null}
      onAdded={onAdded}
    />
  );
  const actions =
    selected === null ? null : (
      <>
        <RuleReorderButtons index={selected.index} total={editor.nodes.length} onMoved={selection.onMoved} />
        <Separator orientation='vertical' className='mx-1 h-5' />
        <RuleDeleteButton index={selected.index} onDeleted={selection.onDeleted} />
      </>
    );

  // Below lg the list keeps a minimum height and does not fit on a short screen:
  // the whole screen scrolls there instead of being cut off under the apply bar.
  return (
    <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 max-lg:overflow-y-auto sm:px-6'>
      <RuleOrderHint />

      {editor.source.isPending && <SkeletonRows className={SURFACE} />}

      {editor.source.isLoadingError && <QueryFailure messageKey='source.config' query={editor.source} />}

      {editor.issues.length > 0 && <ConfigNotParsed issues={editor.issues} />}

      <ConfigSectionSettings section={CONFIG_SECTION.Route} />

      {editor.source.isSuccess && editor.rules.length === 0 && editor.issues.length === 0 && <NoRules add={add} />}

      {editor.rules.length > 0 && (
        <SidePanelLayout.Root open={selected !== null && !asSheet} className='min-h-0 grow max-lg:min-h-96'>
          <SidePanelLayout.Main>
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
          </SidePanelLayout.Main>

          <SidePanelLayout.Panel>
            {selected !== null && (
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
            )}
          </SidePanelLayout.Panel>
        </SidePanelLayout.Root>
      )}

      {/* Below lg there is no room for the panel beside the list, and under it it goes below
          the fold and squeezes the list to three rows: there it opens as a sheet. */}
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

function RuleOrderHint() {
  const { t } = useTranslation('pages/Editor');

  return (
    <div className='flex items-center gap-1 text-sm text-muted-foreground'>
      <p className='text-pretty'>
        <Trans t={t} i18nKey='order.short' components={{ accent: <span className='font-medium text-foreground' /> }} />
      </p>
    </div>
  );
}

/** Search: left edge of the table toolbar. */
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
 * Filter by the rule set from the address. Cleared right here: without the indicator a trimmed list
 * would read as the whole one.
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

/** Outbound facet: the second toolbar row, because there are a dozen and a half outbounds. */
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

/** The config is read but has no rules: this is a config state, not a loading state. */
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
 * The config arrived but the schema did not accept it.
 *
 * An empty rule list instead of this message would read as "no rules", and the
 * user would start fixing the wrong thing. Schema remarks are shown verbatim:
 * they show which node is not parsed.
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
