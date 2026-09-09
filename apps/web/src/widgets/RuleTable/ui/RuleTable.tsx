import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search } from "lucide-react"
import { useRef, useState } from "react"

import type { RuleRow as RuleRowModel } from "@entities/Rule"
import { cn } from "@shared/lib/utils"
import { Input } from "@shared/ui"

import { RULE_COLUMN } from "./RuleColumns"
import { RuleRow } from "./RuleRow"

/** Оценка для первого кадра: точную высоту виртуализатор измеряет сам. */
const ROW_ESTIMATE = 52
const OVERSCAN = 8

const features = tableFeatures({
  // Глобальный фильтр в v9 стоит на колоночном: без него он не собирается.
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
})

const helper = createColumnHelper<typeof features, RuleRowModel>()

const columns = helper.columns([
  helper.accessor("searchText", { id: "search" }),
])

/**
 * Список правил маршрутизации.
 *
 * Прокрутка живёт внутри карточки, а `route.final` вынесен из неё отдельной
 * строкой: виртуализатор двигает содержимое трансформами, и закреплённая
 * строка внутри окна прокрутки за ним не удержится.
 */
export function RuleTable({
  rules,
  final,
}: {
  rules: RuleRowModel[]
  final: string | null
}) {
  const [query, setQuery] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const table = useTable({
    features,
    columns,
    data: rules,
    globalFilterFn: "includesString",
    state: { globalFilter: query },
    onGlobalFilterChange: setQuery,
  })

  const rows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
  })

  return (
    <div className="flex min-h-0 grow flex-col gap-4">
      <div className="relative max-w-80">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
          placeholder="Домен, IP или тег outbound"
          className="pl-8"
          aria-label="Поиск по правилам"
        />
      </div>

      <div className="flex min-h-0 grow flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div ref={scrollRef} className="min-h-0 grow overflow-y-auto">
          <div
            className="relative w-full"
            style={{ height: `${String(virtualizer.getTotalSize())}px` }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]

              return (
                <div
                  key={row.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${String(item.start)}px)` }}
                >
                  <RuleRow rule={row.original} />
                </div>
              )
            })}
          </div>
        </div>

        <RuleFinalRow final={final} />
      </div>
    </div>
  )
}

/** Пустая строка здесь читалась бы как «трафик никуда не идёт». */
function RuleFinalRow({ final }: { final: string | null }) {
  return (
    <div
      className={cn(RULE_COLUMN.Row, "shrink-0 border-t border-border bg-card")}
    >
      <span className={RULE_COLUMN.Index}>—</span>
      <div className="flex grow items-center gap-2">
        <span className="text-sm font-medium">Остальной трафик</span>
        <span className="text-xs text-muted-foreground">
          {final === null
            ? "route.final не задан — решает последнее правило без условий"
            : "route.final, из конфига — не правило"}
        </span>
      </div>
      {final !== null && <span className={RULE_COLUMN.Target}>{final}</span>}
    </div>
  )
}
