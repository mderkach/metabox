import { describe, expect, it } from "vitest"

import { CONFIG_QUERY } from "../api/Config.query"

describe("CONFIG_QUERY", () => {
  it("строит частный ключ от общего, чтобы работала массовая инвалидация", () => {
    expect(CONFIG_QUERY.all).toEqual(["config"])
    expect(CONFIG_QUERY.current()).toEqual(["config", "current"])
  })
})
