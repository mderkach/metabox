import { type ParseError, parse } from 'jsonc-parser';

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

  return { offset: first.offset, text: PARSE_ERROR_TEXT[first.error] ?? 'конфиг не разобран' };
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

  return { value, failure: { offset: first.offset, text: PARSE_ERROR_TEXT[first.error] ?? 'конфиг не разобран' } };
}
