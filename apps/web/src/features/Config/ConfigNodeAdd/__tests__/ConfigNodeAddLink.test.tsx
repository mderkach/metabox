import { renderWithQuery } from '@test/renderWithQuery';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ConfigNodeAddLink } from '../ui/ConfigNodeAddLink';

describe('ConfigNodeAddLink', () => {
  it('tells a subscription address from a server link and points to the subscriptions section', async () => {
    renderWithQuery(<ConfigNodeAddLink section='outbounds' takenTags={[]} />);

    await userEvent.type(screen.getByRole('textbox'), 'https://provider.example/sub/token');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить по ссылке' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Это адрес подписки');
    expect(screen.getByRole('alert')).toHaveTextContent('«Подписки»');
  });
});
