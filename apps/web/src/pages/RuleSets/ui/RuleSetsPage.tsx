import { Plus, Search } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, readRuleSets, ruleSetNodePath } from '@entities/Config';
import { localListFile } from '@entities/RuleSet';
import { ConfigCacheNotice } from '@features/Config/ConfigCacheFile';
import { RuleSetAddForm } from '@features/RuleSet/RuleSetAdd';
import { RuleSetCustomForm } from '@features/RuleSet/RuleSetCustom';
import { RuleSetEditForm } from '@features/RuleSet/RuleSetEdit';
import { usePanelAsSheet } from '@shared/lib/media';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  QueryFailure,
  SEARCH_FIELD,
  SidePanelLayout,
  SURFACE,
  SkeletonRows,
} from '@shared/ui';
import { RuleSetPanel, RuleSetPanelSheet } from '@widgets/RuleSet/RuleSetPanel';
import { RuleSetTable } from '@widgets/RuleSet/RuleSetTable';

import {
  RULE_SET_FORM,
  useRuleSetEditor,
  useRuleSetFilter,
  useRuleSetPanel,
  type RuleSetEditorState,
  type RuleSetFilterState,
  type RuleSetForm,
} from '../lib/RuleSets.lib';

/**
 * Rule sets: what is attached and what to add to it.
 *
 * An empty section is not a placeholder but the main screen of this place: for a new
 * user it is always empty, and there is nowhere else to explain why rule sets are needed.
 * So an empty place shows the form at once, not a button that opens the form.
 * When rule sets exist, forms open in the panel beside the list (ADR-0037).
 */
