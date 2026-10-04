import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import { Button } from '@shared/ui';

/**
 * Удаление правила из черновика. Подтверждения нет: на устройство правка
 * уходит только применением, а до него её снимает отмена правок черновика.
 */
export function RuleDeleteButton({
  index,
  onDeleted,
}: {
  /** Номер правила, с единицы. */
  index: number;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('features/Rule/RuleDelete');
  const remove = ConfigDocumentState.use.remove();

  return (
    <Button
      variant='ghost'
      size='icon-sm'
      aria-label={t('remove', { index })}
      onClick={() => {
        onDeleted();
        remove(ruleNodePath(index));
      }}
    >
      <Trash2 />
    </Button>
  );
}
