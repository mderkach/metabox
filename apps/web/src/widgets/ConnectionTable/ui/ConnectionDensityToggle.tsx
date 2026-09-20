import { Rows3, Rows4 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui';

import { TABLE_DENSITY, type TableDensity } from '../lib';

/**
 * Плотность строк — управление видом, а не действие над данными, поэтому
 * стоит рядом с выбором полей, а не в ряду действий списка.
 */
export function ConnectionDensityToggle({
  density,
  onDensityChange,
}: {
  density: TableDensity;
  onDensityChange: (density: TableDensity) => void;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const compact = density === TABLE_DENSITY.Compact;
  const Icon = compact ? Rows4 : Rows3;

  return (
    <Button
      variant='ghost'
      size='icon-sm'
      aria-pressed={compact}
      aria-label={t('density.label')}
      onClick={() => {
        onDensityChange(compact ? TABLE_DENSITY.Comfortable : TABLE_DENSITY.Compact);
      }}
      className={cn(
        'text-muted-foreground hover:text-foreground',
        compact && 'bg-selected text-foreground ring-1 ring-selected-edge'
      )}
    >
      <Icon />
    </Button>
  );
}
