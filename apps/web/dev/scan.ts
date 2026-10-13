import { scan } from 'react-scan';

/**
 * Captures re-renders with react-scan. The file adds the `metabox-scan` plugin
 * to `index.html` on the dev server only, so `src` has no references to this
 * directory and it cannot end up in the build by construction, the same way the
 * mocks in `mocks/` work. It is a separate script, not a replaced entry point,
 * so capture works together with the mocks, which already replace the entry
 * point.
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
  // Counters accumulate here instead of coming from `getReport`: in 0.5.7 its
  // storage is left over from the old API and nothing fills it.
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
 * Summary for reading from the console: the overlay draws flashes lasting tens
 * of milliseconds that the eye and screenshots cannot catch, while the counters
 * accumulate.
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
