import { describe, expect, it } from 'vitest';

/** Прикладной код без тестов и оснастки: места, где панель что-то показывает. */
const SOURCES = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/__tests__/**', '!/src/test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Где панель показывает источник соединения и кто там ставит подпись
 * устройства. Поиск, фасет и параметр адреса, выгрузка берут подпись из
 * экрана соединений; форма правила — из своего помощника условия.
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

describe('места подписи устройства', () => {
  it.each(PLACES)('$place: подпись ставит deviceLabel', ({ file }) => {
    expect(SOURCES[file]).toMatch(LABEL_CALL);
  });

  it('новое место подписи видно в диффе снапшота', () => {
    expect(callers()).toMatchSnapshot();
  });
});
