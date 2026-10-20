import { useTranslation } from 'react-i18next';

import { Button, Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@shared/ui';

import type { RuleFilterState } from '../lib/Editor.lib';

/** The filter left no rules: the list is not empty, it is trimmed. */
export function EditorFilteredEmpty({ filter }: { filter: RuleFilterState }) {
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
