import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NODE_REGISTRY, nodeVariants } from '@entities/Config';
import { FIELD_KIND, toFieldPlan, type FieldPlan } from '@shared/lib/schemaShape';

import { ConfigNodeForm } from '../ui/ConfigNodeForm';

/**
 * Обход всех типов семи реестров схемы (ADR-0035): каждый получает форму, а
 * поля, ушедшие в запасной raw-виджет, перечислены снапшотом — рост списка
 * виден в диффе. Схема генерируется, поэтому снапшот здесь допустим.
 */
const VARIANTS = Object.values(NODE_REGISTRY).flatMap((registry) =>
  nodeVariants(registry).map((variant) => ({ registry, ...variant, key: `${registry}/${variant.type}` }))
);

/** Узлы, которые форма обязана открывать на экране секций: inbound и outbound. */
const ROUTED = VARIANTS.filter(
  (variant) => variant.registry === NODE_REGISTRY.Inbound || variant.registry === NODE_REGISTRY.Outbound
);

function rawPaths(plan: FieldPlan[]): string[] {
  return plan.flatMap((field) =>
    field.kind === FIELD_KIND.Raw ? [field.path.join('.')] : rawPaths(field.children ?? [])
  );
}

describe('обход реестров схемы', () => {
  it.each(VARIANTS)('$key получает план полей', ({ schema }) => {
    expect(toFieldPlan(schema).length).toBeGreaterThan(0);
  });

  it('перечисляет поля, ушедшие в raw', () => {
    const raw = Object.fromEntries(VARIANTS.map((variant) => [variant.key, rawPaths(toFieldPlan(variant.schema))]));

    expect(raw).toMatchSnapshot();
  });

  it.each(ROUTED)('$key открывается формой без исключений', ({ registry, type }) => {
    render(<ConfigNodeForm registry={registry} path={['outbounds', 0]} node={{ type, tag: 'node' }} />);

    expect(screen.getByRole('textbox', { name: 'tag' })).toHaveValue('node');
  });
});
