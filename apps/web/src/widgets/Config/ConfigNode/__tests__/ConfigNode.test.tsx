import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, CONFIG_SECTION } from '@entities/Config';

import { ConfigNode } from '../ui/ConfigNode';

const VLESS = { type: 'vless', tag: 'hk-01', server: 'a.example' };

describe('узел секции', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(JSON.stringify({ outbounds: [VLESS] }, null, 2));
  });

  it('распознанный узел открывается формой по схеме', () => {
    render(<ConfigNode section={CONFIG_SECTION.Outbounds} index={0} node={VLESS} name='hk-01' />);

    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'server' })).toHaveValue('a.example');
    expect(screen.queryByText('UI не покрывает')).not.toBeInTheDocument();
  });

  it('узел с полем, которого схема не знает, помечен и открыт текстом, форма выключена', () => {
    const node = { ...VLESS, vendor_option: true };

    render(<ConfigNode section={CONFIG_SECTION.Outbounds} index={0} node={node} name='hk-01' />);

    expect(screen.getByText('UI не покрывает')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Узел hk-01 текстом' })).toHaveValue(JSON.stringify(node, null, 2));
  });

  it('служба правится только текстом: автоформ у служб нет', () => {
    render(<ConfigNode section={CONFIG_SECTION.Services} index={0} node={{ type: 'api', tag: 'api' }} name='api' />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Узел api текстом' })).toBeInTheDocument();
  });

  it.each([
    [CONFIG_SECTION.Log, { level: 'info' }],
    [CONFIG_SECTION.DnsRules, { domain: ['a.example'], server: 'local' }],
  ])('секция %s без реестра правится только текстом', (section, node) => {
    render(<ConfigNode section={section} index={0} node={node} name={section} />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('UI не покрывает')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: `Узел ${section} текстом` })).toBeInTheDocument();
  });
});