export function RuleSetsPage() {
  const { t } = useTranslation('pages/RuleSets');
  const editor = useRuleSetEditor();
  const filter = useRuleSetFilter(editor.sets);
  const remove = ConfigDocumentState.use.remove();
  const removeList = ConfigDocumentState.use.removeList();
  const panel = useRuleSetPanel();
  const asSheet = usePanelAsSheet();

  const { form: openForm, close: closePanel } = panel;
  const onRemove = useCallback(
    (index: number) => {
      // Editing addresses a rule set by position: after deletion it would point to a neighbor.
      if (openForm === RULE_SET_FORM.Edit) closePanel();

      // The file of its own list goes away with the node: an orphaned file is not visible
      // in the config but stays on the device.
      const file = localListFile(readRuleSets(ConfigDocumentState.getState().current() ?? '')[index]);

      remove(ruleSetNodePath(index));

      if (file !== null) removeList(file);
    },
    [remove, removeList, openForm, closePanel]
  );

  // The catalog is needed for hints and source labels, but not for the list itself: without
  // it rule sets are visible and deletable, and the form stays with its own address.
  const catalogSettled = !editor.catalogQuery.isPending;
  const loaded = editor.source.isSuccess && catalogSettled;
  const pending = editor.source.isPending || (editor.source.isSuccess && !catalogSettled);
  const listed = loaded && editor.sets.length > 0;
  const editedTag = editor.sets.find((set) => set.index === panel.editing)?.tag ?? '';
  const panelTitle = {
    [RULE_SET_FORM.Catalog]: t('add.title'),
    [RULE_SET_FORM.Custom]: t('custom.title'),
    [RULE_SET_FORM.Edit]: t('edit.title', { tag: editedTag }),
  }[panel.shown];
  const panelForm = (
    <RuleSetPanelForm editor={editor} form={panel.shown} editing={panel.editing} onDone={panel.close} />
  );

  return (
    <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
      {pending && <SkeletonRows className={SURFACE} />}

      {editor.source.isLoadingError && <QueryFailure messageKey='source.config' query={editor.source} />}

      {editor.catalogQuery.isLoadingError && (
        <QueryFailure messageKey='source.ruleSetCatalog' query={editor.catalogQuery} />
      )}

      {editor.needsCache && <ConfigCacheNotice />}

      {loaded && editor.sets.length === 0 && (
        <Empty className='items-stretch border text-left'>
          <EmptyHeader className='items-start'>
            <EmptyTitle>
              <h2>{t('empty.title')}</h2>
            </EmptyTitle>
            <EmptyDescription className='max-w-prose text-pretty'>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className='max-w-none items-stretch'>
            {/* The first rule set moves the screen with the list into the panel: the form open here
                must not pop up in it afterwards. */}
            <RuleSetAddForm
              catalog={editor.catalog}
              takenTags={editor.takenTags}
              outbounds={editor.outbounds}
              onDone={panel.close}
            />
            <div className='flex flex-col items-start gap-4'>
              <Button
                variant='outline'
                size='sm'
                aria-expanded={panel.form === RULE_SET_FORM.Custom}
                onClick={() => {
                  panel.toggle(RULE_SET_FORM.Custom);
                }}
              >
                <Plus data-icon='inline-start' />
                {t('custom.open')}
              </Button>
              {panel.form === RULE_SET_FORM.Custom && (
                <RuleSetCustomForm takenTags={editor.takenTags} onDone={panel.close} />
              )}
            </div>
          </EmptyContent>
        </Empty>
      )}

      {listed && (
        <SidePanelLayout.Root open={panel.form !== null && !asSheet} className='items-start'>
          <SidePanelLayout.Main>
            <RuleSetTable
              sets={filter.sets}
              total={editor.sets.length}
              onEdit={panel.edit}
              onRemove={onRemove}
              search={<RuleSetSearch filter={filter} />}
              empty={<EmptyState onReset={filter.reset} />}
              actions={
                <>
                  <Button
                    variant='outline'
                    size='sm'
                    aria-expanded={panel.form === RULE_SET_FORM.Catalog}
                    onClick={() => {
                      panel.toggle(RULE_SET_FORM.Catalog);
                    }}
                  >
                    <Plus data-icon='inline-start' />
                    {t('add.open')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    aria-expanded={panel.form === RULE_SET_FORM.Custom}
                    onClick={() => {
                      panel.toggle(RULE_SET_FORM.Custom);
                    }}
                  >
                    <Plus data-icon='inline-start' />
                    {t('custom.open')}
                  </Button>
                </>
              }
            />
          </SidePanelLayout.Main>

          <SidePanelLayout.Panel>
            {panel.form !== null && (
              <RuleSetPanel key={`${panel.form}:${String(panel.editing)}`} title={panelTitle} onClose={panel.close}>
                {panelForm}
              </RuleSetPanel>
            )}
          </SidePanelLayout.Panel>
        </SidePanelLayout.Root>
      )}

      {/* Below lg there is no room for the panel beside the list: there it opens as a sheet. */}
      {asSheet && (
        <RuleSetPanelSheet open={listed && panel.form !== null} title={panelTitle} onClose={panel.close}>
          {panelForm}
        </RuleSetPanelSheet>
      )}
    </div>
  );
}

/** Form open in the rule set panel. */
function RuleSetPanelForm({
  editor,
  form,
  editing,
  onDone,
}: {
  editor: RuleSetEditorState;
  form: RuleSetForm;
  editing: number | null;
  onDone: () => void;
}) {
  if (form === RULE_SET_FORM.Custom) {
    return <RuleSetCustomForm takenTags={editor.takenTags} onDone={onDone} />;
  }

  if (form === RULE_SET_FORM.Catalog) {
    return (
      <RuleSetAddForm
        catalog={editor.catalog}
        takenTags={editor.takenTags}
        outbounds={editor.outbounds}
        onDone={onDone}
      />
    );
  }

  const node: unknown = editing === null ? undefined : editor.nodes[editing];

  if (editing === null || typeof node !== 'object' || node === null) {
    return null;
  }

  return (
    <RuleSetEditForm
      key={editing}
      index={editing}
      node={{ ...node }}
      takenTags={editor.takenTags}
      outbounds={editor.outbounds}
      onDone={onDone}
    />
  );
}

/** Search: left edge of the table toolbar. */
function RuleSetSearch({ filter }: { filter: RuleSetFilterState }) {
  const { t } = useTranslation('pages/RuleSets');

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

function EmptyState({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation('pages/RuleSets');

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t('list.notFound', { ns: 'shared' })}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant='outline' size='sm' onClick={onReset}>
          {t('list.resetFilter', { ns: 'shared' })}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
