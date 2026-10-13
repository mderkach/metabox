import { useTranslation } from 'react-i18next';

import { LANGUAGES, changeLanguage, currentLanguage } from '@shared/lib/i18n';
import { cn } from '@shared/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@shared/ui';

/**
 * Interface language choice. The active language is taken from i18next
 * directly: it is also the source of truth for `t`, and a state of its own here
 * would diverge from it when the language is changed from another place.
 */
export function LanguageSwitch({ vertical = false }: { vertical?: boolean }) {
  const { t } = useTranslation('features/Language/LanguageSwitch');

  return (
    <ToggleGroup
      aria-label={t('group.label')}
      size='sm'
      spacing={0.5}
      orientation={vertical ? 'vertical' : 'horizontal'}
      value={[currentLanguage()]}
      onValueChange={(value) => {
        // Pressing the selected language again deselects it, and without a language there is no interface.
        const next = LANGUAGES.find((language) => language === value[0]);
        if (next !== undefined) void changeLanguage(next);
      }}
      className={cn('rounded-md bg-muted/60 p-0.5', vertical && 'flex-col')}
    >
      {LANGUAGES.map((language) => (
        <ToggleGroupItem
          key={language}
          value={language}
          lang={language}
          title={t(`language.${language}`)}
          aria-label={t(`language.${language}`)}
          className='size-6 min-w-6 rounded-sm px-0 text-xs text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgb(0_0_0/0.18)]'
        >
          {t(`short.${language}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
