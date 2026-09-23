import { describe, expect, it } from 'vitest';

import { CONNECTION_COLUMNS, CONNECTION_COLUMNS_HIDDEN, toTableMinWidth } from '../ui/ConnectionColumns';

/**
 * Место под таблицу на экране 1440×900: минус развёрнутый сайдбар (14.5rem),
 * боковые поля экрана (3rem) и полоса вертикальной прокрутки там, где она не
 * накладывается поверх содержимого (1rem).
 */
const LAPTOP_TABLE_REM = 71.5;

describe('ширина таблицы соединений', () => {
  it('колонки по умолчанию укладываются в экран ноутбука без горизонтальной прокрутки', () => {
    const defaults = CONNECTION_COLUMNS.filter((def) => CONNECTION_COLUMNS_HIDDEN[def.id] !== false).map((def) => ({
      def,
    }));

    expect(Number.parseFloat(toTableMinWidth(defaults))).toBeLessThanOrEqual(LAPTOP_TABLE_REM);
  });
});
