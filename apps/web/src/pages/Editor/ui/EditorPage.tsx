import { useConfig } from "@entities/Config"
import { toRuleRows } from "@entities/Rule"
import { AppSidebar } from "@widgets/AppSidebar"
import { ConfigTabs } from "@widgets/ConfigTabs"
import { RuleTable } from "@widgets/RuleTable"

/** Путь к файлу, которым владеет демон (`-config-dir` и `-config-name`). */
const CONFIG_PATH = "/etc/sing-box/config.json"

export function EditorPage() {
  const config = useConfig()
  const rules = toRuleRows(config.data ?? null)
  const final = config.data?.route?.final ?? null

  return (
    <div className="flex h-full bg-background text-foreground">
      <AppSidebar />

      <div className="flex min-w-0 grow flex-col">
        <header className="flex h-14 shrink-0 items-baseline gap-2.5 border-b border-border px-6">
          <span className="text-base font-medium">Конфигурация</span>
          <span className="font-mono text-xs text-muted-foreground">
            {CONFIG_PATH}
          </span>
        </header>

        <ConfigTabs config={config.data ?? null} />

        <div className="flex min-h-0 grow flex-col gap-4 px-6 py-5">
          <p className="rounded-xl bg-muted px-3.5 py-3 text-sm text-pretty text-muted-foreground">
            Правила проверяются{" "}
            <span className="font-medium text-foreground">
              сверху вниз, срабатывает первое подходящее
            </span>{" "}
            — не самое точное. Правило ниже уже сработавшего никогда не
            выполнится, поэтому порядок здесь и есть логика.
          </p>

          {config.isPending ? (
            <p className="text-sm text-muted-foreground">Загружаю конфиг…</p>
          ) : (
            <RuleTable rules={rules} final={final} />
          )}
        </div>
      </div>
    </div>
  )
}
