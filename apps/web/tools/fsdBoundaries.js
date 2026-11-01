// oxlint plugin (jsPlugins, alpha): FSD layer and slice boundaries.
// The layer list here is the only one in lint; the same alias names live in
// `paths` of both tsconfigs and in `vite.config.ts`.
// The file is JS, not TS: oxlint loads plugins through Node, a TS variant requires
// native type stripping and an extra tsconfig entry for one file.
import fs from 'node:fs';
import path from 'node:path';

const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const SLICED = new Set(['pages', 'widgets', 'features', 'entities']);
const RANK = new Map(LAYERS.map((layer, index) => [layer, index]));
const SRC = 'src';
const PUBLIC_API = 'index.ts';
const TESTS = '__tests__';
const GENERATED = new Set(['api/generated', 'api/daemon.generated']);
const OWNERS = new Set(['api', 'model']);
const ENTITIES = 'entities';

/**
 * Whether a Public API exists is asked of the disk every time.
 *
 * A cache here would outlive the truth: the editor language server keeps the plugin in
 * memory between edits, and a folder whose `index.ts` appeared after the
 * first question would stay "without Public API" forever. Lint in the editor
 * would flag correct code while the same run from the CLI stayed silent — and they could diverge
 * for weeks.
 */
function hasPublicApi(dir) {
  return fs.existsSync(path.join(dir, PUBLIC_API));
}

/**
 * Slice segments from the layer root: a slice ends where the Public API lies.
 *
 * This way related slices can be put into a group — `features/Rule/RuleEdit` —
 * because a group has no `index.ts` of its own and does not become a slice.
 * The first segment after the layer cannot be taken as the slice: a group would read as
 * a slice, and `@features/Rule/RuleEdit` as a Public API bypass.
 */
function sliceOf(layerRoot, parts) {
  const slice = [];
  let dir = layerRoot;

  for (const part of parts) {
    dir = path.join(dir, part);
    slice.push(part);

    if (hasPublicApi(dir)) return { name: slice.join('/'), found: true };
  }

  // The Public API was not found by path: this is a slice group, a file outside a slice, or
  // a typo. Answering with a slice name here is not allowed — it would yield a path to
  // the file, and rules would start complaining about an invented slice.
  return { name: slice.join('/'), found: false };
}

/** Source contexts outside FSD layers still have import boundaries. */
function locate(filePath) {
  const parts = filePath.split(path.sep);
  const src = parts.findLastIndex(
    (part, index) => part === SRC && (RANK.has(parts[index + 1]) || parts[index + 1] === 'test')
  );
  const auxiliaryPosition = parts.findLastIndex(
    (part, index) =>
      ['mocks', 'dev'].includes(part) && fs.existsSync(path.join(parts.slice(0, index).join(path.sep), SRC))
  );
  const auxiliary = auxiliaryPosition > src ? parts[auxiliaryPosition] : null;
  const root = auxiliary
    ? path.join(parts.slice(0, auxiliaryPosition).join(path.sep), SRC)
    : src !== -1 && parts.slice(0, src + 1).join(path.sep);
  if (!root) return null;

  const [layer, ...inside] = path.relative(root, filePath).split(path.sep);
  if (auxiliary) return { layer: auxiliary, root, slice: null };
  if (layer !== 'test' && !RANK.has(layer)) return null;

  const slice = SLICED.has(layer) ? sliceOf(path.join(root, layer), inside) : null;
  return { layer, root, slice: slice?.found === true ? slice.name : null };
}

function isTestFile(from) {
  return from.layer === 'test' || path.relative(from.root, from.filePath).split(path.sep).includes(TESTS);
}

function canUseTestTooling(from) {
  if (isTestFile(from)) return true;
  return from.layer === 'mocks';
}

function parseAlias(source) {
  const match = /^@([a-z]+)(?:\/(.*))?$/.exec(source);
  if (!match || (!RANK.has(match[1]) && match[1] !== 'test')) return null;
  return { layer: match[1], rest: match[2] ? match[2].split('/') : [] };
}

