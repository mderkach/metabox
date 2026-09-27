import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';

import { RuleSetCustomForm } from '../ui/RuleSetCustomForm';

const CONFIG_TEXT = '{\n  "route": { "rule_set": [] }\n}';

describe('свой список', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG_TEXT, null);
  });

  it('уходит в черновик узлом inline', async () => {
    const user = userEvent.setup();

    render(<RuleSetCustomForm takenTags={[]} />);

    await user.type(screen.getByLabelText('Имя списка'), 'my-list');
    await user.click(screen.getByLabelText('Домены и адреса'));
    await user.paste('example.com\n203.0.113.0/24');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).toContain('"type": "inline"');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(draft).toContain('"tag": "my-list"');
    expect(draft).toContain('"domain_suffix"');
    expect(draft).toContain('"ip_cidr"');
    expect(screen.getByRole('status')).toHaveTextContent('my-list');
  });

  it('называет непонятую строку и в черновик не пишет', async () => {
    const user = userEvent.setup();

    render(<RuleSetCustomForm takenTags={[]} />);

    await user.type(screen.getByLabelText('Имя списка'), 'my-list');
    await user.click(screen.getByLabelText('Домены и адреса'));
    await user.paste('so wrong');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('so wrong');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });
});
