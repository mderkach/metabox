import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import { newRuleNode } from '@entities/Rule';
import { Button } from '@shared/ui';

/**
 * Новое правило в конец `route.rules`: без условий, с выходом в маршрут по
 * умолчанию. Массива в файле может не быть — вставка его создаёт.
 *
 * Без выхода кнопка гаснет и говорит почему: правило без `outbound` sing-box
 * отвергает, а выдумывать тег, которого в конфиге нет, панель не вправе.
 */
export function RuleAddButton({
  index,
  outbound,
  onAdded,
}: {
  /** Номер нового правила, с единицы: длина `route.rules` плюс один. */
  index: number;
  /** Выход нового правила; `null` — выхода нет, добавить нельзя. */
  outbound: string | null;
  onAdded: (index: number) => void;
}) {
  const { t } = useTranslation('features/Rule/RuleAdd');
  const insert = ConfigDocumentState.use.insert();

  return (
    <>
      {outbound === null && <p className='text-xs text-muted-foreground'>{t('unavailable')}</p>}
      <Button
        variant='outline'
        size='sm'
        disabled={outbound === null}
        onClick={() => {
          if (outbound === null) {
            return;
          }

          insert(ruleNodePath(index), newRuleNode(outbound));
          onAdded(index);
        }}
      >
        <Plus />
        {t('add')}
      </Button>
    </>
  );
}