/** Generated DTOs enter application code through an entity's api/model adapter. */
function checkGenerated(from, alias, report) {
  if (alias.layer !== 'shared' || !GENERATED.has(alias.rest.join('/').replace(/\.ts$/, ''))) return false;
  const segment =
    from.slice && path.relative(path.join(from.root, from.layer, from.slice), from.filePath).split(path.sep)[0];
  if ((from.layer === ENTITIES && OWNERS.has(segment)) || isTestFile(from)) return true;
  report('The generated shape is parsed by an entity: screens read its model.');
  return true;
}

function checkShared(from, rest, report) {
  const boundary = sliceOf(path.join(from.root, 'shared'), rest);
  if (!boundary.found) return;
  const targetRoot = path.join(from.root, 'shared', boundary.name);
  const ownPath = path.relative(targetRoot, from.filePath);
  const internal = from.layer === 'shared' && !ownPath.startsWith(`..${path.sep}`) && ownPath !== '..';
  const deep = rest.slice(boundary.name.split('/').length);
  if (!internal && deep.length > 0 && !(deep.length === 1 && deep[0] === PUBLIC_API)) {
    report(`Import bypassing the Public API: \`@shared/${boundary.name}\` is allowed.`);
  }
}

function checkAlias(from, alias, report) {
  const targetPath = path.resolve(from.root, alias.layer, ...alias.rest);
  const targetContext = locate(targetPath);
  if (!targetContext || targetContext.layer !== alias.layer) {
    report('An alias leaves its layer or enters test, mocks or dev tooling.');
    return;
  }
  alias = {
    layer: alias.layer,
    rest: path.relative(path.join(from.root, alias.layer), targetPath).split(path.sep).filter(Boolean),
  };
  if (alias.rest.includes(TESTS) && !canUseTestTooling(from)) {
    report('Import bypassing the Public API: test fixtures are only available to tests and mocks.');
    return;
  }
  if (alias.layer === 'test') {
    if (!canUseTestTooling(from)) report('Only tests, test tooling and mocks can import test tooling.');
    return;
  }
  const fromRank = RANK.get(from.layer) ?? -1;
  if (RANK.get(alias.layer) < fromRank || (['mocks', 'dev'].includes(from.layer) && alias.layer === 'app')) {
    report(`Upward layer import: ${from.layer} cannot see ${alias.layer}.`);
    return;
  }

  if (checkGenerated(from, alias, report)) return;
  if (alias.layer === 'shared' && alias.rest.includes(TESTS) && canUseTestTooling(from)) return;
  const target = SLICED.has(alias.layer) ? sliceOf(path.join(from.root, alias.layer), alias.rest) : null;
  const slice = target === null ? '' : target.name;
  const deep = alias.rest.slice(slice === '' ? 0 : slice.split('/').length);
  const isCrossImport = SLICED.has(alias.layer) && deep[0] === '@x';

  if (alias.layer === from.layer && !isCrossImport && deep.length === 0 && isTestFile(from)) return;
  if (alias.layer === from.layer && !isCrossImport) {
    report(
      SLICED.has(from.layer)
        ? 'A neighboring slice only through `@x`, an own slice by a relative path.'
        : 'Within a layer use relative paths: the layer alias is an entry from outside.'
    );
    return;
  }
  if (isCrossImport) {
    checkCrossImport(from, alias, deep, report);
    return;
  }
  if (target !== null && !target.found) {
    report(`\`@${alias.layer}/${slice}\` has no Public API: it is a slice group, not a slice.`);
    return;
  }
  if (deep[0] === TESTS && canUseTestTooling(from)) return;
  if (slice !== '' && deep.length > 0) {
    report(`Import bypassing the Public API: \`@${alias.layer}/${slice}\` is allowed.`);
  }
  if (alias.layer === 'shared') {
    // This benchmark measures the private tokenizer without exposing it as application API.
    if (
      path.relative(from.root, from.filePath) === 'widgets/Config/ConfigRawEditor/__tests__/ConfigRawEditor.bench.ts' &&
      alias.rest.join('/') === 'ui/JsonTextarea.lib'
    )
      return;
    checkShared(from, alias.rest, report);
  }
}

