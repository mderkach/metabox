import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../ConfirmDialog';
import { Button } from '../shadcn/button';

function renderDialog(onConfirm: () => void) {
  render(
    <ConfirmDialog
      trigger={<Button>Удалить правило</Button>}
      title='Удалить правило 1?'
      description='Вернуть его можно только сбросом черновика.'
      cancelLabel='Отмена'
      confirmLabel='Удалить'
      destructive
      onConfirm={onConfirm}
    />
  );
}

describe('ConfirmDialog', () => {
  it('runs the action only after confirmation and closes', async () => {
    const onConfirm = vi.fn<() => void>();
    const user = userEvent.setup();

    renderDialog(onConfirm);

    await user.click(screen.getByRole('button', { name: 'Удалить правило' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Удалить правило' }));

    expect(screen.getByRole('alertdialog', { name: 'Удалить правило 1?' })).toHaveTextContent(
      'Вернуть его можно только сбросом черновика.'
    );

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('without a trigger opens by the owner state', () => {
    render(
      <ConfirmDialog
        open
        title='Пустить устройство через sing-box?'
        description='sing-box перезапустится.'
        cancelLabel='Отмена'
        confirmLabel='Применить'
        onConfirm={vi.fn<() => void>()}
      />
    );

    expect(screen.getByRole('alertdialog', { name: 'Пустить устройство через sing-box?' })).toBeInTheDocument();
  });
});
