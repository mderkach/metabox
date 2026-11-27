import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SimpleRoutesProxyAccess } from '../ui/SimpleRoutesProxyAccess';

describe('SimpleRoutesProxyAccess', () => {
  it('discloses saved listeners without exposing credentials or implying client access', async () => {
    const user = userEvent.setup();
    render(
      <SimpleRoutesProxyAccess
        config={{
          inbounds: [
            {
              type: 'mixed',
              listen: '192.0.2.1',
              listen_port: 7890,
              bind_interface: 'br-example',
              users: [{ Username: 'private-user', Password: 'private-password' }],
            },
            { type: 'http', listen: '::', listen_port: 7891 },
            { type: 'socks', listen_port: 1080 },
            { type: 'http', listen: '::1', listen_port: 9090 },
            { type: 'tun', tag: 'advanced' },
          ],
        }}
      />
    );
    const details = screen.getByText('Адрес и доступ');
    await user.tab();
    expect(details).toHaveFocus();
    await user.click(details);
    const section = within(screen.getByRole('region', { name: 'Прокси-сервер на роутере' }));
    expect(section.getByText('HTTP / SOCKS')).toBeVisible();
    expect(section.getByText('192.0.2.1:7890')).toBeVisible();
    expect(section.getByText('[::]:7891')).toBeVisible();
    expect(section.getByText(/Указан общий адрес привязки/u)).toBeVisible();
    expect(section.getByText('br-example')).toBeVisible();
    expect(section.getByText(/доступен только на самом роутере/u)).toBeVisible();
    expect(section.getByText(/Определить IP-адрес и порт/u)).toBeVisible();
    expect(section.getByText(/настроены учётные записи/u)).toBeVisible();
    expect(section.getByText(/Панель не проверяет/u)).toBeVisible();
    expect(section.getByText('tun')).toBeVisible();
    expect(section.queryByText(/private-user|private-password/u)).not.toBeInTheDocument();
    expect(section.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(details);
    expect(details).toHaveFocus();
    expect(section.getByText('192.0.2.1:7890')).not.toBeVisible();
  });

  it('distinguishes an absent proxy entry from an unavailable saved file', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SimpleRoutesProxyAccess config={null} />);
    await user.click(screen.getByText('Адрес и доступ'));
    expect(screen.getByText(/Не удалось прочитать/u)).toBeVisible();

    rerender(<SimpleRoutesProxyAccess config={{ inbounds: [{ type: 'failover', inbounds: [{ type: 'socks' }] }] }} />);
    expect(screen.getByText(/В основном списке входов/u)).toBeVisible();
    expect(screen.getByText(/failover/u)).toBeVisible();
    expect(screen.queryByText(/Не удалось прочитать/u)).not.toBeInTheDocument();
  });
});
