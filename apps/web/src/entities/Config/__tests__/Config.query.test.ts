import { describe, expect, it } from "vitest"

import { CONFIG_FIXTURE } from "../api/Config.mock"
import { CONFIG_QUERY, parseConfig } from "../api/Config.query"

describe("CONFIG_QUERY", () => {
  it("строит частный ключ от общего, чтобы работала массовая инвалидация", () => {
    expect(CONFIG_QUERY.all).toEqual(["config"])
    expect(CONFIG_QUERY.current()).toEqual(["config", "current"])
  })
})

describe("parseConfig", () => {
  it("разбирает конфиг с устройства без замечаний", () => {
    const parsed = parseConfig(CONFIG_FIXTURE)

    expect(parsed.issues).toEqual([])
    expect(parsed.config?.route?.rules).toHaveLength(32)
  })

  it("сохраняет узлы, которых нет в схеме: их нельзя терять при round-trip", () => {
    const parsed = parseConfig({ ...CONFIG_FIXTURE, unknown_section: { a: 1 } })

    expect(parsed.issues).toEqual([])
    expect(parsed.config?.unknown_section).toEqual({ a: 1 })
  })

  it("на неразобранном конфиге отдаёт замечания, а не пустой результат", () => {
    const parsed = parseConfig({ inbounds: "не список" })

    expect(parsed.config).toBeNull()
    expect(parsed.issues.length).toBeGreaterThan(0)
    expect(parsed.issues[0]).toContain("inbounds")
  })
})
