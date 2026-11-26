import { renderWithQuery } from '@test/renderWithQuery';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { ConfigDocumentStore, readSectionNodes, selectConfigCurrent } from '@entities/Config';

import { ConfigNodeAddLink } from '../ui/ConfigNodeAddLink';

const REALITY_LINK = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@edge.example:443?security=reality&sni=front.example';

describe('ConfigNodeAddLink', () => {
  beforeEach(() => {
    ConfigDocumentStore.getState().load('{}');
  });

  afterEach(() => {
    ConfigDocumentStore.getState().reset();
  });

  it('shows omitted names before adding and writes the mapped config to the draft', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ConfigNodeAddLink section='outbounds' takenTags={[]} />);

    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.paste(`${REALITY_LINK}&spx=%2Fprivate-path&extra=opaque&support-x25519mlkem768=false#Edge`);

    const warning = screen.getByRole('status');
    expect(warning).toHaveTextContent('spx, extra');
    expect(warning).not.toHaveTextContent(/private-path|opaque|sni|support-x25519mlkem768/);
    expect(input).toHaveAccessibleDescription(/spx, extra/);

    await user.click(screen.getByRole('button', { name: 'Добавить по ссылке' }));

    const nodes = readSectionNodes(selectConfigCurrent(ConfigDocumentStore.getState()) ?? '', 'outbounds');
    expect(nodes).toEqual([
      {
        type: 'vless',
        tag: 'Edge',
        server: 'edge.example',
        server_port: 443,
        uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811',
        tls: {
          enabled: true,
          server_name: 'front.example',
          utls: { enabled: true, fingerprint: 'chrome' },
          reality: { enabled: true, support_x25519mlkem768: false },
        },
      },
    ]);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('clears the advisory when the user replaces a link', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ConfigNodeAddLink section='outbounds' takenTags={[]} />);

    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.paste(`${REALITY_LINK}&spx=first&%73px=second`);
    expect(screen.getByRole('status')).toHaveTextContent(/spx$/);
    expect(screen.getByRole('status')).not.toHaveTextContent(/spx.*spx/);

    await user.clear(input);
    await user.paste(REALITY_LINK);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(input).not.toHaveAccessibleDescription(/spx/);
  });

  it.each([
    ['a subscription URL', 'https://provider.example/sub/token', /Это адрес подписки/],
    ['an invalid server URL', 'vless://id@edge.example', /нет адреса сервера или порта/],
  ])('replaces a stale advisory with the existing error for %s', async (_case, text, error) => {
    const user = userEvent.setup();
    renderWithQuery(<ConfigNodeAddLink section='outbounds' takenTags={[]} />);

    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.paste(`${REALITY_LINK}&spx=private-path`);
    expect(screen.getByRole('status')).toHaveTextContent('spx');

    await user.clear(input);
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: 'Добавить по ссылке' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('tells a subscription address from a server link and points to the subscriptions section', async () => {
    renderWithQuery(<ConfigNodeAddLink section='outbounds' takenTags={[]} />);

    await userEvent.type(screen.getByRole('textbox'), 'https://provider.example/sub/token');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить по ссылке' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Это адрес подписки');
    expect(screen.getByRole('alert')).toHaveTextContent('«Подписки»');
  });
});

it('reviews a recognized server, preserves ambiguous input and keeps credentials out of feedback', async () => {
  const server = {
    type: 'trojan',
    tag: 'existing',
    server: 'edge.example',
    server_port: 443,
    password: 'test-password',
    tls: { enabled: true, server_name: 'edge.example' },
    detour: 'existing-detour',
  };
  const state = ConfigDocumentStore.getState();
  state.load(JSON.stringify({ outbounds: [server] }));
  const user = userEvent.setup();
  const { container, unmount } = renderWithQuery(
    <ConfigNodeAddLink
      section='outbounds'
      takenTags={[]}
      subscriptionFallback={<a href='/config/providers'>Подписки</a>}
    />
  );

  try {
    const input = screen.getByLabelText('Вставить ссылку', { selector: 'input' });
    const link = 'trojan://test-password@edge.example:443#Imported';
    await user.click(input);
    await user.paste(`${link}\nss://other-link`);
    const stage = screen.getByRole('button', { name: 'Добавить в черновик' });
    await user.click(stage);
    expect(await screen.findByRole('alert')).toHaveTextContent('Вставьте одну ссылку на сервер или подписку.');
    expect(input).toHaveFocus();
    expect(ConfigDocumentStore.getState().draft).toBeNull();

    await user.clear(input);
    await user.paste(link);
    const name = screen.getByRole('textbox', { name: 'Имя сервера' });
    expect(name).toHaveValue('Imported');
    expect(container).toHaveTextContent('edge.example:443');
    expect(input).toHaveAttribute('type', 'password');
    expect(container).not.toHaveTextContent(/test-password|other-link/);

    await user.clear(name);
    await user.type(name, 'Confirmed');
    await user.click(stage);
    const separate = screen.getByRole('checkbox', { name: 'Добавить как отдельный сервер' });
    expect(separate).toHaveFocus();
    expect(input).toHaveValue(link);
    expect(name).toHaveValue('Confirmed');
    expect(ConfigDocumentStore.getState().draft).toBeNull();

    await user.click(separate);
    await user.click(stage);
    expect(readSectionNodes(ConfigDocumentStore.getState().draft ?? '', 'outbounds')).toEqual([
      server,
      {
        type: 'trojan',
        tag: 'Confirmed',
        server: 'edge.example',
        server_port: 443,
        password: 'test-password',
        tls: server.tls,
      },
    ]);
  } finally {
    unmount();
    state.reset();
  }
});
