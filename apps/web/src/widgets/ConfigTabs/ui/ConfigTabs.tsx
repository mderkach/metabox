import type { Config } from "@shared/api/generated"
import { cn } from "@shared/lib/utils"

/**
 * Секции конфига в том же порядке, в каком они лежат в файле, — так вкладка
 * находится по памяти о `config.json`, а не по алфавиту.
 *
 * `count` возвращает число элементов секции или `null`, если считать нечего:
 * у логов и экспериментов нет списка.
 */
const SECTIONS = [
  {
    key: "route",
    label: "Маршрутизация",
    ready: true,
    count: (config: Config) => config.route?.rules?.length ?? 0,
  },
  {
    key: "ruleSet",
    label: "Rule-set'ы",
    ready: false,
    count: (config: Config) => config.route?.rule_set?.length ?? 0,
  },
  {
    key: "inbounds",
    label: "Инбаунды",
    ready: false,
    count: (config: Config) => config.inbounds?.length ?? 0,
  },
  {
    key: "outbounds",
    label: "Аутбаунды",
    ready: false,
    count: (config: Config) => config.outbounds?.length ?? 0,
  },
  {
    key: "providers",
    label: "Провайдеры",
    ready: false,
    count: (config: Config) => config.providers?.length ?? 0,
  },
  {
    key: "dns",
    label: "DNS",
    ready: false,
    count: (config: Config) => config.dns?.servers?.length ?? 0,
  },
  { key: "log", label: "Логи", ready: false, count: () => null },
  {
    key: "experimental",
    label: "Эксперименты",
    ready: false,
    count: () => null,
  },
] as const

export function ConfigTabs({ config }: { config: Config | null }) {
  return (
    <div
      role="tablist"
      aria-label="Секции конфига"
      className="flex h-11 shrink-0 items-end gap-1 border-b border-border px-6"
    >
      {SECTIONS.map((section) => {
        const count = config === null ? null : section.count(config)

        return (
          <span
            key={section.key}
            role="tab"
            aria-selected={section.ready}
            aria-disabled={!section.ready}
            title={section.ready ? undefined : "Раздел ещё не сделан"}
            className={cn(
              "relative mb-1 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium whitespace-nowrap",
              section.ready ? "text-foreground" : "text-muted-foreground/60"
            )}
          >
            {section.label}
            {count !== null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
            {section.ready && (
              <span className="absolute inset-x-0 -bottom-1.5 h-0.5 bg-foreground" />
            )}
          </span>
        )
      })}
    </div>
  )
}
