import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { App } from "../ui/App"

test("рендерит карточку-заглушку", () => {
  render(<App />)

  expect(screen.getByText("metabox")).toBeInTheDocument()
  expect(screen.getByLabelText("Адрес прослушивания")).toHaveValue(
    "127.0.0.1:9090"
  )
  expect(screen.getByRole("switch", { name: "Sniff" })).toBeInTheDocument()
})
