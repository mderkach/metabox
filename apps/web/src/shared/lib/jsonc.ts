import i18next, { type ParseKeys } from 'i18next';
import {
  type FormattingOptions,
  type JSONPath,
  type Node,
  type ParseError,
  findNodeAtLocation,
  parse,
  parseTree,
} from 'jsonc-parser';

/**
 * `jsonc-parser` error codes as human-readable text. It prints them itself
 * as English names like `CloseBraceExpected`, and a router owner has nothing
 * to fix a typo by.
 */
const PARSE_ERROR_KEY: Record<number, ParseKeys<'shared'> | undefined> = {
  1: 'jsonc.invalidSymbol',
  2: 'jsonc.invalidNumberFormat',
  3: 'jsonc.propertyNameExpected',
  4: 'jsonc.valueExpected',
  5: 'jsonc.colonExpected',
  6: 'jsonc.commaExpected',
  7: 'jsonc.closeBraceExpected',
  8: 'jsonc.closeBracketExpected',
  9: 'jsonc.endOfFileExpected',
  10: 'jsonc.invalidCommentToken',
  11: 'jsonc.unexpectedEndOfComment',
  12: 'jsonc.unexpectedEndOfString',
  13: 'jsonc.unexpectedEndOfNumber',
  14: 'jsonc.invalidUnicode',
  15: 'jsonc.invalidEscapeCharacter',
  16: 'jsonc.invalidCharacter',
};

function parseErrorText(code: number): string {
  return i18next.t(PARSE_ERROR_KEY[code] ?? 'jsonc.unparsed', { ns: 'shared' });
}

/**
 * The sing-box config dialect: comments of both kinds and a comma before
 * the closing bracket. The binary accepts such a file, and `JSON.parse` would show
 * the owner an invented error in a working config.
 */
const DIALECT = { allowTrailingComma: true, allowEmptyContent: false } as const;

/** Indent when it could not be determined from the text. */
const DEFAULT_TAB_SIZE = 2;

/** First indented line: it shows what the text is indented with. */
const FIRST_INDENT = /\n([\t ]+)\S/;

/**
 * Indent of the text by its first indented line. `jsonc-parser` has no detection of
 * its own: without it an edit would go into a tab-indented file with two spaces.
 */
export function detectIndent(text: string): Required<Pick<FormattingOptions, 'tabSize' | 'insertSpaces'>> {
  const indent = FIRST_INDENT.exec(text)?.[1];

  if (indent === undefined) {
    return { tabSize: DEFAULT_TAB_SIZE, insertSpaces: true };
  }

  return { tabSize: indent.length, insertSpaces: !indent.startsWith('\t') };
}

export interface JsoncFailure {
  /** Offset in characters: the screen converts it to a line number. */
  offset: number;
  text: string;
}

/** The first parse error or `null` when the text is parsed. */
export function firstJsoncError(text: string): JsoncFailure | null {
  const errors: ParseError[] = [];

  parse(text, errors, DIALECT);

  if (errors.length === 0) {
    return null;
  }

  const [first] = errors;

  return { offset: first.offset, text: parseErrorText(first.error) };
}

/** Line of a parse failure, counting from one. */
export function failureLine(text: string, failure: JsoncFailure): number {
  return text.slice(0, failure.offset).split('\n').length;
}

/**
 * Parses text into a value. The second value is the same first error that
 * `firstJsoncError` returns: parsing does not throw, because the panel must
 * open even on an incomprehensible config.
 */
export function parseJsonc(text: string): { value: unknown; failure: JsoncFailure | null } {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, DIALECT);

  if (errors.length === 0) {
    return { value, failure: null };
  }

  const [first] = errors;

  return { value, failure: { offset: first.offset, text: parseErrorText(first.error) } };
}

/**
 * Node locator by document path. The tree is built once per text — all parse
 * remarks are looked up in it — and over the source bytes, so the offsets are correct
 * in a file with comments and trailing commas too.
 */
export function jsonPathLocator(text: string): (path: JSONPath) => number | null {
  const tree = parseTree(text, undefined, DIALECT);

  return (path) => {
    if (tree === undefined) {
      return null;
    }

    return findNodeAtLocation(tree, path)?.offset ?? null;
  };
}

/** An object property in the text outline. */
export interface JsoncOutlineEntry {
  key: string;
  /** Offset of the key together with the opening quote: the cursor is placed here. */
  offset: number;
  /** Length of the key in the text together with the quotes. */
  length: number;
  /** Number of elements when the value is an array, otherwise `null`. */
  size: number | null;
  /** Nested properties whose value is an object or an array. */
  children: JsoncOutlineEntry[];
}

function isSection(node: Node | undefined): node is Node {
  return node?.type === 'object' || node?.type === 'array';
}

function toOutlineEntry(property: Node, children: JsoncOutlineEntry[]): JsoncOutlineEntry | null {
  // `at`, not an index: a property without a value has no second child.
  const key = property.children?.at(0);
  const value = property.children?.at(1);

  if (key === undefined || typeof key.value !== 'string') {
    return null;
  }

  return {
    key: key.value,
    offset: key.offset,
    length: key.length,
    size: value?.type === 'array' ? (value.children?.length ?? 0) : null,
    children,
  };
}

/** Object properties whose value is an object or an array; a scalar does not count as a section. */
function sectionsOf(node: Node | undefined): JsoncOutlineEntry[] {
  if (node?.type !== 'object') {
    return [];
  }

  return (node.children ?? []).flatMap((property) => {
    const value = property.children?.at(1);
    const entry = isSection(value) ? toOutlineEntry(property, []) : null;

    return entry === null ? [] : [entry];
  });
}

/**
 * Outline of the config text: root properties and, under them, their object and
 * array properties — the second level is needed because `route.rules` and `dns.servers`
 * lie on it. Offsets are counted over the source bytes, so they are correct in a
 * file with comments too. Parsing tolerates errors: on broken text the outline
 * returns what the parser managed to collect — usually everything up to the error.
 */
export function jsoncOutline(text: string): JsoncOutlineEntry[] {
  const tree = parseTree(text, undefined, DIALECT);

  if (tree?.type !== 'object') {
    return [];
  }

  return (tree.children ?? []).flatMap((property) => {
    const entry = toOutlineEntry(property, sectionsOf(property.children?.at(1)));

    return entry === null ? [] : [entry];
  });
}

/** Line of an offset in the text, counted from one: this is how a remark is shown to a human. */
export function lineOfOffset(text: string, offset: number): number {
  let line = 1;

  for (let index = 0; index < offset && index < text.length; index++) {
    if (text[index] === '\n') {
      line++;
    }
  }

  return line;
}
