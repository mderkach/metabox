import { useTranslation } from 'react-i18next';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

/** Пустое значение — выход через узел не проверяется: демон отдаёт эту строку пропуском. */
const NO_TARGET = '';

export function DiagnosticsTargetSelect({
  targets,
  target,
  onTargetChange,
}: {
  targets: readonly string[];
  target: string;
  onTargetChange: (target: string) => void;
}) {
  const { t } = useTranslation('pages/Diagnostics');
  const items = [
    { value: NO_TARGET, label: t('target.none') },
    ...targets.map((name) => ({ value: name, label: name })),
  ];

  return (
    <Select
      items={items}
      value={target}
      onValueChange={(value: string | null) => {
        onTargetChange(value ?? NO_TARGET);
      }}
    >
      <SelectTrigger size='sm' className='w-56 max-w-full' aria-label={t('target.label')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
