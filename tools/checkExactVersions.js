// Версии зависимостей фиксируются точно: диапазон даёт разные деревья на
// машине разработчика и в CI, а обновление проезжает мимо ревью.
// `saveExact` в pnpm-workspace.yaml закрывает установку, этот скрипт — коммит руками.
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

const MANIFESTS = ["package.json", "web/package.json"]
const FIELDS = ["dependencies", "devDependencies", "optionalDependencies"]
const EXACT = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

const root = path.resolve(import.meta.dirname, "..")

const loose = MANIFESTS.flatMap((manifest) => {
  const pkg = JSON.parse(readFileSync(path.join(root, manifest), "utf8"))

  return FIELDS.flatMap((field) =>
    Object.entries(pkg[field] ?? {})
      .filter(([, range]) => !EXACT.test(range))
      .map(([name, range]) => `${manifest} → ${field}: ${name}@${range}`)
  )
})

if (loose.length > 0) {
  console.error("Версии зависимостей должны быть точными:")
  for (const entry of loose) console.error(`  ${entry}`)
  process.exit(1)
}
