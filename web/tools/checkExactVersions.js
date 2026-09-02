// Версии зависимостей фиксируются точно: диапазон даёт разные деревья на
// машине разработчика и в CI, а обновление проезжает мимо ревью.
// `save-exact=true` в `.npmrc` закрывает установку, этот скрипт — коммит руками.
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

const FIELDS = ["dependencies", "devDependencies", "optionalDependencies"]
const EXACT = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

const manifestPath = path.resolve(import.meta.dirname, "../package.json")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))

const loose = FIELDS.flatMap((field) =>
  Object.entries(manifest[field] ?? {})
    .filter(([, range]) => !EXACT.test(range))
    .map(([name, range]) => `${field}: ${name}@${range}`)
)

if (loose.length > 0) {
  console.error("Версии зависимостей должны быть точными:")
  for (const entry of loose) console.error(`  ${entry}`)
  process.exit(1)
}
