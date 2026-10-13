import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FIELD_KIND, toFieldPlan, toVariants, unwrap } from '../schemaShape';

/** The duration pattern is the same one the schema generator prints. */
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
  it('keeps the schema field order', () => {
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
  ])('field %s gets kind %s', (key, kind) => {
    expect(fieldOf(key)?.kind).toBe(kind);
  });

  it.each(['ports', 'domain_resolver', 'headers'])('an unknown kind %s goes to raw instead of being lost', (key) => {
    expect(fieldOf(key)?.kind).toBe(FIELD_KIND.Raw);
  });

  it('treats a string with a foreign pattern as a string, not a duration', () => {
    const plan = toFieldPlan(z.strictObject({ uuid: z.string().regex(/^[0-9a-f-]+$/) }));

    expect(plan[0]?.kind).toBe(FIELD_KIND.String);
  });

  it('returns the enum and literal values', () => {
    expect(fieldOf('strategy')?.options).toEqual(['', 'prefer_ipv4', 'ipv4_only']);
    expect(fieldOf('network')?.options).toEqual(['tcp', 'udp']);
    expect(fieldOf('type')?.options).toEqual(['vless']);
  });

  it('tells listable from an array: a single value is accepted only by the first', () => {
    expect(fieldOf('alpn')?.listable).toBe(true);
    expect(fieldOf('network')?.listable).toBe(true);
    expect(fieldOf('outbounds')?.listable).toBe(false);
  });

  it('expands a nested object into a group with full paths', () => {
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

  it('an object deeper than four levels goes to raw as a whole', () => {
    const deep = z.strictObject({
      a: z.strictObject({ b: z.strictObject({ c: z.strictObject({ d: z.strictObject({ e: z.string() }) }) }) }),
    });
    const [a] = toFieldPlan(deep);
    const d = a.children?.[0]?.children?.[0]?.children?.[0];

    expect(d?.path).toEqual(['a', 'b', 'c', 'd']);
    expect(d?.kind).toBe(FIELD_KIND.Raw);
    expect(d?.children).toBeUndefined();
  });

  it('a non-object schema has no fields', () => {
    expect(toFieldPlan(z.string())).toEqual([]);
  });
});

describe('unwrap', () => {
  it('strips optional, nullable and default down to the field schema itself', () => {
    const inner = z.string();

    expect(unwrap(inner.nullable().default('x').optional())).toBe(inner);
  });
});

describe('toVariants', () => {
  const RegistrySchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('direct'), tag: z.string().optional() }),
    z.strictObject({ type: z.literal('block'), tag: z.string().optional() }),
  ]);

  it('lists registry types with variant schemas', () => {
    const variants = toVariants(RegistrySchema);

    expect(variants.map((variant) => variant.type)).toEqual(['direct', 'block']);
    expect(toFieldPlan(variants[0]?.schema ?? z.never()).map((field) => field.key)).toEqual(['type', 'tag']);
  });

  it('a plain union and non-union have no variants', () => {
    expect(toVariants(z.union([z.string(), z.int()]))).toEqual([]);
    expect(toVariants(z.string())).toEqual([]);
  });

  it('a union with a different discriminator is not counted as a registry', () => {
    const union = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('a') })]);

    expect(toVariants(union)).toEqual([]);
  });
});
