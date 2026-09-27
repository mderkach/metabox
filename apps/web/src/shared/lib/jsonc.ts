import i18next, { type ParseKeys } from 'i18next';
import { type JSONPath, type ParseError, findNodeAtLocation, parse, parseTree } from 'jsonc-parser';

/**
 * Коды разбора `jsonc-parser` человеческим текстом. Сам он печатает их
 * английскими именами вроде `CloseBraceExpected`, а починить по ним опечатку
 * владельцу роутера нечем.
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
 * Диалект конфига sing-box: комментарии обоих видов и запятая перед
 * закрывающей скобкой. Бинарь такой файл принимает, и `JSON.parse` показал бы
 * владельцу выдуманную ошибку в его рабочем конфиге.
 */
const DIALECT = { allowTrailingComma: true, allowEmptyContent: false } as const;

export interface JsoncFailure {
  /** Смещение в символах: экран переводит его в номер строки. */
  offset: number;
  text: string;
}

/** Первая ошибка разбора или `null`, когда текст разобран. */
export function firstJsoncError(text: string): JsoncFailure | null {
  const errors: ParseError[] = [];

  parse(text, errors, DIALECT);

  if (errors.length === 0) {
    return null;
  }

  const [first] = errors;

  return { offset: first.offset, text: parseErrorText(first.error) };
}

/**
 * Разбирает текст в значение. Второе значение — та же первая ошибка, что
 * отдаёт `firstJsoncError`: разбор не бросает, потому что панель обязана
 * открываться и на непонятом конфиге.
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
 * Локатор узлов по пути документа. Дерево строится один раз на текст — по нему
 * ищутся все замечания разбора, — и по исходным байтам, поэтому смещения верны
 * и в файле с комментариями и висячими запятыми.
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

/** Строка смещения в тексте, с единицы: так замечание показывается человеку. */
export function lineOfOffset(text: string, offset: number): number {
  let line = 1;

  for (let index = 0; index < offset && index < text.length; index++) {
    if (text[index] === '\n') {
      line++;
    }
  }

  return line;
}
