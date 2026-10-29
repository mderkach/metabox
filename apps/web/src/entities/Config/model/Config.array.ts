import {
  applyEdits,
  createScanner,
  findNodeAtLocation,
  getNodeValue,
  parseTree,
  type Edit,
  type FormattingOptions,
  type JSONPath,
  type Node,
  type ParseError,
} from 'jsonc-parser';

/**
 * An array element together with the text that belongs to it: comments on their
 * own lines above it, and after it the comma and comments on the same line.
 */
interface ElementSpan {
  start: number;
  valueStart: number;
  valueEnd: number;
  /** `-1` means the element has no comma after it. */
  comma: number;
  /** Where the whitespace before the next element begins. */
  end: number;
}

interface Gap {
  comma: number;
  /** End of what belongs to the element before the gap. */
  ownEnd: number;
  /** Start of the first own-line comment, which belongs to the element after the gap. */
  nextStart: number | null;
}

const WHITESPACE = /\s/;

/**
 * `SyntaxKind` codes of the scanner tokens: the library declares the enum as an
 * ambient `const enum`, which cannot be read under `verbatimModuleSyntax`.
 */
const TOKEN = { Comma: 5, LineComment: 12, BlockComment: 13, LineBreak: 14, Eof: 17 } as const;

/**
 * Splits the trivia between two elements. A comment before the comma or on the
 * comma line stays with the previous element, a comment on its own line goes
 * with the next one. The opening bracket counts as a comma; after the last
 * element a comment on its own line belongs to no element and stays in place.
 */
function splitGap(text: string, from: number, to: number, place: { first: boolean; last: boolean }): Gap {
  const scanner = createScanner(text.slice(from, to), false);
  const gap: Gap = { comma: -1, ownEnd: from, nextStart: null };
  let lineBroken = false;

  for (let token = scanner.scan(); token !== TOKEN.Eof; token = scanner.scan()) {
    const offset = from + scanner.getTokenOffset();
    const end = offset + scanner.getTokenLength();

    if (token === TOKEN.Comma) {
      gap.comma = offset;
      gap.ownEnd = end;
      gap.nextStart = null;
      lineBroken = false;
    } else if (token === TOKEN.LineBreak) {
      lineBroken = true;
    } else if (token === TOKEN.LineComment || token === TOKEN.BlockComment) {
      const anchored = place.first || gap.comma !== -1;

      if (!lineBroken || (!anchored && !place.last)) {
        gap.ownEnd = end;
      } else if (anchored) {
        gap.nextStart ??= offset;
      }
    }
  }

  return gap;
}

function toSpans(text: string, array: Node): ElementSpan[] {
  const items = array.children ?? [];
  const spans: ElementSpan[] = [];
  let from = array.offset + 1;

  for (let index = 0; index <= items.length; index++) {
    const item = items.at(index);
    const gap = splitGap(text, from, item?.offset ?? array.offset + array.length - 1, {
      first: index === 0,
      last: item === undefined,
    });
    const previous = spans.at(-1);

    if (previous !== undefined) {
      previous.comma = gap.comma;
      previous.end = gap.ownEnd;
    }

    if (item !== undefined) {
      from = item.offset + item.length;
      spans.push({
        start: gap.nextStart ?? item.offset,
        valueStart: item.offset,
        valueEnd: from,
        comma: -1,
        end: from,
      });
    }
  }

  return spans;
}

function findArray(text: string, path: JSONPath): Node | undefined {
  const root = parseTree(text);
  const node = root === undefined ? undefined : findNodeAtLocation(root, path.slice(0, -1));

  return node?.type === 'array' ? node : undefined;
}

/** Whitespace between the element and what precedes it: the line break and indent of the list. */
function whitespaceBefore(text: string, offset: number): string {
  let start = offset;

  while (start > 0 && WHITESPACE.test(text[start - 1])) start--;

  return text.slice(start, offset);
}

/** Line break and indent that separate elements of the list; a new element takes the same. */
function separatorAt(text: string, spans: readonly ElementSpan[], index: number): string {
  return whitespaceBefore(text, spans[Math.min(Math.max(index, 1), spans.length - 1)].start);
}

/** Element text without the comma: the comma is placed by the slot it moves into. */
interface Chunk {
  body: string;
  trailer: string;
}

function toChunk(text: string, span: ElementSpan): Chunk {
  const trailer =
    span.comma === -1
      ? text.slice(span.valueEnd, span.end)
      : text.slice(span.valueEnd, span.comma) + text.slice(span.comma + 1, span.end);

  return { body: text.slice(span.start, span.valueEnd), trailer: trailer.trimEnd() };
}

function removeEdits(spans: readonly ElementSpan[], index: number): Edit[] {
  const target = spans[index];
  const next = spans.at(index + 1);

  if (next !== undefined) {
    return [{ offset: target.start, length: next.start - target.start, content: '' }];
  }

  const previous = spans[index - 1];
  const edits: Edit[] = [{ offset: previous.end, length: target.end - previous.end, content: '' }];

  // Without a trailing comma the previous element becomes the last one and gives
  // up its comma; with one, the list keeps its style.
  if (target.comma === -1 && previous.comma !== -1) {
    edits.push({ offset: previous.comma, length: 1, content: '' });
  }

  return edits;
}

