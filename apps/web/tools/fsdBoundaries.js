// Плагин oxlint (jsPlugins, alpha): границы слоёв и слайсов FSD.
// Список слоёв здесь — единственный в линте; те же имена алиасов лежат в
// `paths` обоих tsconfig и в `vite.config.ts`.
// Файл на JS, а не TS: oxlint грузит плагины через Node, TS-вариант требует
// нативного type stripping и лишней записи в tsconfig ради одного файла.
import fs from 'node:fs';
import path from 'node:path';

const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const SLICED = new Set(['pages', 'widgets', 'features', 'entities']);
const RANK = new Map(LAYERS.map((layer, index) => [layer, index]));
const SRC = 'src';
const PUBLIC_API = 'index.ts';

const publicApi = new Map();

function hasPublicApi(dir) {
  let known = publicApi.get(dir);

  if (known === undefined) {
    known = fs.existsSync(path.join(dir, PUBLIC_API));
    publicApi.set(dir, known);
  }

  return known;
}

/**
 * Сегменты слайса от корня слоя: слайс кончается там, где лежит Public API.
 *
 * Так родственные слайсы можно складывать в группу — `features/Rule/RuleEdit`, —
 * потому что у группы своего `index.ts` нет и слайсом она не становится.
 * Считать слайсом первый сегмент после слоя нельзя: группа читалась бы как
 * слайс, а `@features/Rule/RuleEdit` — как обход Public API.
 */
function sliceOf(layerRoot, parts) {
  const slice = [];
  let dir = layerRoot;

  for (const part of parts) {
    dir = path.join(dir, part);
    slice.push(part);

    if (hasPublicApi(dir)) break;
  }

  return slice.join('/');
}

/** Слой и слайс файла по его пути; `null` — файл вне слоёв. */
function locate(filePath) {
  const parts = filePath.split(path.sep);
  const src = parts.lastIndexOf(SRC);
  if (src === -1) return null;

  const [layer, ...inside] = parts.slice(src + 1);
  if (!RANK.has(layer)) return null;

  const root = parts.slice(0, src + 1).join(path.sep);

  return {
    layer,
    root,
    slice: SLICED.has(layer) ? sliceOf(path.join(root, layer), inside) : null,
  };
}

function parseAlias(source) {
  const match = /^@([a-z]+)(?:\/(.*))?$/.exec(source);
  if (!match || !RANK.has(match[1])) return null;

  return { layer: match[1], rest: match[2] ? match[2].split('/') : [] };
}

function checkAlias(from, alias, report) {
  if (RANK.get(alias.layer) < RANK.get(from.layer)) {
    report(`Импорт вверх по слоям: ${from.layer} не видит ${alias.layer}.`);
    return;
  }

  const slice = SLICED.has(alias.layer) ? sliceOf(path.join(from.root, alias.layer), alias.rest) : '';
  const deep = alias.rest.slice(slice === '' ? 0 : slice.split('/').length);
  const isCrossImport = SLICED.has(alias.layer) && deep[0] === '@x';

  if (alias.layer === from.layer && !isCrossImport) {
    report(
      SLICED.has(from.layer)
        ? 'Соседний слайс — только через `@x`, свой слайс — относительным путём.'
        : 'Внутри слоя ходим относительными путями: алиас слоя — вход снаружи.'
    );
    return;
  }

  if (SLICED.has(alias.layer) && slice !== '' && deep.length > 0 && !isCrossImport) {
    report(`Импорт в обход Public API: разрешён \`@${alias.layer}/${slice}\`.`);
  }
}

function checkRelative(from, source, report) {
  const target = locate(path.resolve(path.dirname(from.filePath), source));

  if (!target) {
    report('Относительный путь уводит за пределы слоёв `src`.');
    return;
  }

  if (target.layer !== from.layer) {
    report(`Переход в слой ${target.layer} относительным путём — только по алиасу.`);
    return;
  }

  if (from.slice && target.slice !== from.slice) {
    report('Относительный путь вывел за слайс: соседа импортируем по алиасу.');
  }
}

export default {
  meta: { name: 'fsd', version: '1.0.0' },
  rules: {
    // Группа родственных слайсов названа доменом, и слайс внутри неё начинается
    // с того же слова: `Daemon/DaemonTraffic`, а не `Daemon/TrafficChart`.
    // Иначе имя слайса читается в отрыве от папки и домен теряется.
    'slice-name': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const from = locate(context.filename);
        if (!from?.slice?.includes('/')) return {};

        const [group, ...rest] = from.slice.split('/');
        const slice = rest.join('');

        if (slice.startsWith(group)) return {};

        return {
          Program(node) {
            context.report({
              node,
              message: `Слайс в группе \`${group}\` называется \`${group}…\`, а не \`${slice}\`.`,
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
