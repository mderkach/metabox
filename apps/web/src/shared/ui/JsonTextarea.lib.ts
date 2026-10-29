import { createScanner } from 'jsonc-parser';

import { detectIndent } from '../lib/jsonc';
import { JSON_TONE } from './styles';

export interface JsonToken {
  text: string;
  tone: string;
}

/**
 * Scanner token kinds.
 *
 * The values are duplicated rather than taken from `SyntaxKind`: in `jsonc-parser` it is
 * a `declare const enum`, i.e. a purely type-level entity without a runtime, and under
 * `verbatimModuleSyntax` it cannot be imported as a value. The numbers are the same as
 * in `jsonc-parser/lib/umd/main.d.ts` and change only together with the package's major
 * version — it is pinned exactly in the manifest.
 */
const TOKEN = {
  OpenBrace: 1,
  CloseBrace: 2,
  OpenBracket: 3,
  CloseBracket: 4,
  Comma: 5,
  Colon: 6,
  Null: 7,
  True: 8,
  False: 9,
  String: 10,
  Number: 11,
  LineComment: 12,
  BlockComment: 13,
  LineBreak: 14,
  Whitespace: 15,
  Unknown: 16,
  Eof: 17,
} as const;

const PUNCTUATION = new Set<number>([
  TOKEN.OpenBrace,
  TOKEN.CloseBrace,
  TOKEN.OpenBracket,
  TOKEN.CloseBracket,
  TOKEN.Comma,
  TOKEN.Colon,
]);

/**
 * Tone by token kind. A key and a string value are separated: a config has more keys
 * than values, and the same color would turn the file into a solid wall.
 */
const TOKEN_TONES: Readonly<Record<number, string>> = {
  [TOKEN.String]: JSON_TONE.String,
  [TOKEN.Number]: JSON_TONE.Number,
  [TOKEN.True]: JSON_TONE.Literal,
  [TOKEN.False]: JSON_TONE.Literal,
  [TOKEN.Null]: JSON_TONE.Literal,
  [TOKEN.LineComment]: JSON_TONE.Comment,
  [TOKEN.BlockComment]: JSON_TONE.Comment,
  [TOKEN.Unknown]: JSON_TONE.Unknown,
};

/**
 * Parsing text into colored chunks.
 *
 * The `jsonc-parser` scanner is the same one the panel already reads the config with, so
 * highlighting does not pull a code editor into the bundle. Chunks are taken as slices of the source
 * string, not as token values: a string value arrives without quotes and without
 * escaping, and the text would stop matching the file.
 *
 * Broken JSON does not break parsing: the scanner reaches the end and returns what it did not understand
 * as an `Unknown` token, so highlighting works even where `JSON.parse` has already
 * refused — and that is exactly the case the text mode exists for.
 */
export function toJsonTokens(text: string): JsonToken[] {
  const scanner = createScanner(text, false);
  const tokens: JsonToken[] = [];
  // A key differs from a string only in that a colon follows it, and that is recognized
  // only after it — so the last string is marked retroactively.
  let lastString = -1;

  for (let kind: number = scanner.scan(); kind !== TOKEN.Eof; kind = scanner.scan()) {
    const offset = scanner.getTokenOffset();
    const slice = text.slice(offset, offset + scanner.getTokenLength());

    if (kind === TOKEN.Colon && lastString >= 0) {
      tokens[lastString].tone = JSON_TONE.Key;
    }

    if (kind === TOKEN.String) {
      lastString = tokens.length;
    } else if (kind !== TOKEN.Whitespace && kind !== TOKEN.LineBreak) {
      lastString = -1;
    }

    tokens.push({
      text: slice,
      tone: TOKEN_TONES[kind] ?? (PUNCTUATION.has(kind) ? JSON_TONE.Punctuation : JSON_TONE.Plain),
    });
  }

  return tokens;
}

/**
 * Index of the highlight chunk that a text position falls into. With line wrapping
 * the line number no longer gives the height — the highlight layer chunk does, where the wrapping is
 * the same as in the input field.
 */
