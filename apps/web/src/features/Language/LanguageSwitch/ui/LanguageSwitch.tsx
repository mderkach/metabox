import { useTranslation } from 'react-i18next';

import { LANGUAGES, changeLanguage, currentLanguage } from '@shared/lib/i18n';
import { cn } from '@shared/lib/utils';

/**
 * Выбор языка интерфейса. Активный язык берётся у i18next напрямую: он же
 * источник правды для `t`, и своё состояние здесь разошлось бы с ним при смене
 * языка из другого места.
 */
export function LanguageSwitch({ vertical = false }: { vertical?: boolean }) {
  const { t } = useTranslation('features/Language/LanguageSwitch');
  const active = currentLanguage();

  return (
    <div
      role='group'
      aria-label={t('group.label')}
      className={cn('flex gap-0.5 rounded-md bg-muted/60 p-0.5', vertical && 'flex-col')}
    >
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type='button'
          lang={language}
          title={t(`language.${language}`)}
          aria-label={t(`language.${language}`)}
          aria-pressed={language === active}
          onClick={() => {
            void changeLanguage(language);
          }}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-sm text-2xs font-medium text-muted-foreground transition-colors',
            'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
            language === active ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.18)]' : 'hover:text-foreground'
          )}
        >
          {t(`short.${language}`)}
        </button>
      ))}
    </div>
  );
}
