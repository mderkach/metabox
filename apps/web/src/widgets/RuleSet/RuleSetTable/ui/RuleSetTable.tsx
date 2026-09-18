import { useTranslation } from 'react-i18next';

import type { RuleSetRow as RuleSetRowModel } from '@entities/RuleSet';

import { RuleSetRow } from './RuleSetRow';

/**
 * Подключённые наборы в порядке файла.
 *
 * Список не виртуализован намеренно: наборов в конфиге десятки, а не сотни —
 * виртуализатор здесь стоил бы абсолютного позиционирования и потери обычной
 * разметки списка ради экономии, которой не видно.
 */
export function RuleSetTable({ sets, onRemove }: { sets: RuleSetRowModel[]; onRemove: (index: number) => void }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');

  return (
    <section className='flex flex-col gap-2'>
      <h2 className='sr-only'>{t('title')}</h2>
      <ul className='overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10'>
        {sets.map((set) => (
          <li key={set.id}>
            <RuleSetRow set={set} onRemove={onRemove} />
          </li>
        ))}
      </ul>
    </section>
  );
}
