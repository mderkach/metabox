import { describe, expect, it } from 'vitest';

import { DIFF_KIND, diffLines, toDiffHunks } from '../diff';

describe('diffLines', () => {
  it('на одинаковом тексте не находит изменений', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc');

    expect(lines.every((line) => line.kind === DIFF_KIND.Same)).toBe(true);
    expect(lines).toHaveLength(3);
  });

  it('правку одной строки показывает парой «удалено, добавлено»', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc');

    expect(lines.map((line) => line.kind)).toEqual([
      DIFF_KIND.Same,
      DIFF_KIND.Removed,
      DIFF_KIND.Added,
      DIFF_KIND.Same,
    ]);
  });

  it('нумерует строки по обоим файлам', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc');

    expect(lines.map((line) => [line.before, line.after])).toEqual([
      [1, 1],
      [2, null],
      [null, 2],
      [3, 3],
    ]);
  });

  it('вставку показывает без удалений', () => {
    const lines = diffLines('a\nc', 'a\nb\nc');

    expect(lines.filter((line) => line.kind === DIFF_KIND.Removed)).toEqual([]);
    expect(lines.filter((line) => line.kind === DIFF_KIND.Added).map((line) => line.text)).toEqual(['b']);
  });

  it('удаление показывает без добавлений', () => {
    const lines = diffLines('a\nb\nc', 'a\nc');

    expect(lines.filter((line) => line.kind === DIFF_KIND.Added)).toEqual([]);
    expect(lines.filter((line) => line.kind === DIFF_KIND.Removed).map((line) => line.text)).toEqual(['b']);
  });

  it('не теряет строки при замене блока целиком', () => {
    const lines = diffLines('a\nb', 'x\ny\nz');

    expect(lines.filter((line) => line.kind === DIFF_KIND.Removed).map((line) => line.text)).toEqual(['a', 'b']);
    expect(lines.filter((line) => line.kind === DIFF_KIND.Added).map((line) => line.text)).toEqual(['x', 'y', 'z']);
  });

  it('сохраняет порядок строк исходного файла', () => {
    const lines = diffLines('1\n2\n3\n4\n5', '1\n3\n4\n9\n5');
    const before = lines.filter((line) => line.before !== null).map((line) => line.before);

    expect(before).toEqual([...before].sort((left, right) => (left ?? 0) - (right ?? 0)));
  });

  it('пустой текст превращает в одну добавленную строку', () => {
    const lines = diffLines('', 'a');

    expect(lines.map((line) => [line.kind, line.text])).toEqual([
      [DIFF_KIND.Removed, ''],
      [DIFF_KIND.Added, 'a'],
    ]);
  });
});

describe('toDiffHunks', () => {
  const long = Array.from({ length: 20 }, (_, index) => String(index + 1)).join('\n');

  it('оставляет изменение с контекстом и считает скрытые строки', () => {
    const changed = long.replace('\n10\n', '\n10.5\n');
    const hunks = toDiffHunks(diffLines(long, changed), 2);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].skipped).toBe(7);
    expect(hunks[0].lines.map((line) => line.text)).toEqual(['8', '9', '10', '10.5', '11', '12']);
  });

  it('разбивает далёкие правки на разные куски', () => {
    const changed = long.replace('\n2\n', '\n2.5\n').replace('\n19\n', '\n19.5\n');
    const hunks = toDiffHunks(diffLines(long, changed), 1);

    expect(hunks).toHaveLength(2);
    expect(hunks[1].skipped).toBeGreaterThan(0);
  });

  it('на тексте без изменений кусков не даёт', () => {
    expect(toDiffHunks(diffLines(long, long), 3)).toEqual([]);
  });
});
