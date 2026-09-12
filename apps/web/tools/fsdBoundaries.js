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
const TESTS = '__tests__';

/**
 * Наличие Public API спрашивается у диска каждый раз.
 *
 * Кеш здесь жил бы дольше правды: языковой сервер редактора держит плагин в
 * памяти между правками, и папка, у которой `index.ts` появился уже после
 * первого вопроса, навсегда оставалась бы «без Public API». Линт в редакторе
 * ругал бы верный код, а тот же прогон из CLI молчал — и разойтись они могли
 * бы на недели.
 */
function hasPublicApi(dir) {
  return fs.existsSync(path.join(dir, PUBLIC_API));
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

    if (hasPublicApi(dir)) return { name: slice.join('/'), found: true };
  }

  // Public API по пути не нашёлся: это группа слайсов, файл вне слайса или
  // опечатка. Отвечать именем слайса здесь нельзя — из него получится путь до
  // файла, и правила начнут ругаться на выдуманный слайс.
  return { name: slice.join('/'), found: false };
}

/** Слой и слайс файла по его пути; `null` — файл вне слоёв. */
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

/** Тест или мок: только им открыт `__tests__` чужого слайса. */
function isTestFile(filePath) {
  return filePath.split(path.sep).includes(TESTS);
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

  const target = SLICED.has(alias.layer) ? sliceOf(path.join(from.root, alias.layer), alias.rest) : null;
  const slice = target === null ? '' : target.name;
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

  if (isCrossImport) {
    checkCrossImport(from, alias, deep, report);
    return;
  }

  // Слайс кончается там, где лежит Public API, поэтому путь без него — это
  // группа слайсов или опечатка, а не вход в слайс.
  if (target !== null && slice !== '' && !target.found) {
    report(`У \`@${alias.layer}/${slice}\` нет Public API: это группа слайсов, а не слайс.`);
    return;
  }

  // Фикстуры и моки слайса — вход для тестов, а не часть Public API: через
  // баррель их тянул бы и прод-код, а вместе с ними msw. Остальному коду
  // `__tests__` соседа закрыт так же, как любая другая внутренность слайса.
  if (deep[0] === TESTS && isTestFile(from.filePath)) return;

  if (slice !== '' && deep.length > 0) {
    report(`Импорт в обход Public API: разрешён \`@${alias.layer}/${slice}\`.`);
  }
}

/**
 * Сегмент `@x` — вход, который слайс открывает **конкретному соседу своего
 * слоя**: `entities/Daemon/@x/config` читается как «что Daemon разрешает
 * слайсу Config». Поэтому проверяются оба конца: кто входит и с какого слоя.
 * Сверху вход не нужен — там доступен обычный Public API.
 */
function checkCrossImport(from, alias, deep, report) {
  if (alias.layer !== from.layer) {
    report(`\`@x\` — вход для соседа своего слоя; из ${from.layer} берём Public API \`@${alias.layer}/…\`.`);
    return;
  }

  const target = deep[1];
  const consumer = from.slice ? from.slice.split('/').at(-1) : '';

  if (target && consumer && target.toLowerCase() !== consumer.toLowerCase()) {
    report(`Вход \`@x/${target}\` открыт слайсу \`${target}\`, а импортирует \`${consumer}\`.`);
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

        // Группы вкладываются, поэтому подходит и имя от ближайшей группы, и
        // имя от всей цепочки: `Alpha/Beta/AlphaBetaCard` назван верно, и
        // склейка всего пути в одно слово обвиняла бы его напрасно.
        const parts = from.slice.split('/');
        const slice = parts.pop();
        const group = parts.at(-1);

        if (slice.startsWith(group) || slice.startsWith(parts.join(''))) return {};

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
