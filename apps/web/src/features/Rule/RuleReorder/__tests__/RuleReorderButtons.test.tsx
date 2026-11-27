import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { selectConfigCurrent, selectConfigDirty, ConfigDocumentStore } from '@entities/Config';

import { RuleReorderButtons } from '../ui/RuleReorderButtons';

vi.mock('sonner', () => ({ toast: { error: vi.fn<(text: string) => void>() } }));

describe('RuleReorderButtons', () => {
  beforeEach(() => {
    ConfigDocumentStore.getState().reset();
    vi.clearAllMocks();
  });

  it('reports an unsafe comment layout and keeps the draft and selected rule unchanged', async () => {
    const text =
      '{"route":{"rules":[\n {"action":"sniff"}, {"action":"hijack-dns"}, // two\n {"outbound":"direct"}\n]}}';
    const onMoved = vi.fn<(index: number) => void>();
    const user = userEvent.setup();

    ConfigDocumentStore.getState().load(text);
    render(<RuleReorderButtons text={text} index={2} total={3} onMoved={onMoved} />);
    await user.click(screen.getByRole('button', { name: 'Поднять правило 2 выше' }));

    expect(toast.error).toHaveBeenCalledWith(
      'Переместить правило без изменения комментариев не удалось. Конфиг оставлен без изменений.'
    );
    expect(onMoved).not.toHaveBeenCalled();
    expect(selectConfigCurrent(ConfigDocumentStore.getState())).toBe(text);
    expect(ConfigDocumentStore.getState().draft).toBeNull();
    expect(screen.getByRole('button', { name: 'Поднять правило 2 выше' })).toHaveFocus();
  });

  it('moves a safely laid out rule and updates the selection without an error', async () => {
    const onMoved = vi.fn<(index: number) => void>();
    const user = userEvent.setup();

    const text = '{"route":{"rules":[{"action":"sniff"},{"action":"hijack-dns"}]}}';
    ConfigDocumentStore.getState().load(text);
    render(<RuleReorderButtons text={text} index={2} total={2} onMoved={onMoved} />);
    await user.click(screen.getByRole('button', { name: 'Поднять правило 2 выше' }));

    expect(onMoved).toHaveBeenCalledWith(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(selectConfigDirty(ConfigDocumentStore.getState())).toBe(true);
  });

  it('keeps a more recent draft when a button still points at the previous rule order', async () => {
    const text = '{"route":{"rules":[{"action":"sniff"},{"action":"hijack-dns"}]}}';
    const onMoved = vi.fn<(index: number) => void>();
    const user = userEvent.setup();
    ConfigDocumentStore.getState().load(text);
    render(<RuleReorderButtons text={text} index={2} total={2} onMoved={onMoved} />);
    ConfigDocumentStore.getState().move(['route', 'rules'], 1, 0);
    const current = selectConfigCurrent(ConfigDocumentStore.getState());

    await user.click(screen.getByRole('button', { name: 'Поднять правило 2 выше' }));

    expect(onMoved).not.toHaveBeenCalled();
    expect(selectConfigCurrent(ConfigDocumentStore.getState())).toBe(current);
  });
});
