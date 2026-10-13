import { z } from 'zod';

/**
 * Kind of a node schema field: the form picks a widget by it. A kind the
 * recognizer does not know is `Raw`: the field is edited as JSON text of the subnode and is not
 * lost.
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

/** A node field parsed from the schema: everything the widget needs, without the schema itself. */
export interface FieldPlan {
  /** Field key in its own object. */
  key: string;
  /** Path from the node root: `['tls', 'reality', 'public_key']`. */
  path: string[];
  kind: FieldKind;
  /** `enum` and `enumList` values; for `literal` its single value. */
  options?: string[];
  /** Group fields. */
  children?: FieldPlan[];
  /** A list the schema also accepts as a single value: `"a"` instead of `["a"]`. */
  listable?: boolean;
}

/** A variant of the registry's discriminated union: the `type` value and the node schema. */
export interface SchemaVariant {
  type: string;
  schema: z.core.$ZodType;
}

/**
 * Path depth up to which nested objects are expanded as groups. Deeper,
 * the group goes into `raw` as a whole: in the fork schema nesting is at most three
 * (`anytls.tls.acme.external_account`), and self-references go through a union and do not
 * become a group — the limit insures against future ones.
 */
const MAX_DEPTH = 4;

/**
 * The Go duration pattern with which `tools/schemagen` prints `badoption.Duration`
 * (`durationPattern` in `overrides.go`). A string with this pattern is a duration,
 * not arbitrary text: the field gets a format hint by it.
 */
const DURATION_SOURCE = String.raw`^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$`;

/** Formats of `z.int()` and its kin: an integer, not an arbitrary number. */
const INT_FORMATS: ReadonlySet<string> = new Set(['safeint', 'int32', 'uint32']);

/** Wrappers that do not change the field kind: the schema under them is the field. */
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

/** Kind of a value field: string, number, flag, enumeration. `null` means not a value. */
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
 * List element: an array `X[]` or listable `X | X[]` — this is how the fork prints
 * `badoption.Listable`, which also accepts a single value.
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

/** Union of strings and numbers (`FwMark`, `UDPTimeoutCompat`): one input field. */
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
 * Node form plan: the fields of the schema object in schema order, nested objects as
 * groups. A schema that is not an object has no fields.
 *
 * The only place in the panel that reads Zod's internal representation
 * (`_zod.def`): a Zod major bump touches only this module.
 */
export function toFieldPlan(schema: z.core.$ZodType): FieldPlan[] {
  const inner = unwrap(schema);

  return inner instanceof z.core.$ZodObject ? planShape(inner, []) : [];
}

/**
 * Variants of a union discriminated by `type`: the fork's type registry. A variant
 * whose `type` is not a string literal is skipped; a non-union has no variants.
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
