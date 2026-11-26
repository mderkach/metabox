import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { Button, Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@shared/ui';

import { EDITOR_NS } from '../i18n/Editor.namespace.generated';
import type { RuleFilterState } from '../lib/Editor.lib';

/** The filter left no rules: the list is not empty, it is trimmed. */
export function EditorFilteredEmpty({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation(EDITOR_NS);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t('list.notFound', { ns: SHARED_NS })}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant='outline' size='sm' onClick={filter.reset}>
          {t('list.resetFilter', { ns: SHARED_NS })}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
