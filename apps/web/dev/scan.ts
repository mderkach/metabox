import { scan } from 'react-scan';

/**
 * Съём ререндеров react-scan. В `index.html` файл добавляет плагин
 * `metabox-scan` и только на дев-сервере, поэтому в `src` ссылок на этот
 * каталог нет и в сборку он попасть не может по построению — тем же способом
 * живут моки в `mocks/`. Отдельным скриптом, а не подменой входа: так съём
 * сочетается с моками, которые вход уже подменяют.
 */
interface ComponentStat {
  name: string;
  renders: number;
  ms: number;
  unnecessary: number;
}

const stats = new Map<string, ComponentStat>();

scan({
  enabled: true,
  showToolbar: true,
  trackUnnecessaryRenders: true,
  // Счётчики копятся здесь, а не берутся из `getReport`: в 0.5.7 его хранилище
  // осталось от старого API и никем не заполняется.
  onRender: (_fiber, renders) => {
    for (const render of renders) {
      const name = render.componentName ?? 'Anonymous';
      const stat = stats.get(name) ?? { name, renders: 0, ms: 0, unnecessary: 0 };

      stat.renders += render.count;
      stat.ms += render.time ?? 0;

      if (render.unnecessary === true) {
        stat.unnecessary += render.count;
      }

      stats.set(name, stat);
    }
  },
});

/**
 * Сводка для снятия из консоли: оверлей рисует вспышки в десятки миллисекунд,
 * глазами и скриншотом их не поймать, а счётчики накапливаются.
 */
function summary(limit = 20): ComponentStat[] {
  return [...stats.values()]
    .map((stat) => ({ ...stat, ms: Number(stat.ms.toFixed(1)) }))
    .sort((first, second) => second.renders - first.renders)
    .slice(0, limit);
}

function reset() {
  stats.clear();
}

Object.assign(window, { __metaboxScan: { summary, reset } });
