import { describe, expect, it } from "vitest"

import type { Config } from "@shared/api/generated"

import { toRuleRows } from "../model/Rule.mapper"
import { RULE_TARGET } from "../model/Rule.model"

function configWithRules(rules: object[]): Config {
  // Правила в схеме — union из 57 веток; фикстура теста собирается литералом,
  // и сузить его до нужной ветки может только утверждение.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- см. выше
  return { route: { rules } } as Config
}

describe("toRuleRows", () => {
  it("возвращает пустой список, когда правил нет", () => {
    expect(toRuleRows(null)).toEqual([])
    expect(toRuleRows({})).toEqual([])
  })

  it("нумерует правила с единицы и сохраняет порядок из конфига", () => {
    const rows = toRuleRows(
      configWithRules([
        { rule_set: ["openai"], outbound: "proxy" },
        { rule_set: ["github"], outbound: "direct" },
      ])
    )

    expect(rows.map((row) => row.index)).toEqual([1, 2])
    expect(rows.map((row) => row.target)).toEqual(["proxy", "direct"])
  })

  it("собирает условия из полей схемы и приводит значения к списку", () => {
    const [row] = toRuleRows(
      configWithRules([{ port: 53, domain_suffix: ["rt.ru", "usmall.ru"] }])
    )

    expect(row.matchers).toContainEqual({ key: "port", values: ["53"] })
    expect(row.matchers).toContainEqual({
      key: "domain_suffix",
      values: ["rt.ru", "usmall.ru"],
    })
  })

  it("упорядочивает условия по схеме, а не по порядку ключей в файле", () => {
    const direct = toRuleRows(
      configWithRules([{ domain_suffix: ["rt.ru"], port: 53 }])
    )
    const reversed = toRuleRows(
      configWithRules([{ port: 53, domain_suffix: ["rt.ru"] }])
    )

    expect(direct[0].matchers).toEqual(reversed[0].matchers)
  })

  it("различает outbound и action", () => {
    const rows = toRuleRows(
      configWithRules([
        { inbound: ["dns-in"], action: "hijack-dns" },
        { rule_set: ["apple"], outbound: "proxy" },
      ])
    )

    expect(rows[0].targetKind).toBe(RULE_TARGET.Action)
    expect(rows[0].target).toBe("hijack-dns")
    expect(rows[1].targetKind).toBe(RULE_TARGET.Outbound)
  })

  it("считает route действием по умолчанию, когда его не указали", () => {
    const [row] = toRuleRows(configWithRules([{ domain: ["example.com"] }]))

    expect(row.target).toBe("route")
    expect(row.targetKind).toBe(RULE_TARGET.Action)
  })

  it("отмечает правило без условий: оно ловит весь остальной трафик", () => {
    const [row] = toRuleRows(configWithRules([{ outbound: "direct" }]))

    expect(row.isCatchAll).toBe(true)
    expect(row.matchers).toEqual([])
  })

  it("не считает условием служебное поле type", () => {
    const [row] = toRuleRows(
      configWithRules([{ type: "default", outbound: "direct" }])
    )

    expect(row.matchers).toEqual([])
  })

  it("складывает условия и цель в строку поиска", () => {
    const [row] = toRuleRows(
      configWithRules([{ domain_suffix: ["rt.ru"], outbound: "direct" }])
    )

    expect(row.searchText).toBe("domain_suffix rt.ru direct")
  })
})
