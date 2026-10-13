// oxlint plugin (jsPlugins, alpha) with project rules that are absent from the ready-made
// sets. FSD boundaries live separately — tools/fsdBoundaries.js.
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
 * The `return` of the function itself, without returns of functions nested in it: cleanup has its own
 * rule, and a callback passed further inside has nothing to do with the effect.
 */
function ownReturns(node, found = []) {
  if (Array.isArray(node)) {
    for (const item of node) ownReturns(item, found);

    return found;
  }

  // Only AST nodes: they have a `type`. Other fields are positions, a reference to
  // the parent and service data; walking them means looping on `parent`.
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
    // An effect outlives the call: it lands in the error stack, in the React profiler and
    // in the debugger. An anonymous arrow is called there by the component name, so
    // on a screen with three effects it is unclear which one fired.
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
                message:
                  'The effect callback is named: `useEffect(function syncStreams() {…})` or a function reference.',
              });

              return;
            }

            for (const statement of ownReturns(callback.body)) {
              if (isNamedFunction(statement.argument)) continue;

              context.report({
                node: statement.argument,
                message: 'The effect cleanup is named: `return function closeStream() {…}` or a function reference.',
              });
            }
          },
        };
      },
    },

    // Query.md: the useQuery return is not destructured — the object is needed whole further
    // down the code. The ready query/no-rest-destructuring catches only `...rest`.
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
              message: 'Do not destructure the query return: the query object is needed whole further on.',
            });
          },
        };
      },
    },
  },
};
