import { useCallback, useState } from "react"

const STORAGE_KEY = "metabox.sidebar.collapsed"

/** В приватном окне обращение к хранилищу бросает. */
function readCollapsed(): boolean {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, String(collapsed))
  } catch {
    // Не сохранилось — панель вернётся к развёрнутому виду.
  }
}

/** Выбор переживает перезагрузку страницы. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      writeCollapsed(!current)

      return !current
    })
  }, [])

  return { collapsed, toggle }
}
