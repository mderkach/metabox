import { z } from 'zod';

/**
 * Вид поля схемы узла: по нему форма выбирает виджет. Вид, которого
 * распознавание не знает, — `Raw`: поле правится JSON-текстом подузла, а не
 * теряется.
 */
export const FIELD_KIND = {
  String: 'string',
  Duration: 'duration',
  Int: 'int',
  Number: 'number',
  Boolean: 'boolean',
  Enum: 'enum',
  Literal: 'literal',
  List: 'list',
  EnumList: 'enumList',
  Scalar: 'scalar',
  Group: 'group',
  Raw: 'raw',
} as const;

export type FieldKind = (typeof FIELD_KIND)[keyof typeof FIELD_KIND];

/** Поле узла, разобранное из схемы: всё, что нужно виджету, без самой схемы. */
export interface FieldPlan {
  /** Ключ поля в своём объекте. */
  key: string;
  /** Путь от корня узла: `['tls', 'reality', 'public_key']`. */
  path: string[];
  kind: FieldKind;
  /** Значения `enum` и `enumList`; у `literal` — его единственное значение. */
  options?: string[];
  /** Поля группы. */
  children?: FieldPlan[];
  /** Список, который схема принимает и одиночным значением: `"a"` вместо `["a"]`. */
  listable?: boolean;
}

/** Вариант дискриминированного union реестра: значение `type` и схема узла. */
export interface SchemaVariant {
  type: string;
  schema: z.core.$ZodType;
}

/**
 * Глубина пути, до которой вложенные объекты раскрываются группами. Глубже
 * группа уходит в `raw` целиком: в схеме форка вложенность не больше трёх
 * (`anytls.tls.acme.external_account`), а самоссылки идут через union и в
 * группу не попадают — граница страхует от будущих.
 */
const MAX_DEPTH = 4;

/**
 * Шаблон длительности Go, которым `tools/schemagen` печатает `badoption.Duration`
 * (`durationPattern` в `overrides.go`). Строка с этим шаблоном — длительность,
 * а не произвольный текст: по нему поле получает подсказку формата.
 */
const DURATION_SOURCE = String.raw`^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$`;

/** Форматы `z.int()` и его родни: целое, а не произвольное число. */
const INT_FORMATS: ReadonlySet<string> = new Set(['safeint', 'int32', 'uint32']);

/** Обёртки, которые не меняют вид поля: схема под ними и есть поле. */
export function unwrap(schema: z.core.$ZodType): z.core.$ZodType {
  let inner = schema;

  while (
    inner instanceof z.core.$ZodOptional ||
    inner instanceof z.core.$ZodNullable ||
    inner instanceof z.core.$ZodDefault
  ) {
    inner = inner._zod.def.innerType;
  }

  return inner;
}

/** Вид поля-значения: строка, число, флаг, перечисление. `null` — не значение. */
function valueKind(schema: z.core.$ZodType): Pick<FieldPlan, 'kind' | 'options'> | null {
  if (schema instanceof z.core.$ZodString) {
    return { kind: isDuration(schema) ? FIELD_KIND.Duration : FIELD_KIND.String };
  }

  if (schema instanceof z.core.$ZodNumberFormat) {
    return { kind: INT_FORMATS.has(schema._zod.def.format) ? FIELD_KIND.Int : FIELD_KIND.Number };
  }

  if (schema instanceof z.core.$ZodNumber) {
    return { kind: FIELD_KIND.Number };
  }

  if (schema instanceof z.core.$ZodBoolean) {
    return { kind: FIELD_KIND.Boolean };
  }

  if (schema instanceof z.core.$ZodEnum) {
    const options = Object.values(schema._zod.def.entries);

    return options.every((option) => typeof option === 'string') ? { kind: FIELD_KIND.Enum, options } : null;
  }

  if (schema instanceof z.core.$ZodLiteral) {
    const [value] = schema._zod.def.values;

    return typeof value === 'string' ? { kind: FIELD_KIND.Literal, options: [value] } : null;
  }

  return null;
}

function isDuration(schema: z.core.$ZodString): boolean {
  return (schema._zod.def.checks ?? []).some(
    (check) => check instanceof z.core.$ZodCheckRegex && check._zod.def.pattern.source === DURATION_SOURCE
  );
}

