import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NODE_REGISTRY, nodeVariants } from '@entities/Config';
import { FIELD_KIND, toFieldPlan, type FieldPlan } from '@shared/lib/schemaShape';

import { ConfigNodeForm } from '../ui/ConfigNodeForm';

/**
 * A walk over all types of the seven schema registries (ADR-0035): each gets a form, and
 * fields that fell to the fallback raw widget are listed in a snapshot: list
 * growth is visible in the diff. The schema is generated, so a snapshot is acceptable here.
 */
const VARIANTS = Object.values(NODE_REGISTRY).flatMap((registry) =>
  nodeVariants(registry).map((variant) => ({ registry, ...variant, key: `${registry}/${variant.type}` }))
);

/** Nodes the form must open on the sections screen: inbound and outbound. */
const ROUTED = VARIANTS.filter(
  (variant) => variant.registry === NODE_REGISTRY.Inbound || variant.registry === NODE_REGISTRY.Outbound
);

function rawPaths(plan: FieldPlan[]): string[] {
  return plan.flatMap((field) =>
    field.kind === FIELD_KIND.Raw ? [field.path.join('.')] : rawPaths(field.children ?? [])
  );
}

describe('schema registry walk', () => {
  it.each(VARIANTS)('$key gets a field plan', ({ schema }) => {
    expect(toFieldPlan(schema).length).toBeGreaterThan(0);
  });

  it('lists the fields that fell to raw', () => {
    const raw = Object.fromEntries(VARIANTS.map((variant) => [variant.key, rawPaths(toFieldPlan(variant.schema))]));

    expect(raw).toMatchSnapshot();
  });

  it.each(ROUTED)('$key opens as a form without exceptions', ({ registry, type }) => {
    render(<ConfigNodeForm registry={registry} path={['outbounds', 0]} node={{ type, tag: 'node' }} />);

    expect(screen.getByRole('textbox', { name: 'Имя узла' })).toHaveValue('node');
  });
});
