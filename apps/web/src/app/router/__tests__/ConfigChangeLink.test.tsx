import { renderWithRouter } from '@test/renderWithRouter';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CONFIG_SECTION } from '@entities/Config';
import type { ConfigChangeLinkProps } from '@features/Config/ConfigApply';

import { ConfigChangeLink } from '../ConfigChangeLink';

const destinations: { target: ConfigChangeLinkProps['target']; href: string }[] = [
  { target: { rule: 2 }, href: '/config?rule=2' },
  { target: { section: CONFIG_SECTION.Route }, href: '/config' },
  { target: { section: CONFIG_SECTION.RuleSet }, href: '/config/rule-set' },
  { target: { section: CONFIG_SECTION.Outbounds, node: 2 }, href: '/config/outbounds?node=2' },
  { target: { section: CONFIG_SECTION.Ntp }, href: '/config/ntp' },
];

describe('apply summary destinations', () => {
  it.each(destinations)('links to $href', async ({ target, href }) => {
    renderWithRouter(function Summary() {
      return (
        <ConfigChangeLink target={target} onNavigate={() => undefined}>
          Edit
        </ConfigChangeLink>
      );
    });

    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', href);
  });

  it('shows an unmapped setting as text', async () => {
    renderWithRouter(function Summary() {
      return (
        <ConfigChangeLink target={{ section: null }} onNavigate={() => undefined}>
          Setting
        </ConfigChangeLink>
      );
    });

    expect(await screen.findByText('Setting')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
