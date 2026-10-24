import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { NODE_REGISTRY } from '@entities/Config';

import { ConfigNodeAddManual } from '../ui/ConfigNodeAddManual';

describe('ConfigNodeAddManual type select', () => {
  it('shows the placeholder in the interface font and the chosen type in monospace', async () => {
    render(
      <ConfigNodeAddManual section='outbounds' registry={NODE_REGISTRY.Outbound} takenTags={[]} builtTags={null} />
    );

    const trigger = screen.getByRole('combobox', { name: 'Тип' });

    expect(trigger).toHaveAttribute('data-placeholder');
    expect(getComputedStyle(trigger).fontFamily).toMatch(/^"Geist Variable"/);

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /^direct/ }));

    expect(trigger).not.toHaveAttribute('data-placeholder');
    expect(within(trigger).getByText('direct')).toBeVisible();
    expect(getComputedStyle(trigger).fontFamily).toMatch(/^"Fira Code Variable"/);
  });
});
