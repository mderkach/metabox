import { describe, expect, it } from 'vitest';

/** Application code without tests and tooling: places where the panel shows something. */
const SOURCES = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/__tests__/**', '!/src/test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Where the panel shows the connection source and who sets the device label
 * there. Search, facet and the address parameter, export take the label from the
 * connections screen; the rule form takes it from its own condition helper.
 */
const PLACES: readonly { place: string; file: string }[] = [
  { place: 'ячейка и мобильная карточка', file: '/src/widgets/ConnectionTable/ui/ConnectionSourceCell.tsx' },
  { place: 'сортировка и фильтр колонки', file: '/src/widgets/ConnectionTable/ui/ConnectionTable.tsx' },
  { place: 'поиск, фасет, параметр адреса и выгрузка', file: '/src/pages/Connections/lib/Connections.lib.ts' },
  { place: 'сводка обзора', file: '/src/pages/Overview/ui/OverviewConnections.tsx' },
  { place: 'объяснение маршрута', file: '/src/widgets/RouteExplanation/ui/RouteExplanation.tsx' },
  { place: 'форма правила', file: '/src/features/Rule/RuleEdit/ui/RuleSourceDevices.tsx' },
];

const LABEL_CALL = /\bdeviceLabel\(/;

function callers(): string[] {
  return Object.entries(SOURCES)
    .filter(([path, text]) => LABEL_CALL.test(text) && !path.startsWith('/src/entities/Device/'))
    .map(([path]) => path)
    .sort();
}

describe('device label places', () => {
  it.each(PLACES)('$place: the label is set by deviceLabel', ({ file }) => {
    expect(SOURCES[file]).toMatch(LABEL_CALL);
  });

  it('a new label place is visible in the snapshot diff', () => {
    expect(callers()).toMatchSnapshot();
  });
});
