import { createScanner } from 'jsonc-parser';

export interface JsonToken {
  text: string;
  tone: string;
}

/**
 * Виды токенов сканера.
 *
 * Значения продублированы, а не взяты из `SyntaxKind`: в `jsonc-parser` это
 * `declare const enum`, то есть чисто типовая сущность без рантайма, и при
 * `verbatimModuleSyntax` импортировать её как значение нельзя. Числа те же, что
 * в `jsonc-parser/lib/umd/main.d.ts`, и меняются только вместе с мажорной
 * версией пакета — она в манифесте зафиксирована точно.
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
 * Тон по виду токена. Ключ и строковое значение разводятся отдельно: в конфиге
 * sing-box ключей больше, чем значений, и одинаковый цвет превращал бы файл в
 * сплошную стену.
 */
const TOKEN_TONES: Readonly<Record<number, string>> = {
  [TOKEN.String]: 'text-code-string',
  [TOKEN.Number]: 'text-code-number',
  [TOKEN.True]: 'text-code-literal',
  [TOKEN.False]: 'text-code-literal',
  [TOKEN.Null]: 'text-code-literal',
  [TOKEN.LineComment]: 'text-code-comment italic',
  [TOKEN.BlockComment]: 'text-code-comment italic',
  [TOKEN.Unknown]: 'text-destructive',
};

const KEY_TONE = 'text-foreground';
const DEFAULT_TONE = 'text-foreground';
const PUNCTUATION_TONE = 'text-muted-foreground';

/**
 * Разбор текста на цветные куски.
 *
 * Сканер `jsonc-parser` — тот же, которым панель уже читает конфиг, поэтому
 * подсветка не тянет в бандл редактор кода. Куски берутся срезами исходной
 * строки, а не значениями токенов: значение строки приходит без кавычек и без
 * экранирования, и текст перестал бы совпадать с файлом.
 *
 * Битый JSON не ломает разбор: сканер доходит до конца и отдаёт непонятое
 * токеном `Unknown`, то есть подсветка работает и там, где `JSON.parse` уже
 * отказал, — а это ровно тот случай, ради которого текстовый режим и нужен.
 */
export function toJsonTokens(text: string): JsonToken[] {
  const scanner = createScanner(text, false);
  const tokens: JsonToken[] = [];
  // Ключ отличается от строки только тем, что за ним идёт двоеточие, а узнаётся
  // это уже после него — поэтому последняя строка помечается задним числом.
  let lastString = -1;

  for (let kind: number = scanner.scan(); kind !== TOKEN.Eof; kind = scanner.scan()) {
    const offset = scanner.getTokenOffset();
    const slice = text.slice(offset, offset + scanner.getTokenLength());

    if (kind === TOKEN.Colon && lastString >= 0) {
      tokens[lastString].tone = KEY_TONE;
    }

    if (kind === TOKEN.String) {
      lastString = tokens.length;
    } else if (kind !== TOKEN.Whitespace && kind !== TOKEN.LineBreak) {
      lastString = -1;
    }

    tokens.push({ text: slice, tone: TOKEN_TONES[kind] ?? (PUNCTUATION.has(kind) ? PUNCTUATION_TONE : DEFAULT_TONE) });
  }

  return tokens;
}

/** Позиции всех вхождений строки поиска; регистр не учитывается. */
export function findMatches(text: string, query: string): number[] {
  if (query.length === 0) {
    return [];
  }

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const found: number[] = [];

  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    found.push(at);
  }

  return found;
}

/** Код перевода строки: по нему считается номер строки. */
const LINE_FEED = 10;

/** Номер строки, считая с нуля: по нему редактор прокручивается к совпадению. */
export function lineIndexOf(text: string, position: number): number {
  let line = 0;

  for (let at = 0; at < position; at += 1) {
    if (text.charCodeAt(at) === LINE_FEED) {
      line += 1;
    }
  }

  return line;
}
