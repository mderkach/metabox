import { createScanner, type ParseError, parse } from 'jsonc-parser';

/**
 * Коды разбора `jsonc-parser` человеческим текстом. Сам он печатает их
 * английскими именами вроде `CloseBraceExpected`, а починить по ним опечатку
 * владельцу роутера нечем.
 */
const PARSE_ERROR_TEXT: Record<number, string | undefined> = {
  1: 'непонятный символ',
  2: 'неверная запись числа',
  3: 'ожидалось имя поля',
  4: 'ожидалось значение',
  5: 'пропущено двоеточие',
  6: 'пропущена запятая',
  7: 'не закрыта фигурная скобка',
  8: 'не закрыта квадратная скобка',
  9: 'лишнее содержимое после конца конфига',
  10: 'непонятный комментарий',
  11: 'не закрыт комментарий',
  12: 'не закрыта строка',
  13: 'оборванное число',
  14: 'неверная escape-последовательность Unicode',
  15: 'неверная escape-последовательность',
  16: 'недопустимый символ',
};

/**
 * Первая ошибка разбора или `null`, когда текст разобран.
 *
 * Диалект тот же, что у бинаря: комментарии и запятая перед закрывающей
 * скобкой — не ошибка, sing-box такой конфиг принимает, а `JSON.parse` на нём
 * спотыкается и показал бы владельцу выдуманную ошибку в его рабочем файле.
 */
export function firstParseError(text: string): { offset: number; text: string } | null {
  const errors: ParseError[] = [];

  parse(text, errors, { allowTrailingComma: true, allowEmptyContent: false });

  if (errors.length === 0) {
    return null;
  }

  const [first] = errors;

  return { offset: first.offset, text: PARSE_ERROR_TEXT[first.error] ?? 'конфиг не разобран' };
}

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
