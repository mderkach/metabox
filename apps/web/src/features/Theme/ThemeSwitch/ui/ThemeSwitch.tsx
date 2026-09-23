import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@shared/ui';

const THEME_OPTIONS = [
  { value: 'system', label: 'option.system', icon: Monitor },
  { value: 'light', label: 'option.light', icon: Sun },
  { value: 'dark', label: 'option.dark', icon: Moon },
] as const;

/**
 * Выбор темы. До монтирования `next-themes` отдаёт `theme` неопределённым — это
 * и есть признак «ещё не знаем, что в хранилище», поэтому отметка активного
 * варианта берётся из него напрямую, без собственного флага готовности.
 */
export function ThemeSwitch({ vertical = false }: { vertical?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation('features/Theme/ThemeSwitch');

  return (
    <ToggleGroup
      aria-label={t('group.label')}
      size='sm'
      spacing={0.5}
      orientation={vertical ? 'vertical' : 'horizontal'}
      value={theme === undefined ? [] : [theme]}
      onValueChange={(value) => {
        // Повторное нажатие на отмеченный вариант снимает его, а темы «никакой» нет.
        if (value.length > 0) setTheme(value[0]);
      }}
      className={cn('rounded-md bg-muted/60 p-0.5', vertical && 'flex-col')}
    >
      {THEME_OPTIONS.map((option) => {
        const label = t(option.label);

        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            title={label}
            aria-label={label}
            className='size-6 min-w-6 rounded-sm px-0 text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgb(0_0_0/0.18)]'
          >
            <option.icon className='size-3.5' />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
