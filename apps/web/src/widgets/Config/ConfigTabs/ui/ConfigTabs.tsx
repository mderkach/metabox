import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

import { CONFIG_SECTION, sectionSize, type ConfigDocument, type ConfigSection } from '@entities/Config';
import { cn } from '@shared/lib/utils';

/**
 * Секции конфига в том же порядке, в каком они лежат в файле, — так вкладка
 * находится по памяти о `config.json`, а не по алфавиту. Сколько в секции
 * элементов, знает слайс-владелец документа.
 */
const SECTIONS = [
  { key: CONFIG_SECTION.Route, label: 'section.route', ready: true },
  { key: CONFIG_SECTION.RuleSet, label: 'section.ruleSet', ready: false },
  { key: CONFIG_SECTION.Inbounds, label: 'section.inbounds', ready: false },
  { key: CONFIG_SECTION.Outbounds, label: 'section.outbounds', ready: false },
  { key: CONFIG_SECTION.Providers, label: 'section.providers', ready: false },
  { key: CONFIG_SECTION.Dns, label: 'section.dns', ready: false },
  { key: CONFIG_SECTION.Log, label: 'section.log', ready: false },
  { key: CONFIG_SECTION.Experimental, label: 'section.experimental', ready: false },
] as const satisfies ReadonlyArray<{
  key: ConfigSection;
  label: ParseKeys<'widgets/Config/ConfigTabs'>;
  ready: boolean;
}>;

export function ConfigTabs({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  return (
    <div
      role='tablist'
      aria-label={t('label')}
      className='flex h-11 shrink-0 items-end gap-1 border-b border-border px-6'
    >
      {SECTIONS.map((section) => {
        const count = sectionSize(config, section.key);

        return (
          <span
            key={section.key}
            role='tab'
            aria-selected={section.ready}
            aria-disabled={!section.ready}
            title={section.ready ? undefined : t('unavailable')}
            className={cn(
              'relative mb-1 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium whitespace-nowrap',
              section.ready ? 'text-foreground' : 'text-muted-foreground/60'
            )}
          >
            {t(section.label)}
            {count !== null && <span className='text-xs text-muted-foreground tabular-nums'>{count}</span>}
            {section.ready && <span className='absolute inset-x-0 -bottom-1.5 h-0.5 bg-foreground' />}
          </span>
        );
      })}
    </div>
  );
}
