import { zodResolver } from '@hookform/resolvers/zod';
import { get, set, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { compactNode } from '@entities/Config';
import type { FieldPlan } from '@shared/lib/schemaShape';

import { overrideIssues, type NodeOverride } from './ConfigNodeForm.overrides';

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
 *
 * Поверх схемы типа — проверки его оверрайда: обязательные поля и `refine`.
 * Узел до правки резолвер получает контекстом формы. Замечание схемы на том
 * же поле остаётся первым: оно точнее.
 */
export function toNodeFormResolver(
  schema: z.core.$ZodType,
  override: NodeOverride | null = null
): Resolver<ConfigNodeFormModel, ConfigNodeFormModel> {
  const resolve = zodResolver(toNodeFormSchema(schema));

  return async function resolveNode(values, context, options) {
    const compacted = compactNode(values);
    const node = isRecord(compacted) ? compacted : {};
    const result = await resolve(node, context, options);
    const issues = overrideIssues(override, node, context ?? {});

    if (issues.length === 0) {
      return result;
    }

    const errors = { ...result.errors };

    for (const { name, code } of issues) {
      if (get(errors, name) === undefined) {
        set(errors, name, { type: code, message: code });
      }
    }

    return { values: {}, errors };
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

/**
 * Одинаковы ли значения поля как JSON. Форма копирует значения на каждом
 * сбросе, поэтому сравнение по ссылке видело бы смену там, где её нет.
 */
export function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Группа, в которой что-то задано: такая открывается сразу. */
export function isFilledGroup(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

/** Поля формы с оверрайдом: сверху — основные, остальные — под свёрткой. */
export interface NodeFormLayout {
  primary: FieldPlan[];
  rest: FieldPlan[];
}

function findField(plan: readonly FieldPlan[], name: string): FieldPlan | null {
  for (const field of plan) {
    const fieldName = toFieldName(field.path);

    if (fieldName === name) {
      return field;
    }

    if (field.children !== undefined && name.startsWith(`${fieldName}.`)) {
      return findField(field.children, name);
    }
  }

  return null;
}

/** План без полей `names`; группа, от которой ничего не осталось, выпадает целиком. */
function withoutFields(plan: readonly FieldPlan[], names: ReadonlySet<string>): FieldPlan[] {
  return plan.flatMap((field) => {
    if (names.has(toFieldName(field.path))) {
      return [];
    }

    if (field.children === undefined) {
      return [field];
    }

    const children = withoutFields(field.children, names);

    return children.length === 0 ? [] : [{ ...field, children }];
  });
}

/** Вид полей, который оверрайд подменяет: остальное — как в схеме. */
function withWidgets(plan: readonly FieldPlan[], widgets: NonNullable<NodeOverride['widgets']>): FieldPlan[] {
  return plan.map((field) => {
    const widget = widgets[toFieldName(field.path)];

    if (widget !== undefined) {
      return { ...field, kind: widget.kind, options: widget.options };
    }

    return field.children === undefined ? field : { ...field, children: withWidgets(field.children, widgets) };
  });
}

/**
 * Раскладка формы по оверрайду: основные поля по его порядку и остальные.
 * Вложенное основное поле поднимается наверх и подписывается путём целиком
 * (`tls.server_name`), а из своей группы уходит: одно поле — один контрол.
 * Без оверрайда основных полей нет, и форма идёт по схеме как есть.
 */
export function arrangePlan(plan: readonly FieldPlan[], override: NodeOverride | null): NodeFormLayout {
  if (override === null) {
    return { primary: [], rest: [...plan] };
  }

  const fields = override.widgets === undefined ? plan : withWidgets(plan, override.widgets);
  const primary = override.primary.flatMap((name) => {
    const field = findField(fields, name);

    return field === null ? [] : [{ ...field, key: name }];
  });

  return { primary, rest: withoutFields(fields, new Set(override.primary)) };
}
