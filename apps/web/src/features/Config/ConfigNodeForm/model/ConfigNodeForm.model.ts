import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { z } from 'zod';

import { compactNode } from '@entities/Config';

/**
 * Модель формы узла: ключи — поля узла как есть. Форма авторендерера
 * типизирована против любого узла, а не одного типа: путь поля — строка из
 * схемы, и `Path<…>` от этой модели — просто `string`.
 */
export type ConfigNodeFormModel = Record<string, unknown>;

/**
 * Очищенное поле. Не `undefined`: его React Hook Form читает как «взять
 * значение по умолчанию» и возвращает в поле исходное. Ключ удаляет запись в
 * документ (`compactNode`).
 */
export const UNSET = null;

/** Поле без значения: очищенное или не заданное в узле. */
export function isUnset(value: unknown): value is null | undefined {
  return value === UNSET || value === undefined;
}

/** Перевод строки в многострочном поле: значения списка идут по одному на строку. */
const LINE_BREAK = /\r?\n/;

/** Запись из одних цифр: поле «строка или число» отдаёт её числом. */
const DIGITS = /^\d+$/;

/**
 * Схема формы узла: объект с ключами-строками и схема его типа разом.
 * Пересечение даёт резолверу вход-объект, которого базовый `$ZodType` реестра
 * по типу не несёт, — без приведения; замечания схемы типа доходят с теми же
 * путями и кодами.
 */
function toNodeFormSchema(schema: z.core.$ZodType) {
  return z.intersection(z.record(z.string(), z.unknown()), schema);
}

/**
 * Резолвер формы узла. Проверяется то, что ляжет в документ: очищенные поля
 * выпадают до проверки — пустая длительность значит «ключа нет», а не строку,
 * которая не проходит шаблон.
 */
export function toNodeFormResolver(schema: z.core.$ZodType): Resolver<ConfigNodeFormModel> {
  const resolve = zodResolver(toNodeFormSchema(schema));

  return async function resolveNode(values, context, options) {
    const compacted = compactNode(values);

    return resolve(isRecord(compacted) ? compacted : {}, context, options);
  };
}

function isRecord(value: unknown): value is ConfigNodeFormModel {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Имя поля формы: путь от корня узла через точку — RHF понимает только её. */
export function toFieldName(path: readonly string[]): string {
  return path.join('.');
}

/**
 * Значения списка, как их отдаёт форма. Пусто — ключа нет; одно значение
 * listable-поля — строкой, а не массивом из одного элемента: так его пишет и
 * форк, и нетронутая строка в файле не превращается в список.
 */
export function packList(items: readonly string[], listable: boolean): string | string[] | null {
  if (items.length === 0) {
    return UNSET;
  }

  return listable && items.length === 1 ? items[0] : [...items];
}

/** Значения списка из узла: listable-строка — один элемент, остальное отбрасывается. */
export function unpackList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value === '' ? [] : [value];
  }

  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** Многострочное поле в значения списка: пустые строки и пробелы по краям выпадают. */
export function textToList(text: string, listable: boolean): string | string[] | null {
  return packList(
    text
      .split(LINE_BREAK)
      .map((line) => line.trim())
      .filter((line) => line !== ''),
    listable
  );
}

export function listToText(value: unknown): string {
  return unpackList(value).join('\n');
}

/** Поле «строка или число» (`routing_mark`): запись из одних цифр — число. */
export function parseScalar(text: string): string | number | null {
  const trimmed = text.trim();

  if (trimmed === '') {
    return UNSET;
  }

  return DIGITS.test(trimmed) ? Number(trimmed) : trimmed;
}

/** Числовое поле: пустое — ключа нет. */
export function parseNumber(text: string): number | null {
  return text === '' ? UNSET : Number(text);
}

/** Значение поля ввода: строка и число показываются как есть, прочее — пусто. */
export function toInputText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return typeof value === 'number' ? String(value) : '';
}

/** Группа, в которой что-то задано: такая открывается сразу. */
export function isFilledGroup(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}
