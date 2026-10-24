import { selectOption } from '@test/selectOption';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { NODE_REGISTRY } from '@entities/Config';

import { ConfigNodeAddManual } from '../ui/ConfigNodeAddManual';

describe('ConfigNodeAddManual type select', () => {
  it('shows the placeholder in the interface font and the chosen type in monospace', async () => {
    const user = userEvent.setup();

    render(
      <ConfigNodeAddManual section='outbounds' registry={NODE_REGISTRY.Outbound} takenTags={[]} builtTags={null} />
    );

    const trigger = screen.getByRole('combobox', { name: 'Тип' });

    expect(trigger).toHaveAttribute('data-placeholder');
    expect(trigger).toHaveClass('font-mono', 'data-placeholder:font-sans');

    await selectOption(user, trigger, 'directНапрямую, без прокси');

    expect(trigger).not.toHaveAttribute('data-placeholder');
    expect(trigger).toHaveTextContent('direct');
  });
});
