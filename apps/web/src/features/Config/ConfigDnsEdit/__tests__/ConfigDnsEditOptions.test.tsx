import { renderWithQuery } from '@test/renderWithQuery';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { ConfigDnsEditOptions } from '../ui/ConfigDnsEditOptions';

const VERSION = '1.14.3-extended-2.7.3';
const TEXT =
  '{"dns":{"strategy":"prefer_ipv6","servers":[{"type":"hosts","tag":"local","predefined":{"printer.test":"192.0.2.8"}}]}}';

function Settings({ version }: { version: string | undefined }) {
  const [text, setText] = useState(TEXT);
  return (
    <ConfigDnsEditOptions
      text={text}
      version={version}
      stale={false}
      stage={(plan) => {
        if (!plan.ok) return plan.reason;
        setText(plan.text);
        return null;
      }}
    />
  );
}

it('shows imported options on an unverified core and disables edits', async () => {
  renderWithQuery(<Settings version={undefined} />);
  const user = userEvent.setup();
  await user.click(screen.getByText(/Дополнительно: IPv6/));
  const choice = await screen.findByLabelText('Семейство адресов DNS');
  expect(choice).toHaveTextContent('Предпочитать IPv6');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  await user.click(screen.getByText(/Статические записи ·/));
  expect(screen.getByRole('button', { name: 'Изменить printer.test' })).toBeDisabled();
  expect(screen.getByText('192.0.2.8')).toBeVisible();
});

it('validates, cancels and stages a record from its inline form with focus restored', async () => {
  renderWithQuery(<Settings version={VERSION} />);
  const user = userEvent.setup();
  await user.click(screen.getByText(/Дополнительно: IPv6/));
  await user.click(await screen.findByText(/Статические записи ·/));
  const add = screen.getByRole('button', { name: 'Добавить запись' });
  await user.click(add);
  expect(screen.getByLabelText('Домен')).toHaveFocus();
  await user.type(screen.getByLabelText('Домен'), 'PRINTER.test.');
  await user.type(screen.getByLabelText('IP-адреса'), '192.0.2.4, bad');
  const submit = screen.getByRole('button', { name: 'Добавить в черновик' });
  await user.click(submit);
  expect(await screen.findByRole('alert')).toHaveTextContent('корректных');
  await user.clear(screen.getByLabelText('IP-адреса'));
  await user.type(screen.getByLabelText('IP-адреса'), '192.0.2.4, 2001:db8::4');
  await user.click(submit);
  expect(await screen.findByRole('alert')).toHaveTextContent('уже есть');
  await user.keyboard('{Escape}');
  expect(add).toHaveFocus();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Изменить printer.test' }));
  const form = within(screen.getByRole('form'));
  await user.clear(form.getByLabelText('Домен'));
  await user.type(form.getByLabelText('Домен'), 'router.test');
  await user.click(form.getByRole('button', { name: 'Сохранить в черновик' }));
  await waitFor(() => expect(add).toHaveFocus());
  expect(screen.getByRole('button', { name: 'Изменить router.test' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Удалить router.test' }));
  expect(add).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Изменить router.test' })).not.toBeInTheDocument();
});
