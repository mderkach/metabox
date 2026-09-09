// Версии зависимостей фиксируются точно: диапазон даёт разные деревья на
// машине разработчика и в CI, а обновление проезжает мимо ревью.
// `saveExact` в pnpm-workspace.yaml закрывает установку, этот скрипт — коммит руками.
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

const MANIFESTS = ["package.json", "apps/web/package.json"]
const FIELDS = ["dependencies", "devDependencies", "optionalDependencies"]
const EXACT = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/
const CATALOG = /^catalog:/

const root = path.resolve(import.meta.dirname, "..")

/** Версии из секции `catalog:` в pnpm-workspace.yaml. */
function readCatalog() {
  const yaml = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8")
  const section = /^catalog:\n((?:[ \t]+.*\n?)*)/m.exec(yaml)
  if (!section) return []

  return [...section[1].matchAll(/^\s+([^\s:]+):\s*(\S+)\s*$/gm)].map(
    ([, name, version]) => [`pnpm-workspace.yaml → catalog: ${name}`, version]
  )
}

const fromManifests = MANIFESTS.flatMap((manifest) => {
  const pkg = JSON.parse(readFileSync(path.join(root, manifest), "utf8"))

  return FIELDS.flatMap((field) =>
    Object.entries(pkg[field] ?? {}).map(([name, range]) => [
      `${manifest} → ${field}: ${name}`,
      range,
    ])
  )
})

const loose = [...fromManifests, ...readCatalog()].filter(
  ([, range]) => !EXACT.test(range) && !CATALOG.test(range)
)

if (loose.length > 0) {
  console.error("Версии зависимостей должны быть точными:")
  for (const [where, range] of loose) console.error(`  ${where}@${range}`)
  process.exit(1)
}