/** An @x entry belongs to one named consumer in the same layer. */
function checkCrossImport(from, alias, deep, report) {
  if (alias.layer !== from.layer || !from.slice) {
    report(
      `\`@x\` is an entry for a neighbor in its own layer; from ${from.layer} use the Public API \`@${alias.layer}/…\`.`
    );
    return;
  }
  const target = deep[1];
  const consumer = from.slice.split('/').at(-1);
  if (!target || target.toLowerCase() !== consumer.toLowerCase()) {
    report(`Entry \`@x/${target}\` is open to slice \`${target}\`, but \`${consumer}\` imports it.`);
  }
}

function checkRelative(from, source, report) {
  const targetPath = path.resolve(path.dirname(from.filePath), source);
  const target = locate(targetPath);
  if (!target) {
    report('A relative path leaves the `src` layers.');
    return;
  }
  if (path.relative(from.root, targetPath).split(path.sep).includes(TESTS) && !canUseTestTooling(from)) {
    report('Only tests and mocks can import test fixtures.');
    return;
  }
  if (['test', 'mocks', 'dev'].includes(target.layer)) {
    if (target.layer === from.layer || (target.layer === 'test' && canUseTestTooling(from))) return;
    report('Production and dev code cannot import test, mocks or dev tooling.');
    return;
  }
  if (target.layer !== from.layer) {
    report(`Crossing into layer ${target.layer} by a relative path is allowed only via the alias.`);
    return;
  }
  if (from.slice && target.slice !== from.slice) {
    report('A relative path left the slice: import a neighbor by alias.');
    return;
  }
  if (target.layer === 'shared')
    checkShared(from, path.relative(path.join(from.root, 'shared'), targetPath).split(path.sep), report);
}

export default {
  meta: { name: 'fsd', version: '1.0.0' },
  rules: {
    // A group of related slices is named by a domain, and a slice inside it starts
    // with the same word: `Daemon/DaemonTraffic`, not `Daemon/TrafficChart`.
    // Otherwise the slice name reads apart from the folder and the domain is lost.
    'slice-name': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const from = locate(context.filename);
        if (!from?.slice?.includes('/')) return {};

        // Groups nest, so both the name from the nearest group and
        // the name from the whole chain fit: `Alpha/Beta/AlphaBetaCard` is named correctly, and
        // gluing the whole path into one word would blame it needlessly.
        const parts = from.slice.split('/');
        const slice = parts.pop();
        const group = parts.at(-1);

        if (slice.startsWith(group) || slice.startsWith(parts.join(''))) return {};

        return {
          Program(node) {
            context.report({
              node,
              message: `A slice in group \`${group}\` is named \`${group}…\`, not \`${slice}\`.`,
            });
          },
        };
      },
    },

    boundaries: {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const from = locate(context.filename);
        if (!from) return {};
        from.filePath = context.filename;

        const visit = (node, source) => {
          if (typeof source !== 'string') return;
          const report = (message) => context.report({ node, message });
          const alias = parseAlias(source);

          if (alias) checkAlias(from, alias, report);
          else if (source.startsWith('.')) checkRelative(from, source, report);
        };

        return {
          ImportDeclaration: (node) => visit(node, node.source.value),
          ImportExpression: (node) => {
            const source = node.source;
            if (source.type === 'Literal') visit(node, source.value);
            else if (source.type === 'TemplateLiteral' && source.expressions.length === 0) {
              visit(node, source.quasis[0].value.cooked);
            }
          },
          ExportNamedDeclaration: (node) => node.source && visit(node, node.source.value),
          ExportAllDeclaration: (node) => node.source && visit(node, node.source.value),
        };
      },
    },
  },
};
