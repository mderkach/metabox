import { useMemo } from "react"

import { useConfig } from "@entities/Config"
import { toRuleRows, type RuleRow } from "@entities/Rule"
import type { Config } from "@shared/api/generated"

export interface RouteEditorState {
  isPending: boolean
  /** Замечания схемы. Непусты — конфиг показывать нечем, см. `parseConfig`. */
  issues: string[]
  config: Config | null
  rules: RuleRow[]
  /** `route.final` необязателен: без него решает последнее правило без условий. */
  final: string | null
}

/**
 * Данные экрана маршрутизации.
 *
 * Разворачивание `route.rules` в строки живёт здесь, а не в разметке: маппер
 * пробегает весь список, и на 500 правилах (NFR-2) вызов из тела рендера
 * повторялся бы на каждое нажатие клавиши в поиске.
 */
export function useRouteEditor(): RouteEditorState {
  const config = useConfig()
  const parsed = config.data ?? null
  const document = parsed?.config ?? null

  const rules = useMemo(() => toRuleRows(document), [document])

  return {
    isPending: config.isPending,
    issues: parsed?.issues ?? [],
    config: document,
    rules,
    final: document?.route?.final ?? null,
  }
}
