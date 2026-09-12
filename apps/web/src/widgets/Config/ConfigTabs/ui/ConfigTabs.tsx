import { CONFIG_SECTION, sectionSize, type ConfigDocument, type ConfigSection } from '@entities/Config';
import { cn } from '@shared/lib/utils';

/**
 * Секции конфига в том же порядке, в каком они лежат в файле, — так вкладка
 * находится по памяти о `config.json`, а не по алфавиту. Сколько в секции
 * элементов, знает слайс-владелец документа.
 */
const SECTIONS: ReadonlyArray<{ key: ConfigSection; label: string; ready: boolean }> = [
  { key: CONFIG_SECTION.Route, label: 'Маршрутизация', ready: true },
  { key: CONFIG_SECTION.RuleSet, label: "Rule-set'ы", ready: false },
  { key: CONFIG_SECTION.Inbounds, label: 'Инбаунды', ready: false },
  { key: CONFIG_SECTION.Outbounds, label: 'Аутбаунды', ready: false },
  { key: CONFIG_SECTION.Providers, label: 'Провайдеры', ready: false },
  { key: CONFIG_SECTION.Dns, label: 'DNS', ready: false },
  { key: CONFIG_SECTION.Log, label: 'Логи', ready: false },
  { key: CONFIG_SECTION.Experimental, label: 'Эксперименты', ready: false },
];

export function ConfigTabs({ config }: { config: ConfigDocument | null }) {
  return (
    <div
      role='tablist'
      aria-label='Секции конфига'
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
            title={section.ready ? undefined : 'Раздел ещё не сделан'}
            className={cn(
              'relative mb-1 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium whitespace-nowrap',
              section.ready ? 'text-foreground' : 'text-muted-foreground/60'
            )}
          >
            {section.label}
            {count !== null && <span className='text-xs text-muted-foreground tabular-nums'>{count}</span>}
            {section.ready && <span className='absolute inset-x-0 -bottom-1.5 h-0.5 bg-foreground' />}
          </span>
        );
      })}
    </div>
  );
}
