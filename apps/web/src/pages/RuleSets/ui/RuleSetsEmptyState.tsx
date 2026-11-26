import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { Button, Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@shared/ui';

import { RULE_SETS_NS } from '../i18n/RuleSets.namespace.generated';

export function RuleSetsEmptyState({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation(RULE_SETS_NS);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t('list.notFound', { ns: SHARED_NS })}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant='outline' size='sm' onClick={onReset}>
          {t('list.resetFilter', { ns: SHARED_NS })}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
