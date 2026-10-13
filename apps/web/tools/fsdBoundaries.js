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
const GENERATED = new Set(['generated', 'daemon.generated']);
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

/** Layer and slice of a file by its path; `null` means the file is outside the layers. */
function locate(filePath) {
  const parts = filePath.split(path.sep);
  const src = parts.lastIndexOf(SRC);
  if (src === -1) return null;

  const [layer, ...inside] = parts.slice(src + 1);
  if (!RANK.has(layer)) return null;

  const root = parts.slice(0, src + 1).join(path.sep);

  const slice = SLICED.has(layer) ? sliceOf(path.join(root, layer), inside) : null;

  return {
    layer,
    root,
    slice: slice?.found === true ? slice.name : null,
  };
}

/** A test or a mock: only they are allowed into a foreign slice's `__tests__`. */
function isTestFile(filePath) {
  return filePath.split(path.sep).includes(TESTS);
}

function parseAlias(source) {
  const match = /^@([a-z]+)(?:\/(.*))?$/.exec(source);
  if (!match || !RANK.has(match[1])) return null;

  return { layer: match[1], rest: match[2] ? match[2].split('/') : [] };
}

/**
 * The fork schema and the daemon contract live in `shared`, so they are visible to all layers
 * by construction. Only this rule can restrict them: a foreign shape is parsed by
 * an entity, and the model goes outward.
 */
function checkGenerated(from, rest, report) {
  if (!GENERATED.has(rest.at(-1) ?? '')) return;

  const segments = from.filePath.split(path.sep);
  const owned = segments.includes(ENTITIES) && segments.some((segment) => OWNERS.has(segment));

  if (!owned && !segments.includes(TESTS)) {
    report('The generated shape is parsed by an entity: screens read its model.');
  }
}

function checkAlias(from, alias, report) {
  if (RANK.get(alias.layer) < RANK.get(from.layer)) {
    report(`Upward layer import: ${from.layer} cannot see ${alias.layer}.`);
    return;
  }

  checkGenerated(from, alias.rest, report);

  const target = SLICED.has(alias.layer) ? sliceOf(path.join(from.root, alias.layer), alias.rest) : null;
  const slice = target === null ? '' : target.name;
  const deep = alias.rest.slice(slice === '' ? 0 : slice.split('/').length);
  const isCrossImport = SLICED.has(alias.layer) && deep[0] === '@x';

  // A mock drives a scenario through several slices at once — the apply cycle lives
  // in the daemon mocks together with the config rollback endpoint. A test sees the neighbor through
  // its Public API; for production code the rule still applies.
  if (alias.layer === from.layer && !isCrossImport && deep.length === 0 && isTestFile(from.filePath)) return;

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

  // A slice ends where the Public API lies, so a path without it is
  // a slice group or a typo, not an entry into a slice.
  if (target !== null && slice !== '' && !target.found) {
    report(`\`@${alias.layer}/${slice}\` has no Public API: it is a slice group, not a slice.`);
    return;
  }

  // Slice fixtures and mocks are an entry for tests, not part of the Public API: through
  // a barrel production code would pull them in, and msw with them. For other code
  // a neighbor's `__tests__` is closed like any other slice internals.
  if (deep[0] === TESTS && isTestFile(from.filePath)) return;

  if (slice !== '' && deep.length > 0) {
    report(`Import bypassing the Public API: \`@${alias.layer}/${slice}\` is allowed.`);
  }
}

/**
 * The `@x` segment is an entry that a slice opens to a **specific neighbor in its
 * layer**: `entities/Daemon/@x/config` reads as "what Daemon allows to the
 * Config slice". So both ends are checked: who enters and from which layer.
 * From above the entry is not needed — the ordinary Public API is available there.
 */
function checkCrossImport(from, alias, deep, report) {
  if (alias.layer !== from.layer) {
    report(
      `\`@x\` is an entry for a neighbor in its own layer; from ${from.layer} use the Public API \`@${alias.layer}/…\`.`
    );
    return;
  }

  const target = deep[1];
  const consumer = from.slice ? from.slice.split('/').at(-1) : '';

  if (target && consumer && target.toLowerCase() !== consumer.toLowerCase()) {
    report(`Entry \`@x/${target}\` is open to slice \`${target}\`, but \`${consumer}\` imports it.`);
  }
}

function checkRelative(from, source, report) {
  const target = locate(path.resolve(path.dirname(from.filePath), source));

  if (!target) {
    report('A relative path leaves the `src` layers.');
    return;
  }

  if (target.layer !== from.layer) {
    report(`Crossing into layer ${target.layer} by a relative path is allowed only via the alias.`);
    return;
  }

  if (from.slice && target.slice !== from.slice) {
    report('A relative path left the slice: import a neighbor by alias.');
  }
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
          const report = (message) => context.report({ node, message });
          const alias = parseAlias(source);

          if (alias) checkAlias(from, alias, report);
          else if (source.startsWith('.')) checkRelative(from, source, report);
        };

        return {
          ImportDeclaration: (node) => visit(node, node.source.value),
          ExportNamedDeclaration: (node) => node.source && visit(node, node.source.value),
          ExportAllDeclaration: (node) => node.source && visit(node, node.source.value),
        };
      },
    },
  },
};
