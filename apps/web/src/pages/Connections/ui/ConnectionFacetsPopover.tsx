import { SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@shared/ui';

/**
 * Срезы на узком экране. Строкой чипов они заняли бы половину экрана телефона,
 * поэтому уходят под одну кнопку тулбара.
 *
 * Кнопка несёт число выбранных срезов: иначе спрятанный отбор выглядит как
 * пропавшие строки.
 */
export function ConnectionFacetsPopover({ active, children }: { active: number; children: ReactNode }) {
  const { t } = useTranslation('pages/Connections');

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant='outline'
            size='sm'
            aria-label={active === 0 ? t('facets.label') : t('facets.active', { count: active })}
            className={cn(active > 0 && 'bg-selected text-foreground ring-1 ring-selected-edge')}
          />
        }
      >
        <SlidersHorizontal />
        {t('facets.label')}
        {active > 0 && <span className='font-mono tabular-nums'>{active}</span>}
      </PopoverTrigger>

      <PopoverContent className='w-72'>
        <PopoverTitle>{t('facets.title')}</PopoverTitle>
        {children}
      </PopoverContent>
    </Popover>
  );
}
