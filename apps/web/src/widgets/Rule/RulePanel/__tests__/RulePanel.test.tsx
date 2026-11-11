import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState, readRules } from '@entities/Config';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { toRuleRowsFromNodes } from '@entities/Rule';

import { RulePanel } from '../ui/RulePanel';

/** One rule in an otherwise minimal document: the row is built by the same adapter as on the screen. */
function loadRule(rule: object): { node: unknown; row: ReturnType<typeof toRuleRowsFromNodes>[number] } {
  const text = JSON.stringify({ route: { rules: [rule] } }, null, 2);

  ConfigDocumentState.getState().reset();
  ConfigDocumentState.getState().load(text);

  const nodes = readRules(text);
  const row = toRuleRowsFromNodes(nodes).at(0);

  if (row === undefined) {
    throw new Error('Правило не разобралось');
  }

  return { node: nodes[0], row };
}

describe('RulePanel', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(...createDeviceHandlers());
  });

  it('opens a rule with an action the form does not edit as JSON and says why', () => {
    const { node, row } = loadRule({ domain: ['example.com'], action: 'resolve', server: 'local' });

    renderWithQuery(
      <RulePanel rule={row} node={node} recognized outbounds={[]} ruleSets={[]} onClose={vi.fn<() => void>()} />
    );

    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByText('Форма не знает действие «resolve» — править правило можно на вкладке JSON.')
    ).toBeInTheDocument();
  });

  it('opens a rule with its own action in the form', () => {
    const { node, row } = loadRule({ domain: ['example.com'], action: 'reject' });

    renderWithQuery(
      <RulePanel rule={row} node={node} recognized outbounds={[]} ruleSets={[]} onClose={vi.fn<() => void>()} />
    );

    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/Форма не знает действие/)).not.toBeInTheDocument();
  });
});
