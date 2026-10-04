import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FIELD_KIND, toFieldPlan, toVariants, unwrap } from '../schemaShape';

/** Шаблон длительности — тот же, что печатает генератор схемы. */
const DURATION = /^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/;

const NodeSchema = z.strictObject({
  type: z.literal('vless'),
  tag: z.string().optional(),
  connect_timeout: z.string().regex(DURATION).optional(),
  server_port: z.int().nonnegative().optional(),
  weight: z.number().optional(),
  udp_fragment: z.boolean().optional(),
  strategy: z.enum(['', 'prefer_ipv4', 'ipv4_only']).optional(),
  routing_mark: z.union([z.int().nonnegative(), z.string()]).optional(),
  udp_timeout: z.union([z.int().nonnegative(), z.string().regex(DURATION)]).optional(),
  alpn: z.union([z.string(), z.array(z.string())]).optional(),
  network: z.union([z.enum(['tcp', 'udp']), z.array(z.enum(['tcp', 'udp']))]).optional(),
  outbounds: z.array(z.string()).optional(),
  ports: z.array(z.int()).optional(),
  domain_resolver: z.union([z.string(), z.strictObject({ server: z.string().optional() })]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  get tls() {
    return z
      .strictObject({
        enabled: z.boolean().optional(),
        reality: z.strictObject({ public_key: z.string().optional() }).optional(),
      })
      .optional();
  },
});

function fieldOf(key: string) {
  return toFieldPlan(NodeSchema).find((field) => field.key === key);
}

describe('toFieldPlan', () => {
  it('сохраняет порядок полей схемы', () => {
    expect(toFieldPlan(NodeSchema).map((field) => field.key)).toEqual(Object.keys(NodeSchema.shape));
  });

  it.each([
    ['type', FIELD_KIND.Literal],
    ['tag', FIELD_KIND.String],
    ['connect_timeout', FIELD_KIND.Duration],
    ['server_port', FIELD_KIND.Int],
    ['weight', FIELD_KIND.Number],
    ['udp_fragment', FIELD_KIND.Boolean],
    ['strategy', FIELD_KIND.Enum],
    ['routing_mark', FIELD_KIND.Scalar],
    ['udp_timeout', FIELD_KIND.Scalar],
    ['alpn', FIELD_KIND.List],
    ['network', FIELD_KIND.EnumList],
    ['outbounds', FIELD_KIND.List],
    ['tls', FIELD_KIND.Group],
  ])('поле %s получает вид %s', (key, kind) => {
    expect(fieldOf(key)?.kind).toBe(kind);
  });

  it.each(['ports', 'domain_resolver', 'headers'])('незнакомый вид %s уходит в raw, а не теряется', (key) => {
    expect(fieldOf(key)?.kind).toBe(FIELD_KIND.Raw);
  });

  it('строку с чужим шаблоном считает строкой, а не длительностью', () => {
    const plan = toFieldPlan(z.strictObject({ uuid: z.string().regex(/^[0-9a-f-]+$/) }));

    expect(plan[0]?.kind).toBe(FIELD_KIND.String);
  });

  it('отдаёт значения перечисления и литерала', () => {
    expect(fieldOf('strategy')?.options).toEqual(['', 'prefer_ipv4', 'ipv4_only']);
    expect(fieldOf('network')?.options).toEqual(['tcp', 'udp']);
    expect(fieldOf('type')?.options).toEqual(['vless']);
  });

  it('отличает listable от массива: одиночное значение принимает только первый', () => {
    expect(fieldOf('alpn')?.listable).toBe(true);
    expect(fieldOf('network')?.listable).toBe(true);
    expect(fieldOf('outbounds')?.listable).toBe(false);
  });

  it('раскрывает вложенный объект группой с полными путями', () => {
    const tls = fieldOf('tls');
    const reality = tls?.children?.find((field) => field.key === 'reality');

    expect(tls?.children?.map((field) => field.path)).toEqual([
      ['tls', 'enabled'],
      ['tls', 'reality'],
    ]);
    expect(reality?.kind).toBe(FIELD_KIND.Group);
    expect(reality?.children).toEqual([
      { key: 'public_key', path: ['tls', 'reality', 'public_key'], kind: FIELD_KIND.String },
    ]);
  });

  it('объект глубже четырёх уровней уходит в raw целиком', () => {
    const deep = z.strictObject({
      a: z.strictObject({ b: z.strictObject({ c: z.strictObject({ d: z.strictObject({ e: z.string() }) }) }) }),
    });
    const [a] = toFieldPlan(deep);
    const d = a.children?.[0]?.children?.[0]?.children?.[0];

    expect(d?.path).toEqual(['a', 'b', 'c', 'd']);
    expect(d?.kind).toBe(FIELD_KIND.Raw);
    expect(d?.children).toBeUndefined();
  });

  it('у схемы-не-объекта полей нет', () => {
    expect(toFieldPlan(z.string())).toEqual([]);
  });
});

describe('unwrap', () => {
  it('снимает optional, nullable и default до самой схемы поля', () => {
    const inner = z.string();

    expect(unwrap(inner.nullable().default('x').optional())).toBe(inner);
  });
});

describe('toVariants', () => {
  const RegistrySchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('direct'), tag: z.string().optional() }),
    z.strictObject({ type: z.literal('block'), tag: z.string().optional() }),
  ]);

  it('перечисляет типы реестра со схемами вариантов', () => {
    const variants = toVariants(RegistrySchema);

    expect(variants.map((variant) => variant.type)).toEqual(['direct', 'block']);
    expect(toFieldPlan(variants[0]?.schema ?? z.never()).map((field) => field.key)).toEqual(['type', 'tag']);
  });

  it('у обычного union и не-union вариантов нет', () => {
    expect(toVariants(z.union([z.string(), z.int()]))).toEqual([]);
    expect(toVariants(z.string())).toEqual([]);
  });

  it('union с другим дискриминатором реестром не считает', () => {
    const union = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('a') })]);

    expect(toVariants(union)).toEqual([]);
  });
});
