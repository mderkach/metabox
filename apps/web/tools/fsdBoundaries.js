// Плагин oxlint (jsPlugins, alpha): границы слоёв и слайсов FSD.
// Список слоёв здесь — единственный в линте; те же имена алиасов лежат в
// `paths` обоих tsconfig и в `vite.config.ts`.
// Файл на JS, а не TS: oxlint грузит плагины через Node, TS-вариант требует
// нативного type stripping и лишней записи в tsconfig ради одного файла.
import path from "node:path"

const LAYERS = [
  "app",
  "pages",
  "widgets",
  "features",
  "entities",
  "shared",
  "adapters",
]
const SLICED = new Set(["pages", "widgets", "features", "entities"])
const RANK = new Map(LAYERS.map((layer, index) => [layer, index]))
const SRC = "src"

/** Слой и слайс файла по его пути; `null` — файл вне слоёв. */
function locate(filePath) {
  const parts = filePath.split(path.sep)
  const src = parts.lastIndexOf(SRC)
  if (src === -1) return null

  const [layer, second] = parts.slice(src + 1)
  if (!RANK.has(layer)) return null

  return { layer, slice: SLICED.has(layer) ? second : null }
}

function parseAlias(source) {
  const match = /^@([a-z]+)(?:\/(.*))?$/.exec(source)
  if (!match || !RANK.has(match[1])) return null

  return { layer: match[1], rest: match[2] ? match[2].split("/") : [] }
}

function checkAlias(from, alias, report) {
  if (RANK.get(alias.layer) < RANK.get(from.layer)) {
    report(`Импорт вверх по слоям: ${from.layer} не видит ${alias.layer}.`)
    return
  }

  const [slice, ...deep] = alias.rest
  const isCrossImport = SLICED.has(alias.layer) && deep[0] === "@x"

  if (alias.layer === from.layer && !isCrossImport) {
    report(
      SLICED.has(from.layer)
        ? "Соседний слайс — только через `@x`, свой слайс — относительным путём."
        : "Внутри слоя ходим относительными путями: алиас слоя — вход снаружи."
    )
    return
  }

  if (SLICED.has(alias.layer) && slice && deep.length > 0 && !isCrossImport) {
    report(`Импорт в обход Public API: разрешён \`@${alias.layer}/${slice}\`.`)
  }
}

function checkRelative(from, source, report) {
  const target = locate(path.resolve(path.dirname(from.filePath), source))

  if (!target) {
    report("Относительный путь уводит за пределы слоёв `src`.")
    return
  }

  if (target.layer !== from.layer) {
    report(
      `Переход в слой ${target.layer} относительным путём — только по алиасу.`
    )
    return
  }

  if (from.slice && target.slice !== from.slice) {
    report("Относительный путь вывел за слайс: соседа импортируем по алиасу.")
  }
}

export default {
  meta: { name: "fsd", version: "1.0.0" },
  rules: {
    boundaries: {
      meta: { type: "problem", schema: [] },
      create(context) {
        const from = locate(context.filename)
        if (!from) return {}
        from.filePath = context.filename

        const visit = (node, source) => {
          const report = (message) => context.report({ node, message })
          const alias = parseAlias(source)

          if (alias) checkAlias(from, alias, report)
          else if (source.startsWith(".")) checkRelative(from, source, report)
        }

        return {
          ImportDeclaration: (node) => visit(node, node.source.value),
          ExportNamedDeclaration: (node) =>
            node.source && visit(node, node.source.value),
          ExportAllDeclaration: (node) =>
            node.source && visit(node, node.source.value),
        }
      },
    },
  },
}
