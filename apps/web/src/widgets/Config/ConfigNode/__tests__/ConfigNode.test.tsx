import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, CONFIG_SECTION } from '@entities/Config';

import { ConfigNode } from '../ui/ConfigNode';

const VLESS = { type: 'vless', tag: 'hk-01', server: 'a.example' };

describe('section node', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(JSON.stringify({ outbounds: [VLESS] }, null, 2));
  });

  it('a recognized node opens with a schema form', () => {
    render(<ConfigNode section={CONFIG_SECTION.Outbounds} index={0} node={VLESS} name='hk-01' />);

    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'server' })).toHaveValue('a.example');
    expect(screen.queryByText('UI не покрывает')).not.toBeInTheDocument();
  });

  it('what was typed in the form survives a switch to JSON and back', async () => {
    const user = userEvent.setup();

    render(<ConfigNode section={CONFIG_SECTION.Outbounds} index={0} node={VLESS} name='hk-01' />);

    const server = screen.getByRole('textbox', { name: 'server' });

    await user.clear(server);
    await user.type(server, 'b.example');
    await user.click(screen.getByRole('tab', { name: 'JSON' }));

    expect(screen.getByRole('textbox', { name: 'Узел hk-01 текстом' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'server' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Форма' }));

    expect(screen.getByRole('textbox', { name: 'server' })).toHaveValue('b.example');
  });

  it('a node with a field the schema does not know is marked and opened as text, the form is disabled', () => {
    const node = { ...VLESS, vendor_option: true };

    render(<ConfigNode section={CONFIG_SECTION.Outbounds} index={0} node={node} name='hk-01' />);

    expect(screen.getByText('UI не покрывает')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Узел hk-01 текстом' })).toHaveValue(JSON.stringify(node, null, 2));
  });

  it('the api service opens with the form of its override', () => {
    const node = { type: 'api', tag: 'api', listen: '127.0.0.1', listen_port: 9091 };

    render(<ConfigNode section={CONFIG_SECTION.Services} index={0} node={node} name='api' />);

    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('spinbutton', { name: 'listen_port' })).toHaveValue(9091);
  });

  it('the experimental section opens with a form that hides the clash_api secret', async () => {
    const user = userEvent.setup();
    const node = { clash_api: { external_controller: '127.0.0.1:9090', secret: 's3cr3t' } };

    render(<ConfigNode section={CONFIG_SECTION.Experimental} index={0} node={node} name='experimental' />);

    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('textbox', { name: 'Узел experimental текстом' })).not.toBeInTheDocument();

    const secret = screen.getByLabelText('secret');

    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveValue('s3cr3t');

    await user.click(screen.getByRole('button', { name: 'Показать secret' }));

    expect(secret).toHaveAttribute('type', 'text');
  });

  it('an experimental section with a key the schema does not know opens as text', () => {
    const node = { vendor_api: { enabled: true } };

    render(<ConfigNode section={CONFIG_SECTION.Experimental} index={0} node={node} name='experimental' />);

    expect(screen.getByText('UI не покрывает')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('textbox', { name: 'Узел experimental текстом' })).toBeInTheDocument();
  });

  it('any other service is edited only as text: services have no auto forms', () => {
    render(
      <ConfigNode
        section={CONFIG_SECTION.Services}
        index={0}
        node={{ type: 'resolved', tag: 'resolved' }}
        name='resolved'
      />
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Узел resolved текстом' })).toBeInTheDocument();
  });

  it.each([
    [CONFIG_SECTION.Log, { level: 'info' }],
    [CONFIG_SECTION.DnsRules, { domain: ['a.example'], server: 'local' }],
  ])('section %s without a registry is edited only as text', (section, node) => {
    render(<ConfigNode section={section} index={0} node={node} name={section} />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('UI не покрывает')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: `Узел ${section} текстом` })).toBeInTheDocument();
  });
});
