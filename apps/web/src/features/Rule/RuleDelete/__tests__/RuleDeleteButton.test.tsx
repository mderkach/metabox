import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentStore } from '@entities/Config';

import { RuleDeleteButton } from '../ui/RuleDeleteButton';

vi.mock('sonner', () => ({ toast: { error: vi.fn<(text: string) => void>() } }));

describe('RuleDeleteButton', () => {
  beforeEach(() => {
    ConfigDocumentStore.getState().reset();
    vi.clearAllMocks();
  });

  it('reports a refused deletion without discarding the selected rule or config text', async () => {
    const text = '{"route":{"rules":[{"action":"sniff"},{"action":"hijack-dns"}]},"broken":}';
    const onDeleted = vi.fn<() => void>();
    const user = userEvent.setup();

    ConfigDocumentStore.getState().load(text);
    render(<RuleDeleteButton index={2} onDeleted={onDeleted} />);
    await user.click(screen.getByRole('button', { name: 'Удалить правило 2' }));
    const dialog = await screen.findByRole('alertdialog');

    await user.click(within(dialog).getByRole('button', { name: /^Удалить$/ }));

    expect(toast.error).toHaveBeenCalledWith(
      'Безопасно изменить конфиг не удалось. Проверьте синтаксис в текстовом режиме; черновик оставлен без изменений.'
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(ConfigDocumentStore.getState().current()).toBe(text);
    expect(ConfigDocumentStore.getState().draft).toBeNull();
  });
});
