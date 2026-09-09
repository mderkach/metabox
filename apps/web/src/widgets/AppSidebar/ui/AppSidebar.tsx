import { Activity, Boxes, Gauge, Share2, SlidersHorizontal } from "lucide-react"

import { useDaemonStatus } from "@entities/Daemon"
import { cn } from "@shared/lib/utils"

/**
 * Разделы панели. Реализована пока только конфигурация — остальные помечены
 * недоступными, а не спрятаны: набор экранов задан PRD, и прятать его значит
 * скрывать от пользователя, чего ждать.
 */
const NAV_ITEMS = [
  { key: "overview", label: "Обзор", icon: Gauge, ready: false },
  {
    key: "config",
    label: "Конфигурация",
    icon: SlidersHorizontal,
    ready: true,
  },
  { key: "ruleSets", label: "Каталог rule-set", icon: Boxes, ready: false },
  { key: "proxies", label: "Прокси", icon: Share2, ready: false },
  { key: "connections", label: "Соединения", icon: Activity, ready: false },
] as const

export function AppSidebar() {
  const status = useDaemonStatus()

  return (
    <div className="flex w-58 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          m
        </div>
        <div className="text-sm font-semibold tracking-tight">metabox</div>
      </div>

      <nav className="flex flex-col gap-0.5 p-2.5">
        {NAV_ITEMS.map((item) => (
          <span
            key={item.key}
            aria-disabled={!item.ready}
            aria-current={item.ready ? "page" : undefined}
            title={item.ready ? undefined : "Раздел ещё не сделан"}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm",
              item.ready
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground/60"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </span>
        ))}
      </nav>

      <div className="grow" />

      <div className="border-t border-border px-4 py-3.5">
        {status.isSuccess ? (
          <span className="font-mono text-xs text-muted-foreground">
            {status.data.version}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            демон не отвечает
          </span>
        )}
      </div>
    </div>
  )
}
