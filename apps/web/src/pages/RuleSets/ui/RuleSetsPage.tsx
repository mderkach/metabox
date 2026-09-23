import { Info, Plus, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleSetNodePath } from '@entities/Config';
import { ConfigCacheNotice } from '@features/Config/ConfigCacheFile';
import { RuleSetAddForm } from '@features/RuleSet/RuleSetAdd';
import { cn } from '@shared/lib/utils';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  QueryFailure,
  SURFACE,
  SkeletonRows,
} from '@shared/ui';
import { RuleSetTable } from '@widgets/RuleSet/RuleSetTable';

import { useRuleSetEditor, useRuleSetFilter, type RuleSetFilterState } from '../lib/RuleSets.lib';

/**
 * Наборы правил: что подключено и чем это пополнить.
 *
 * Пустой раздел — не заглушка, а главный экран этого места: у нового
 * пользователя он пуст всегда, и объяснять, зачем нужны наборы, больше негде.
 * Поэтому на пустом месте сразу стоит форма, а не кнопка, открывающая форму.
 */
export function RuleSetsPage() {
  const { t } = useTranslation('pages/RuleSets');
  const editor = useRuleSetEditor();
  const filter = useRuleSetFilter(editor.sets);
  const remove = ConfigDocumentState.use.remove();
  const [adding, setAdding] = useState(false);

  const onRemove = useCallback(
    (index: number) => {
      remove(ruleSetNodePath(index));
    },
    [remove]
  );

  const closeForm = useCallback(() => {
    setAdding(false);
  }, []);

  const loaded = editor.source.isSuccess;

  return (
    <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
      <p className='flex items-start gap-2 text-sm text-pretty text-muted-foreground'>
        <Info className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden='true' />
        <span>{t('lead')}</span>
      </p>

      {editor.source.isPending && <SkeletonRows className={SURFACE} />}

      {editor.source.isLoadingError && <QueryFailure messageKey='source.config' query={editor.source} />}

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
            <RuleSetAddForm takenTags={editor.takenTags} outbounds={editor.outbounds} />
          </EmptyContent>
        </Empty>
      )}

      {loaded && editor.sets.length > 0 && (
        <>
          <RuleSetTable
            sets={filter.sets}
            total={editor.sets.length}
            onRemove={onRemove}
            search={<RuleSetSearch filter={filter} />}
            empty={<EmptyState onReset={filter.reset} />}
          />

          {adding ? (
            <section className={cn('flex flex-col gap-4 p-4 sm:p-5', SURFACE)}>
              <h2 className='text-sm font-semibold'>{t('add.title')}</h2>
              <RuleSetAddForm takenTags={editor.takenTags} outbounds={editor.outbounds} onDone={closeForm} />
            </section>
          ) : (
            <Button
              variant='outline'
              className='w-fit'
              onClick={() => {
                setAdding(true);
              }}
            >
              <Plus />
              {t('add.open')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/** Поиск: левый край тулбара таблицы. */
function RuleSetSearch({ filter }: { filter: RuleSetFilterState }) {
  const { t } = useTranslation('pages/RuleSets');

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