function insertEdits(spans: readonly ElementSpan[], index: number, chunk: Chunk, separator: string): Edit[] {
  const target = spans.at(index);

  if (target !== undefined) {
    return [{ offset: target.start, length: 0, content: `${chunk.body},${chunk.trailer}${separator}` }];
  }

  const last = spans[spans.length - 1];

  if (last.comma !== -1) {
    return [{ offset: last.end, length: 0, content: `${separator}${chunk.body},${chunk.trailer}` }];
  }

  return [
    { offset: last.valueEnd, length: 0, content: ',' },
    { offset: last.end, length: 0, content: `${separator}${chunk.body}${chunk.trailer}` },
  ];
}

/** Rejects a text splice unless the whole document differs only by the intended array edit. */
function verified(before: string, after: string, arrayPath: JSONPath, expected: unknown[]): string | null {
  const errorsBefore: ParseError[] = [];
  const errorsAfter: ParseError[] = [];
  const beforeRoot = parseTree(before, errorsBefore, { allowTrailingComma: true });
  const afterRoot = parseTree(after, errorsAfter, { allowTrailingComma: true });

  if (beforeRoot === undefined || afterRoot === undefined || errorsBefore.length > 0 || errorsAfter.length > 0) {
    return null;
  }

  const document: unknown = getNodeValue(beforeRoot);
  let parent: unknown = document;

  for (const segment of arrayPath.slice(0, -1)) {
    if (parent === null || typeof parent !== 'object') return null;

    parent = Reflect.get(parent, segment);
  }

  const key = arrayPath.at(-1);

  if (key !== undefined) {
    if (parent === null || typeof parent !== 'object') return null;

    Reflect.set(parent, key, expected);
  }

  return JSON.stringify(getNodeValue(afterRoot)) === JSON.stringify(key === undefined ? expected : document)
    ? after
    : null;
}

/** The list at the path and its elements; `null` when the path is not a non-negative index of a list. */
function locate(text: string, path: JSONPath): { index: number; values: unknown[]; spans: ElementSpan[] } | null {
  const index = path.at(-1);
  const array = findArray(text, path);

  if (array === undefined || typeof index !== 'number' || index < 0) return null;

  const values: unknown[] = (array.children ?? []).map(getNodeValue);

  return { index, values, spans: toSpans(text, array) };
}

/**
 * Removes an array element as a range of text: its comma and comments go with
 * it, the neighbours keep their bytes. `undefined` means a non-array path;
 * `null` refuses an unsafe edit.
 */
export function removeElement(text: string, path: JSONPath): string | null | undefined {
  const list = locate(text, path);

  if (list === null) return undefined;
  if (list.index >= list.spans.length) return text;

  const target = list.spans[list.index];
  const edits =
    list.spans.length === 1
      ? [{ offset: target.start, length: target.end - target.start, content: '' }]
      : removeEdits(list.spans, list.index);
  const after = applyEdits(text, edits);

  return verified(text, after, path.slice(0, -1), list.values.toSpliced(list.index, 1));
}

/**
 * Inserts a value into a list as a range of text, without reformatting the
 * neighbours. The value is laid out with the file indent, shifted to the indent
 * of the list; in a list written on one line it goes on one line too.
 *
 * `undefined` means there is no list with elements to take the layout from;
 * `null` refuses an unsafe edit.
 */
export function insertElement(
  text: string,
  path: JSONPath,
  value: unknown,
  formatting: FormattingOptions
): string | null | undefined {
  const list = locate(text, path);

  if (value === undefined) return null;
  if (list === null || list.spans.length === 0) return undefined;

  const json = JSON.stringify(value);
  const position = Math.min(list.index, list.spans.length);
  const separator = separatorAt(text, list.spans, position);
  const lineBreak = separator.lastIndexOf('\n');
  const unit =
    formatting.insertSpaces === true && formatting.tabSize !== undefined ? ' '.repeat(formatting.tabSize) : '\t';
  const body =
    lineBreak === -1
      ? json
      : JSON.stringify(value, null, unit)
          .split('\n')
          .join((formatting.eol ?? '\n') + separator.slice(lineBreak + 1));
  const after = applyEdits(text, insertEdits(list.spans, position, { body, trailer: '' }, separator));

  return verified(text, after, path.slice(0, -1), list.values.toSpliced(position, 0, JSON.parse(json)));
}

/**
 * Moves an element by carrying its source text: the comments inside and around
 * it and its one-line or multi-line layout move with it. `null` means there is
 * nothing to move or the layout could not be kept.
 */
