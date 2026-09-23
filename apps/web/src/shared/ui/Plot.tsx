import { useEffect, useRef } from 'react';
import uPlot from 'uplot';

import { cn } from '../lib/utils';
import { plotColor } from './plotColor';

export type PlotOptions = Omit<uPlot.Options, 'width' | 'height'>;

export type PlotData = uPlot.AlignedData;

export type PlotInstance = uPlot;

/** Диапазоны шкал, которые ставятся поверх данных при каждом обновлении. */
export type PlotScales = Readonly<Partial<Record<string, { min: number; max: number }>>>;

const TICK_SIZE = 4;
const TICK_GAP = 2;
const GAPS_AROUND_VALUE = 2;

/** Высота горизонтальной оси в строках кегля: строка подписи и строка под засечку с отступом. */
const HORIZONTAL_AXIS_LINES = 2;

/** Чётные стороны uPlot — верх и низ, нечётные — правая и левая. */
const SIDES_IN_ORIENTATION = 2;

/**
 * Ширина вертикальной оси по самой длинной подписи: подписи в разных единицах,
 * и заданная числом ширина либо резала бы длинную, либо съедала место у «0».
 */
function fitAxis(font: string, fontSize: number): uPlot.Axis.Size {
  return function measureAxis(chart, values, axisIdx) {
    if ((chart.axes[axisIdx].side ?? 0) % SIDES_IN_ORIENTATION === 0) {
      return Math.ceil(fontSize * HORIZONTAL_AXIS_LINES);
    }

    chart.ctx.save();
    chart.ctx.font = font;
    // uPlot зовёт размер оси и до первого расчёта подписей — тогда `values` равен null вопреки типу.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- тип uPlot не учитывает первый вызов
    const widest = Math.max(0, ...(values ?? []).map((value) => chart.ctx.measureText(value).width));
    chart.ctx.restore();

    return Math.ceil(widest + TICK_SIZE + TICK_GAP * GAPS_AROUND_VALUE);
  };
}

/**
 * Шрифт и кегль осей берутся у контейнера, а не задаются пикселями: иначе
 * подписи не росли бы с настройкой размера шрифта в браузере.
 */
function withHouseStyle(options: PlotOptions, element: HTMLElement): PlotOptions {
  const style = getComputedStyle(element);
  // uPlot масштабирует кегль под плотность экрана регуляркой по целым пикселям:
  // дробный кегль при нестандартном размере шрифта браузера она разбирает неверно.
  const fontSize = Math.round(Number.parseFloat(style.fontSize));
  const font = `${String(fontSize)}px ${style.fontFamily}`;

  return {
    ...options,
    legend: { show: false },
    cursor: { show: false },
    axes: options.axes?.map((axis) => ({
      font,
      size: fitAxis(font, fontSize),
      gap: TICK_GAP,
      stroke: plotColor('--muted-foreground'),
      grid: { show: false },
      ...axis,
      ticks: { size: TICK_SIZE, width: 1, stroke: plotColor('--border'), ...axis.ticks },
    })),
  };
}

function applyScales(instance: PlotInstance, scales: PlotScales | undefined) {
  for (const [key, range] of Object.entries(scales ?? {})) {
    if (range !== undefined) {
      instance.setScale(key, range);
    }
  }
}

/**
 * Канвас uPlot. Данные обновляются через `setData(data, false)` без
 * пересоздания и без анимации перехода.
 *
 * `options` и `onChart` пересоздают график целиком и держатся стабильной
 * ссылкой; `data` и `scales` меняются свободно. Готовый график отдаётся в
 * `onChart`, при уничтожении туда приходит `null`.
 */
export function Plot({
  options,
  data,
  scales,
  label,
  className,
  onChart,
}: {
  options: PlotOptions;
  data: PlotData;
  scales?: PlotScales;
  /** Доступное имя картинки: канвас скринридер не читает. */
  label: string;
  className?: string;
  onChart?: (chart: PlotInstance | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<PlotInstance | null>(null);

  useEffect(
    function createPlot() {
      const element = container.current;

      if (element === null) {
        return;
      }

      // Данные ставит эффект обновления ниже: он идёт в том же коммите сразу за этим.
      const empty: PlotData = [[], ...options.series.slice(1).map((): number[] => [])];
      const instance = new uPlot(
        { ...withHouseStyle(options, element), width: element.clientWidth, height: element.clientHeight },
        empty,
        element
      );

      chart.current = instance;
      onChart?.(instance);

      const resize = new ResizeObserver(function fitPlot() {
        instance.setSize({ width: element.clientWidth, height: element.clientHeight });
      });

      // Класс темы next-themes ставит в своём эффекте, уже после эффектов
      // потомков: перерисовка по смене темы из React взяла бы прежние цвета.
      const theme = new MutationObserver(function repaintForTheme() {
        instance.redraw(false);
      });

      resize.observe(element);
      theme.observe(document.documentElement, { attributeFilter: ['class'] });

      return function destroyPlot() {
        resize.disconnect();
        theme.disconnect();
        onChart?.(null);
        instance.destroy();
        chart.current = null;
      };
    },
    [options, onChart]
  );

  useEffect(
    function updatePlot() {
      const instance = chart.current;

      if (instance === null) {
        return;
      }

      instance.batch(function applyUpdate() {
        instance.setData(data, false);
        applyScales(instance, scales);
      });
    },
    [options, data, scales]
  );

  return <div ref={container} role='img' aria-label={label} className={cn('min-w-0 font-mono text-xs', className)} />;
}
