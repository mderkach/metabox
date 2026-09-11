// Плагин oxlint (jsPlugins, alpha) с правилами проекта, которых нет в готовых
// наборах. Границы FSD живут отдельно — tools/fsdBoundaries.js.
const QUERY_HOOKS = new Set(['useQuery', 'useSuspenseQuery', 'useInfiniteQuery']);
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function calleeName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') return node.property.name;

  return null;
}

function isNamedFunction(node) {
  if (!node) return true;
  if (node.type === 'Identifier' || node.type === 'MemberExpression') return true;

  return node.type === 'FunctionExpression' && Boolean(node.id);
}

/**
 * `return` самой функции, без возвратов вложенных в неё функций: у cleanup своё
 * правило, а колбэк, переданный дальше внутрь, к эффекту отношения не имеет.
 */
function ownReturns(node, found = []) {
  if (Array.isArray(node)) {
    for (const item of node) ownReturns(item, found);

    return found;
  }

  // Только узлы AST: у них есть `type`. Прочие поля — позиции, ссылка на
  // родителя и служебные данные; идти по ним значит зациклиться на `parent`.
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return found;
  if (FUNCTION_TYPES.has(node.type)) return found;
  if (node.type === 'ReturnStatement') found.push(node);

  for (const key of Object.keys(node)) {
    if (key !== 'parent') ownReturns(node[key], found);
  }

  return found;
}

export default {
  meta: { name: 'project', version: '1.0.0' },
  rules: {
    // Эффект переживает вызов: он попадает в стек ошибки, в профайлер React и
    // в отладчик. Анонимная стрелка называется там именем компонента, поэтому
    // на экране с тремя эффектами непонятно, какой именно сработал.
    'named-effect': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        return {
          CallExpression(node) {
            if (!EFFECT_HOOKS.has(calleeName(node.callee))) return;

            const [callback] = node.arguments;
            if (!callback) return;

            if (!isNamedFunction(callback)) {
              context.report({
                node: callback,
                message: 'Колбэк эффекта именуется: `useEffect(function syncStreams() {…})` или ссылка на функцию.',
              });

              return;
            }

            for (const statement of ownReturns(callback.body)) {
              if (isNamedFunction(statement.argument)) continue;

              context.report({
                node: statement.argument,
                message: 'Отписка эффекта именуется: `return function closeStream() {…}` или ссылка на функцию.',
              });
            }
          },
        };
      },
    },

    // Query.md: возврат useQuery не деструктурируем — объект нужен дальше по коду
    // целиком. Готовое query/no-rest-destructuring ловит только `...rest`.
    'no-query-destructuring': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        return {
          VariableDeclarator(node) {
            if (node.id?.type !== 'ObjectPattern') return;
            if (node.init?.type !== 'CallExpression') return;
            if (!QUERY_HOOKS.has(calleeName(node.init.callee))) return;

            context.report({
              node: node.id,
              message: 'Возврат запроса не деструктурируем: объект query нужен дальше целиком.',
            });
          },
        };
      },
    },
  },
};