export function moveElement(text: string, path: JSONPath, from: number, to: number): string | null {
  const list = locate(text, [...path, from]);
  const span = list?.spans.at(from);

  if (list === null || span === undefined || list.spans.length <= 1 || to < 0) return null;

  const position = Math.min(to, list.spans.length - 1);
  // The separator is taken before the removal: a list left with one element has
  // none to take it from.
  const separator = separatorAt(text, list.spans, position);
  const removed = applyEdits(text, removeEdits(list.spans, from));
  const rest = findArray(removed, [...path, position]);

  if (rest === undefined) return null;

  const after = applyEdits(removed, insertEdits(toSpans(removed, rest), position, toChunk(text, span), separator));

  return verified(text, after, path, list.values.toSpliced(from, 1).toSpliced(position, 0, list.values[from]));
}

/** A line comment that names the element: the last one above it, with no blank line in between. */
interface NameComment {
  offset: number;
  end: number;
  name: string;
}

const NAME_MARK = '//';

/** Only the line break and indents separate the name from its element. */
const NAME_GAP = /^[\t ]*\r?\n[\t ]*$/;

const BLANK = /^[\t ]*$/;

const SPACES = /\s+/g;

/** The name as it goes into the comment: one line, no edge spaces. */
export function toElementName(name: string): string {
  return name.replaceAll(SPACES, ' ').trim();
}

function nameCommentOf(text: string, span: ElementSpan): NameComment | null {
  const scanner = createScanner(text.slice(span.start, span.valueStart), false);
  let last: { token: number; offset: number; end: number } | null = null;

  for (let token = scanner.scan(); token !== TOKEN.Eof; token = scanner.scan()) {
    if (token === TOKEN.LineComment || token === TOKEN.BlockComment) {
      const offset = span.start + scanner.getTokenOffset();

      last = { token, offset, end: offset + scanner.getTokenLength() };
    }
  }

  if (last?.token !== TOKEN.LineComment || !NAME_GAP.test(text.slice(last.end, span.valueStart))) return null;

  return { offset: last.offset, end: last.end, name: text.slice(last.offset + NAME_MARK.length, last.end).trim() };
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

/**
 * Names of the list elements, one per element: the line comment right above
 * it. `null` means no name. A comment at the end of the previous element's
 * line belongs to that element, not to the next one (see `splitGap`).
 */
export function readElementNames(text: string, path: JSONPath): (string | null)[] {
  const array = findArray(text, [...path, 0]);

  if (array === undefined) return [];

  return toSpans(text, array).map((span) => {
    const name = nameCommentOf(text, span)?.name ?? '';

    return name.length > 0 ? name : null;
  });
}

function removeNameEdit(text: string, comment: NameComment, span: ElementSpan): Edit {
  const start = lineStart(text, comment.offset);

  // Another comment shares the line: only the name goes, the line stays.
  if (!BLANK.test(text.slice(start, comment.offset))) {
    return { offset: comment.offset, length: comment.end - comment.offset, content: '' };
  }

  return { offset: start, length: lineStart(text, span.valueStart) - start, content: '' };
}

function insertNameEdit(text: string, span: ElementSpan, line: string, formatting: FormattingOptions): Edit {
  const eol = formatting.eol ?? '\n';
  const start = lineStart(text, span.valueStart);
  const indent = text.slice(start, span.valueStart);

  if (BLANK.test(indent)) {
    return { offset: start, length: 0, content: `${indent}${line}${eol}` };
  }

  // A list on one line: a line comment needs a line of its own, so the element
  // moves to the next line, one indent deeper than the line it was on.
  const unit =
    formatting.insertSpaces === true && formatting.tabSize !== undefined ? ' '.repeat(formatting.tabSize) : '\t';
  const deeper = `${/^[\t ]*/.exec(text.slice(start))?.[0] ?? ''}${unit}`;
  let gap = span.valueStart;

  while (gap > start && WHITESPACE.test(text[gap - 1])) gap--;

  return { offset: gap, length: span.valueStart - gap, content: `${eol}${deeper}${line}${eol}${deeper}` };
}

/**
 * Writes the element name as a line comment right above it, replaces the one
 * there or, for an empty name, removes it. The element and the rest of the
 * text keep their bytes. `null` refuses an unsafe edit or a path that is not a
 * list element.
 */
export function nameElement(text: string, path: JSONPath, name: string, formatting: FormattingOptions): string | null {
  const list = locate(text, path);
  const span = list?.spans.at(list.index);

  if (list === null || span === undefined) return null;

  const next = toElementName(name);
  const comment = nameCommentOf(text, span);
  const line = `${NAME_MARK} ${next}`;
  let edit: Edit | null = null;

  if (comment !== null) {
    edit =
      next.length === 0
        ? removeNameEdit(text, comment, span)
        : { offset: comment.offset, length: comment.end - comment.offset, content: line };
  } else if (next.length > 0) {
    edit = insertNameEdit(text, span, line, formatting);
  }

  if (edit === null) return text;

  const after = applyEdits(text, [edit]);
  const arrayPath = path.slice(0, -1);

  if (verified(text, after, arrayPath, list.values) === null) return null;

  return readElementNames(after, arrayPath).at(list.index) === (next.length > 0 ? next : null) ? after : null;
}
