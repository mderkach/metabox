import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

/** Empty value: the outbound through a node is not checked; the daemon takes this string as a skip. */
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
  const id = useId();
  const items = [
    { value: NO_TARGET, label: t('target.none') },
    ...targets.map((name) => ({ value: name, label: name })),
  ];

  return (
    <div className='flex min-w-0 items-center gap-2'>
      <Label htmlFor={id} className='shrink-0 text-muted-foreground'>
        {t('target.label')}
      </Label>
      <Select
        items={items}
        value={target}
        onValueChange={(value: string | null) => {
          onTargetChange(value ?? NO_TARGET);
        }}
      >
        <SelectTrigger id={id} size='sm' className='w-56 max-w-full'>
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
    </div>
  );
}
