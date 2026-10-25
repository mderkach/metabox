import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';

import { RuleSetCustomForm } from '../ui/RuleSetCustomForm';

vi.mock('sonner', () => ({ toast: { error: vi.fn<(text: string) => void>() } }));

const CONFIG_TEXT = '{\n  "route": { "rule_set": [] }\n}';

describe('custom list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG_TEXT, null);
  });

  it('goes into the draft as an inline node', async () => {
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

  it('as a file: the local node and the file go into the draft together', async () => {
    const user = userEvent.setup();

    render(<RuleSetCustomForm takenTags={[]} />);

    await user.type(screen.getByLabelText('Имя списка'), 'big-list');
    await user.click(screen.getByRole('button', { name: 'Файлом' }));
    await user.click(screen.getByLabelText('Домены и адреса'));
    await user.paste('example.com');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(ConfigDocumentState.getState().listsDraft['big-list.json']).toContain('"version": 1');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(draft).toContain('"type": "local"');
    expect(draft).toContain('"path": "rule-sets/big-list.json"');
  });

  it('keeps the form and list files unchanged when the config insert is refused', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn<() => void>();
    const text = '{"route":{"rule_set":[]},"broken":}';

    ConfigDocumentState.getState().load(text);
    render(<RuleSetCustomForm takenTags={[]} onDone={onDone} />);
    await user.type(screen.getByLabelText('Имя списка'), 'big-list');
    await user.click(screen.getByRole('button', { name: 'Файлом' }));
    await user.click(screen.getByLabelText('Домены и адреса'));
    await user.paste('example.com');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Безопасно изменить конфиг не удалось. Проверьте синтаксис в текстовом режиме; черновик оставлен без изменений.'
      );
    });
    expect(ConfigDocumentState.getState().current()).toBe(text);
    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(ConfigDocumentState.getState().listsDraft).toEqual({});
    expect(screen.getByLabelText('Имя списка')).toHaveValue('big-list');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('names the unrecognized line and does not write the draft', async () => {
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
