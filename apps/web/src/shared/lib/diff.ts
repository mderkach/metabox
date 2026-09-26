/** Значение уходит в разметку ключом стиля, поэтому строка, а не число. */
export const DIFF_KIND = {
  Same: 'same',
  Added: 'added',
  Removed: 'removed',
} as const;

export type DiffKind = (typeof DIFF_KIND)[keyof typeof DIFF_KIND];

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** Номер строки в применённом конфиге; `null` — строки там не было. */
  before: number | null;
  /** Номер строки в черновике; `null` — строка удалена. */
  after: number | null;
}

/** Кусок дифа: изменения вместе с контекстом вокруг них. */
export interface DiffHunk {
  /** Сколько совпадающих строк скрыто перед куском. */
  skipped: number;
  lines: DiffLine[];
}

/**
 * Потолок на таблицу сравнения. Конфиг на 500 правил — около двух
 * тысяч строк, а совпадающие края из сравнения выпадают; упереться в потолок
 * может только замена файла целиком, и там построчный диф всё равно ничего не
 * объясняет.
 */
const MAX_CELLS = 4_000_000;

function line(kind: DiffKind, text: string, before: number | null, after: number | null): DiffLine {
  return { kind, text, before, after };
}

/**
 * Таблица длин наибольшей общей подпоследовательности строк: из неё
 * восстанавливается минимальный набор правок, а не только их количество.
 */
function lcsTable(before: string[], after: string[]): Uint32Array[] {
  const table: Uint32Array[] = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  return table;
}

interface Offset {
  before: number;
  after: number;
}

function walk(before: string[], after: string[], offset: Offset): DiffLine[] {
  const table = lcsTable(before, after);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push(line(DIFF_KIND.Same, before[i], offset.before + i + 1, offset.after + j + 1));
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      // Равенство отдаётся удалению: тогда пара «удалено, добавлено» стоит в
      // дифе в том же порядке, в каком строки лежат в файлах.
      lines.push(line(DIFF_KIND.Removed, before[i], offset.before + i + 1, null));
      i += 1;
    } else {
      lines.push(line(DIFF_KIND.Added, after[j], null, offset.after + j + 1));
      j += 1;
    }
  }

  for (; i < before.length; i += 1) {
    lines.push(line(DIFF_KIND.Removed, before[i], offset.before + i + 1, null));
  }

  for (; j < after.length; j += 1) {
    lines.push(line(DIFF_KIND.Added, after[j], null, offset.after + j + 1));
  }

  return lines;
}

function replaced(before: string[], after: string[], offset: Offset): DiffLine[] {
  return [
    ...before.map((text, index) => line(DIFF_KIND.Removed, text, offset.before + index + 1, null)),
    ...after.map((text, index) => line(DIFF_KIND.Added, text, null, offset.after + index + 1)),
  ];
}

/**
 * Построчный диф применённого конфига и черновика.
 *
 * Считается по тексту, а не по разобранным моделям: черновик — байты файла,
 * и пользователю показывается ровно то, что уйдёт в Apply.
 * Совпадающие начало и конец отрезаются до сравнения: правка одного поля иначе
 * гоняла бы таблицу по всему файлу.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split('\n');
  const right = after.split('\n');
  const head: DiffLine[] = [];

  let prefix = 0;

  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    head.push(line(DIFF_KIND.Same, left[prefix], prefix + 1, prefix + 1));
    prefix += 1;
  }

  let suffix = 0;

  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const middleLeft = left.slice(prefix, left.length - suffix);
  const middleRight = right.slice(prefix, right.length - suffix);
  const offset: Offset = { before: prefix, after: prefix };
  const middle =
    middleLeft.length * middleRight.length > MAX_CELLS
      ? replaced(middleLeft, middleRight, offset)
      : walk(middleLeft, middleRight, offset);

  const tail: DiffLine[] = [];

  for (let index = left.length - suffix; index < left.length; index += 1) {
    tail.push(line(DIFF_KIND.Same, left[index], index + 1, index - left.length + right.length + 1));
  }

  return [...head, ...middle, ...tail];
}

/**
 * Оставляет изменённые строки с контекстом вокруг. В дифе конфига на полторы
 * тысячи строк правка одной строки иначе ищется прокруткой.
 */
export function toDiffHunks(lines: DiffLine[], context: number): DiffHunk[] {
  const keep = Array.from<boolean>({ length: lines.length }).fill(false);

  for (const [index, current] of lines.entries()) {
    if (current.kind === DIFF_KIND.Same) continue;

    for (let near = Math.max(0, index - context); near <= Math.min(lines.length - 1, index + context); near += 1) {
      keep[near] = true;
    }
  }

  const hunks: DiffHunk[] = [];
  let skipped = 0;

  for (const [index, current] of lines.entries()) {
    if (!keep[index]) {
      skipped += 1;

      continue;
    }

    const last = hunks.at(-1);

    if (last === undefined || skipped > 0) {
      hunks.push({ skipped, lines: [current] });
      skipped = 0;

      continue;
    }

    last.lines.push(current);
  }

  return hunks;
}
