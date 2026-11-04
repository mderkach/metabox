import { useTranslation } from 'react-i18next';

import { Button, Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@shared/ui';

export function RuleSetsEmptyState({ onReset }: { onReset: () => void }) {
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
