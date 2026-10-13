import { describe, expect, it } from 'vitest';

import { CONNECTION_COLUMNS, CONNECTION_COLUMNS_HIDDEN, toTableMinWidth } from '../ui/ConnectionColumns';

/**
 * Space for the table on a 1440×900 screen: minus the expanded sidebar (14.5rem),
 * the side margins of the screen (3rem) and the vertical scrollbar where it is not
 * overlaid on the content (1rem).
 */
const LAPTOP_TABLE_REM = 71.5;

describe('connection table width', () => {
  it('default columns fit a laptop screen without horizontal scrolling', () => {
    const defaults = CONNECTION_COLUMNS.filter((def) => CONNECTION_COLUMNS_HIDDEN[def.id] !== false).map((def) => ({
      def,
    }));

    expect(Number.parseFloat(toTableMinWidth(defaults))).toBeLessThanOrEqual(LAPTOP_TABLE_REM);
  });
});