export function tokenIndexAt(tokens: readonly JsonToken[], position: number): number {
  let end = 0;

  for (const [index, token] of tokens.entries()) {
    end += token.text.length;

    if (position < end) {
      return index;
    }
  }

  return tokens.length - 1;
}

/** Line feed code: the line number is counted by it. */
const LINE_FEED = 10;

/** Line number counted from zero: the field scrolls to a selection by it. */
export function lineIndexOf(text: string, position: number): number {
  let line = 0;

  for (let at = 0; at < position; at += 1) {
    if (text.charCodeAt(at) === LINE_FEED) {
      line += 1;
    }
  }

  return line;
}

/** Replacement of a text range and the selection after it. */
export interface TextEdit {
  from: number;
  to: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Indent unit of the text: a tab or the number of spaces of its first indented line. */
export function indentUnit(text: string): string {
  const { tabSize, insertSpaces } = detectIndent(text);

  return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

/** How many leading characters one outdent step removes: the unit, a tab, or up to the unit width of spaces. */
function outdentWidth(line: string, unit: string): number {
  if (line.startsWith(unit)) {
    return unit.length;
  }

  if (line.startsWith('\t')) {
    return 1;
  }

  let spaces = 0;

  while (spaces < unit.length && line[spaces] === ' ') {
    spaces += 1;
  }

  return spaces;
}

/**
 * Tab and Shift+Tab over a selection, as a replacement of the touched lines.
 *
 * Tab on a caret or inside one line inserts the unit in place of the selection; over several
 * lines it indents each non-empty one. Shift+Tab outdents every touched line, a caret
 * included. A selection that ends at the start of a line does not touch that line. A
 * selection edge at the start of a line stays there, so whole selected lines stay selected
 * together with their new indent. `null` means there is nothing to change.
 */
export function indentLines(text: string, start: number, end: number, unit: string, outdent: boolean): TextEdit | null {
  if (!outdent && !text.slice(start, end).includes('\n')) {
    const caret = start + unit.length;

    return { from: start, to: end, text: unit, selectionStart: caret, selectionEnd: caret };
  }

  // `lastIndexOf` clamps a negative start to zero and would find a line feed at offset zero.
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const lineEnd = text.indexOf('\n', last);
  const to = lineEnd === -1 ? text.length : lineEnd;
  const lines = text.slice(from, to).split('\n');
  const shifts = lines.map((line) => {
    if (outdent) {
      return -outdentWidth(line, unit);
    }

    return line.trim() === '' ? 0 : unit.length;
  });

  if (shifts.every((shift) => shift === 0)) {
    return null;
  }

  const replaced = lines.map((line, index) => (shifts[index] > 0 ? unit + line : line.slice(-shifts[index])));
  const total = shifts.reduce((sum, shift) => sum + shift, 0);

  function moved(position: number): number {
    if (position > to) {
      return position + total;
    }

    let lineStart = from;
    let delta = 0;

    for (const [index, line] of lines.entries()) {
      const column = position - lineStart;

      if (column <= line.length) {
        return lineStart + delta + (column === 0 ? 0 : Math.max(0, column + shifts[index]));
      }

      lineStart += line.length + 1;
      delta += shifts[index];
    }

    return position + total;
  }

  return { from, to, text: replaced.join('\n'), selectionStart: moved(start), selectionEnd: moved(end) };
}

/**
 * Applies an edit to the field as typing. `execCommand('insertText')` is the only way to
 * change a `textarea` that stays on the browser undo stack, and it fires `input`, which
 * React reads as a change. It is deprecated but kept by all engines; where it refuses,
 * `setRangeText` changes the text without undo, and the `input` event is sent by hand.
 */
export function replaceText(input: HTMLTextAreaElement, edit: TextEdit): void {
  const direction = input.selectionDirection;

  input.setSelectionRange(edit.from, edit.to);

  const typed =
    edit.text === '' ? document.execCommand('delete') : document.execCommand('insertText', false, edit.text);

  if (!typed) {
    input.setRangeText(edit.text, edit.from, edit.to);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  input.setSelectionRange(edit.selectionStart, edit.selectionEnd, direction);
}
