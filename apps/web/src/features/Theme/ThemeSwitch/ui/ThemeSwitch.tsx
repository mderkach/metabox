import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { cn } from '@shared/lib/utils';

const THEME_OPTIONS = [
  { value: 'system', label: 'Как в системе', icon: Monitor },
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
] as const;

/**
 * Выбор темы. До монтирования `next-themes` отдаёт `theme` неопределённым — это
 * и есть признак «ещё не знаем, что в хранилище», поэтому отметка активного
 * варианта берётся из него напрямую, без собственного флага готовности.
 */
export function ThemeSwitch({ vertical = false }: { vertical?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role='group'
      aria-label='Оформление'
      className={cn('flex gap-0.5 rounded-md bg-muted/60 p-0.5', vertical && 'flex-col')}
    >
      {THEME_OPTIONS.map((option) => {
        const active = theme === option.value;

        return (
          <button
            key={option.value}
            type='button'
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => {
              setTheme(option.value);
            }}
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
              active ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.18)]' : 'hover:text-foreground'
            )}
          >
            <option.icon className='size-3.5' />
          </button>
        );
      })}
    </div>
  );
}
