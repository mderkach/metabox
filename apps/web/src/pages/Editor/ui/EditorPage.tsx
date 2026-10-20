import { useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';

import { CONFIG_SECTION } from '@entities/Config';
import { toNewRuleRow, type NewRulePlace } from '@entities/Rule';
import { useCreateRule } from '@features/Rule/RuleAdd';
import { usePanelAsSheet } from '@shared/lib/media';
import { QueryFailure, SidePanelLayout, SURFACE, SkeletonRows } from '@shared/ui';
import { ConfigSectionSettings } from '@widgets/Config/ConfigSectionSettings';
import { RulePanel, RulePanelSheet } from '@widgets/Rule/RulePanel';
import { RuleTable } from '@widgets/Rule/RuleTable';

import { toSelectedRuleId, useRouteEditor, useRuleFilter, useRuleMarks, useRuleSelection } from '../lib/Editor.lib';
import { EditorConfigNotParsed } from './EditorConfigNotParsed';
import { EditorFilteredEmpty } from './EditorFilteredEmpty';
import { EditorNoRules } from './EditorNoRules';
import { EditorOrderHint } from './EditorOrderHint';
import { EditorRuleActions } from './EditorRuleActions';
import { EditorRuleAdd } from './EditorRuleAdd';
import { EditorRuleSearch } from './EditorRuleSearch';
import { EditorRuleSetChip } from './EditorRuleSetChip';
import { EditorTargetFacets } from './EditorTargetFacets';

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
  const createRule = useCreateRule();
  const { reset: resetFilter } = filter;
  const { startAdding, onCreated } = selection;

  // A new rule almost never passes the filter: without clearing the filter it
  // would open in the panel but not be in the list.
  const onAdd = useCallback(
    (place: NewRulePlace) => {
      resetFilter();
      startAdding(place);
    },
    [resetFilter, startAdding]
  );

  const pending = selection.pending;
  const onCreate =
    pending === null
      ? undefined
      : (node: Record<string, unknown>) => {
          createRule(pending.index, node);
          onCreated(pending.index, node);
        };

  const listed = editor.rules.find((row) => row.id === selection.id);
  const selected = listed ?? selection.created ?? (pending === null ? null : toNewRuleRow(pending));
  const selectedNode = listed === undefined ? undefined : editor.nodes[listed.index - 1];
  // Below lg the list keeps a minimum height and does not fit on a short screen:
  // the whole screen scrolls there instead of being cut off under the apply bar.
  return (
    <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 max-lg:overflow-y-auto sm:px-6'>
      <EditorOrderHint />

      {editor.source.isPending && <SkeletonRows className={SURFACE} />}

      {editor.source.isLoadingError && <QueryFailure messageKey='source.config' query={editor.source} />}

      {editor.issues.length > 0 && <EditorConfigNotParsed issues={editor.issues} />}

      <ConfigSectionSettings section={CONFIG_SECTION.Route} />

      {editor.source.isSuccess && editor.rules.length === 0 && editor.issues.length === 0 && (
        <EditorNoRules
          rules={editor.rules}
          total={editor.nodes.length}
          finalOutbound={editor.finalOutbound}
          onAdd={onAdd}
        />
      )}

      {(editor.rules.length > 0 || selected !== null) && (
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
                  <EditorRuleSearch filter={filter} />
                  <EditorRuleSetChip filter={filter} />
                </>
              }
              actions={
                <EditorRuleAdd
                  rules={editor.rules}
                  total={editor.nodes.length}
                  finalOutbound={editor.finalOutbound}
                  onAdd={onAdd}
                />
              }
              facets={<EditorTargetFacets filter={filter} />}
              empty={<EditorFilteredEmpty filter={filter} />}
            />
          </SidePanelLayout.Main>

          <SidePanelLayout.Panel>
            {selected !== null && (
              <RulePanel
                key={selection.key}
                rule={selected}
                node={selectedNode}
                recognized={selected.recognized}
                outbounds={editor.outbounds}
                ruleSets={editor.ruleSets}
                onCreate={onCreate}
                actions={
                  pending === null ? (
                    <EditorRuleActions
                      index={selected.index}
                      total={editor.nodes.length}
                      onMoved={selection.onMoved}
                      onDeleted={selection.onDeleted}
                    />
                  ) : null
                }
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
          recognized={selected?.recognized ?? false}
          panelKey={selection.key}
          outbounds={editor.outbounds}
          ruleSets={editor.ruleSets}
          onCreate={onCreate}
          actions={
            selected === null || pending !== null ? null : (
              <EditorRuleActions
                index={selected.index}
                total={editor.nodes.length}
                onMoved={selection.onMoved}
                onDeleted={selection.onDeleted}
              />
            )
          }
          onClose={selection.close}
        />
      )}
    </div>
  );
}