/**
 * Элемент списка: массив `X[]` или listable `X | X[]` — так форк печатает
 * `badoption.Listable`, который принимает и одиночное значение.
 */
function listElement(schema: z.core.$ZodType): { element: z.core.$ZodType; listable: boolean } | null {
  if (schema instanceof z.core.$ZodArray) {
    return { element: unwrap(schema._zod.def.element), listable: false };
  }

  if (!(schema instanceof z.core.$ZodUnion)) {
    return null;
  }

  const [single, many, ...rest] = schema._zod.def.options.map(unwrap);

  if (rest.length > 0 || !(many instanceof z.core.$ZodArray)) {
    return null;
  }

  const element = unwrap(many._zod.def.element);
  const singleKind = valueKind(single);
  const elementKind = valueKind(element);

  return singleKind !== null && elementKind !== null && singleKind.kind === elementKind.kind
    ? { element, listable: true }
    : null;
}

/** Union строк и чисел (`FwMark`, `UDPTimeoutCompat`): одно поле ввода. */
function isScalarUnion(schema: z.core.$ZodType): boolean {
  if (!(schema instanceof z.core.$ZodUnion) || schema instanceof z.core.$ZodDiscriminatedUnion) {
    return false;
  }

  return schema._zod.def.options.every((option) => {
    const kind = valueKind(unwrap(option))?.kind;

    return (
      kind === FIELD_KIND.String ||
      kind === FIELD_KIND.Duration ||
      kind === FIELD_KIND.Int ||
      kind === FIELD_KIND.Number
    );
  });
}

function planField(key: string, path: string[], schema: z.core.$ZodType): FieldPlan {
  const inner = unwrap(schema);
  const value = valueKind(inner);

  if (value !== null) {
    return { key, path, ...value };
  }

  const list = listElement(inner);
  const element = list === null ? null : valueKind(list.element);

  if (list !== null && element !== null) {
    if (element.kind === FIELD_KIND.Enum) {
      return { key, path, kind: FIELD_KIND.EnumList, options: element.options, listable: list.listable };
    }

    if (element.kind === FIELD_KIND.String || element.kind === FIELD_KIND.Duration) {
      return { key, path, kind: FIELD_KIND.List, listable: list.listable };
    }
  }

  if (isScalarUnion(inner)) {
    return { key, path, kind: FIELD_KIND.Scalar };
  }

  if (inner instanceof z.core.$ZodObject && path.length < MAX_DEPTH) {
    return { key, path, kind: FIELD_KIND.Group, children: planShape(inner, path) };
  }

  return { key, path, kind: FIELD_KIND.Raw };
}

function planShape(schema: z.core.$ZodObject, parent: string[]): FieldPlan[] {
  return Object.entries(schema._zod.def.shape).map(([key, field]) => planField(key, [...parent, key], field));
}

/**
 * План формы узла: поля объекта схемы в порядке схемы, вложенные объекты —
 * группами. Схема не объект — полей нет.
 *
 * Единственное место панели, которое читает внутреннее представление Zod
 * (`_zod.def`): подъём мажора Zod правит только этот модуль.
 */
export function toFieldPlan(schema: z.core.$ZodType): FieldPlan[] {
  const inner = unwrap(schema);

  return inner instanceof z.core.$ZodObject ? planShape(inner, []) : [];
}

/**
 * Варианты дискриминированного по `type` union: реестр типов форка. Вариант,
 * у которого `type` не строковый литерал, пропускается; не union — вариантов нет.
 */
export function toVariants(union: z.core.$ZodType): SchemaVariant[] {
  const inner = unwrap(union);

  if (!(inner instanceof z.core.$ZodDiscriminatedUnion) || inner._zod.def.discriminator !== 'type') {
    return [];
  }

  return inner._zod.def.options.flatMap((option) => {
    const variant = unwrap(option);
    const discriminator = variant instanceof z.core.$ZodObject ? variant._zod.def.shape.type : undefined;
    const literal = discriminator === undefined ? null : valueKind(unwrap(discriminator));
    const type = literal?.kind === FIELD_KIND.Literal ? literal.options?.[0] : undefined;

    return type === undefined ? [] : [{ type, schema: option }];
  });
}
