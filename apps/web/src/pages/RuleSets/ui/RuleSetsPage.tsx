import { Info, Plus, Search } from 'lucide-react';
import { useCallback, ViewTransition } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, readRuleSets, ruleSetNodePath } from '@entities/Config';
import { localListFile } from '@entities/RuleSet';
import { ConfigCacheNotice } from '@features/Config/ConfigCacheFile';
import { RuleSetAddForm } from '@features/RuleSet/RuleSetAdd';
import { RuleSetCustomForm } from '@features/RuleSet/RuleSetCustom';
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
  type RuleSetFilterState,
} from '../lib/RuleSets.lib';

/**
 * Наборы правил: что подключено и чем это пополнить.
 *
 * Пустой раздел — не заглушка, а главный экран этого места: у нового
 * пользователя он пуст всегда, и объяснять, зачем нужны наборы, больше негде.
 * Поэтому на пустом месте сразу стоит форма, а не кнопка, открывающая форму.
 * Когда наборы есть, формы открываются в панели рядом со списком (ADR-0037).
 */
export function RuleSetsPage() {
  const { t } = useTranslation('pages/RuleSets');
  const editor = useRuleSetEditor();
  const filter = useRuleSetFilter(editor.sets);
  const remove = ConfigDocumentState.use.remove();
  const removeList = ConfigDocumentState.use.removeList();
  const panel = useRuleSetPanel();
  const asSheet = usePanelAsSheet();

  const onRemove = useCallback(
    (index: number) => {
      // Файл своего списка уезжает вместе с узлом: осиротевший файл не виден
      // в конфиге, но остаётся на устройстве.
      const file = localListFile(readRuleSets(ConfigDocumentState.getState().current() ?? '')[index]);

      remove(ruleSetNodePath(index));

      if (file !== null) removeList(file);
    },
    [remove, removeList]
  );

  // Каталог нужен подсказкам и подписям источника, но не самому списку: без
  // него наборы видны и удаляются, а форма остаётся со своим адресом.
  const catalogSettled = !editor.catalogQuery.isPending;
  const loaded = editor.source.isSuccess && catalogSettled;
  const pending = editor.source.isPending || (editor.source.isSuccess && !catalogSettled);
  const listed = loaded && editor.sets.length > 0;
  const panelTitle = panel.shown === RULE_SET_FORM.Catalog ? t('add.title') : t('custom.title');
  const panelForm =
    panel.shown === RULE_SET_FORM.Catalog ? (
      <RuleSetAddForm
        catalog={editor.catalog}
        takenTags={editor.takenTags}
        outbounds={editor.outbounds}
        onDone={panel.close}
      />
    ) : (
      <RuleSetCustomForm takenTags={editor.takenTags} onDone={panel.close} />
    );

  return (
    <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
      <p className='flex items-start gap-2 text-sm text-pretty text-muted-foreground'>
        <Info className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden='true' />
        <span>{t('lead')}</span>
      </p>

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
            {/* Первый набор уводит экран со списком в панель: открытая здесь
                форма не должна всплыть в ней следом. */}
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
        <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
          <RuleSetTable
            sets={filter.sets}
            total={editor.sets.length}
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

          {panel.form !== null && !asSheet && (
            // Граница снаружи `key`: смена формы идёт как `update`, а не как
            // exit и enter одновременно, иначе панель мигает.
            <ViewTransition enter='panel-in' exit='panel-out'>
              <RuleSetPanel key={panel.form} title={panelTitle} onClose={panel.close}>
                {panelForm}
              </RuleSetPanel>
            </ViewTransition>
          )}
        </div>
      )}

      {/* Ниже lg панели рядом со списком нет места: там она открывается листом. */}
      {listed && asSheet && (
        <RuleSetPanelSheet open={panel.form !== null} title={panelTitle} onClose={panel.close}>
          {panelForm}
        </RuleSetPanelSheet>
      )}
    </div>
  );
}

/** Поиск: левый край тулбара таблицы. */
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
