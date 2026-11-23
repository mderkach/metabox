import { renderWithQuery } from '@test/renderWithQuery';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentStore } from '@entities/Config';
import { Dialog } from '@shared/ui';

import { SimpleRoutesCustomDialog } from '../ui/SimpleRoutesCustomDialog';

const TEXT = JSON.stringify({
  outbounds: [{ type: 'direct', tag: 'home' }],
  route: { rules: [{ domain_suffix: 'example.org', outbound: 'home' }] },
});

describe('SimpleRoutesCustomDialog', () => {
  afterEach(() => {
    ConfigDocumentStore.getState().reset();
  });

  it('previews the actual position and refuses to overwrite a changed shared draft', async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn<() => void>();
    ConfigDocumentStore.getState().load(TEXT);
    renderWithQuery(
      <Dialog open>
        <SimpleRoutesCustomDialog text={TEXT} changed={false} onAdded={onAdded} />
      </Dialog>
    );
    await user.type(screen.getByRole('textbox', { name: 'Домен или IP-адрес' }), 'video.example.org');
    expect(screen.getByRole('status')).toHaveTextContent('Новое правило 1 · Все устройства → home');
    expect(screen.getByRole('status')).toHaveTextContent('Общее правило 1 переместится на позицию 2');
    ConfigDocumentStore.getState().edit(['log', 'level'], 'warn');
    const concurrent = ConfigDocumentStore.getState().draft;

    await user.click(screen.getByRole('button', { name: 'Добавить в черновик' }));

    expect(screen.getByRole('status')).toHaveTextContent('Черновик или конфигурация на устройстве изменились');
    expect(ConfigDocumentStore.getState().draft).toBe(concurrent);
    expect(onAdded).not.toHaveBeenCalled();
  });
});
