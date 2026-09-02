// Плагин oxlint (jsPlugins, alpha) с правилами проекта, которых нет в готовых
// наборах. Границы FSD живут отдельно — tools/fsdBoundaries.js.
const QUERY_HOOKS = new Set([
  "useQuery",
  "useSuspenseQuery",
  "useInfiniteQuery",
])

function calleeName(node) {
  if (!node) return null
  if (node.type === "Identifier") return node.name
  if (node.type === "MemberExpression" && node.property.type === "Identifier")
    return node.property.name

  return null
}

export default {
  meta: { name: "project", version: "1.0.0" },
  rules: {
    // Query.md: возврат useQuery не деструктурируем — объект нужен дальше по коду
    // целиком. Готовое query/no-rest-destructuring ловит только `...rest`.
    "no-query-destructuring": {
      meta: { type: "problem", schema: [] },
      create(context) {
        return {
          VariableDeclarator(node) {
            if (node.id?.type !== "ObjectPattern") return
            if (node.init?.type !== "CallExpression") return
            if (!QUERY_HOOKS.has(calleeName(node.init.callee))) return

            context.report({
              node: node.id,
              message:
                "Возврат запроса не деструктурируем: объект query нужен дальше целиком.",
            })
          },
        }
      },
    },
  },
}
