import { describe, expect, it } from 'vitest';

import { DIFF_KIND, diffLines, toDiffHunks } from '../diff';

describe('diffLines', () => {
  it('finds no changes in identical text', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc');

    expect(lines.every((line) => line.kind === DIFF_KIND.Same)).toBe(true);
    expect(lines).toHaveLength(3);
  });

  it('shows a one-line edit as a "removed, added" pair', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc');

    expect(lines.map((line) => line.kind)).toEqual([
      DIFF_KIND.Same,
      DIFF_KIND.Removed,
      DIFF_KIND.Added,
      DIFF_KIND.Same,
    ]);
  });

  it('numbers lines by both files', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc');

    expect(lines.map((line) => [line.before, line.after])).toEqual([
      [1, 1],
      [2, null],
      [null, 2],
      [3, 3],
    ]);
  });

  it('shows an insertion without deletions', () => {
    const lines = diffLines('a\nc', 'a\nb\nc');

    expect(lines.filter((line) => line.kind === DIFF_KIND.Removed)).toEqual([]);
    expect(lines.filter((line) => line.kind === DIFF_KIND.Added).map((line) => line.text)).toEqual(['b']);
  });

  it('shows a deletion without additions', () => {
    const lines = diffLines('a\nb\nc', 'a\nc');

    expect(lines.filter((line) => line.kind === DIFF_KIND.Added)).toEqual([]);
    expect(lines.filter((line) => line.kind === DIFF_KIND.Removed).map((line) => line.text)).toEqual(['b']);
  });

  it('does not lose lines when a block is replaced whole', () => {
    const lines = diffLines('a\nb', 'x\ny\nz');

    expect(lines.filter((line) => line.kind === DIFF_KIND.Removed).map((line) => line.text)).toEqual(['a', 'b']);
    expect(lines.filter((line) => line.kind === DIFF_KIND.Added).map((line) => line.text)).toEqual(['x', 'y', 'z']);
  });

  it('keeps the line order of the source file', () => {
    const lines = diffLines('1\n2\n3\n4\n5', '1\n3\n4\n9\n5');
    const before = lines.filter((line) => line.before !== null).map((line) => line.before);

    expect(before).toEqual([...before].sort((left, right) => (left ?? 0) - (right ?? 0)));
  });

  it('turns empty text into one added line', () => {
    const lines = diffLines('', 'a');

    expect(lines.map((line) => [line.kind, line.text])).toEqual([
      [DIFF_KIND.Removed, ''],
      [DIFF_KIND.Added, 'a'],
    ]);
  });
});

describe('toDiffHunks', () => {
  const long = Array.from({ length: 20 }, (_, index) => String(index + 1)).join('\n');

  it('keeps a change with context and counts the hidden lines', () => {
    const changed = long.replace('\n10\n', '\n10.5\n');
    const hunks = toDiffHunks(diffLines(long, changed), 2);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].skipped).toBe(7);
    expect(hunks[0].lines.map((line) => line.text)).toEqual(['8', '9', '10', '10.5', '11', '12']);
  });

  it('splits distant edits into different hunks', () => {
    const changed = long.replace('\n2\n', '\n2.5\n').replace('\n19\n', '\n19.5\n');
    const hunks = toDiffHunks(diffLines(long, changed), 1);

    expect(hunks).toHaveLength(2);
    expect(hunks[1].skipped).toBeGreaterThan(0);
  });

  it('gives no hunks on text without changes', () => {
    expect(toDiffHunks(diffLines(long, long), 3)).toEqual([]);
  });
});
