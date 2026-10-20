import { createScanner } from 'jsonc-parser';

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
