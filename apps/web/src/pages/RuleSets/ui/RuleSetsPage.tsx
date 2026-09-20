import { Link } from '@tanstack/react-router';
import { Info, Plus, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleSetNodePath } from '@entities/Config';
import { useConfigPath } from '@entities/Daemon';
import { ConfigApplyHistory } from '@features/Config/ConfigApply';
import { ConfigCacheNotice } from '@features/Config/ConfigCacheFile';
import { RuleSetAddForm } from '@features/RuleSet/RuleSetAdd';
import { Badge, Button, buttonVariants, Input } from '@shared/ui';
import { ConfigTabs } from '@widgets/Config/ConfigTabs';
import { PageHeader } from '@widgets/PageHeader';
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
  const configPath = useConfigPath();
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

  const empty = editor.sets.length === 0;

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <>
            <ConfigApplyHistory />
            <Link to='/config/raw' className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {t('raw')}
            </Link>
          </>
        }
      >
        <p className='font-mono text-xs text-muted-foreground'>{configPath}</p>
        {editor.isDirty && <Badge variant='secondary'>{t('draft')}</Badge>}
      </PageHeader>

      <ConfigTabs config={editor.config} />

      <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
        <p className='flex items-start gap-2 text-sm text-pretty text-muted-foreground'>
          <Info className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden='true' />
          <span>{t('lead')}</span>
        </p>

        {editor.isPending && <p className='text-sm text-muted-foreground'>{t('pending')}</p>}

        {editor.needsCache && <ConfigCacheNotice />}

        {empty ? (
          <section className='flex flex-col gap-4 rounded-xl border border-dashed border-border p-4 sm:p-5'>
            <div className='flex flex-col gap-1.5'>
              <h2 className='text-sm font-semibold'>{t('empty.title')}</h2>
              <p className='max-w-prose text-sm text-pretty text-muted-foreground'>{t('empty.description')}</p>
            </div>
            <RuleSetAddForm takenTags={editor.takenTags} outbounds={editor.outbounds} />
          </section>
        ) : (
          <>
            <RuleSetTable
              sets={filter.sets}
              total={editor.sets.length}
              onRemove={onRemove}
              search={<RuleSetSearch filter={filter} />}
              empty={<EmptyState onReset={filter.reset} />}
            />

            {adding ? (
              <section className='flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5'>
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
    </>
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
    <div className='flex flex-col items-center gap-2'>
      <p className='text-sm text-muted-foreground'>{t('notFound')}</p>
      <Button variant='outline' size='sm' onClick={onReset}>
        {t('resetFilter')}
      </Button>
    </div>
  );
}
