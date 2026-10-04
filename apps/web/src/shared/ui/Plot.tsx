import { useEffect, useRef } from 'react';
import uPlot from 'uplot';

import { cn } from '../lib/utils';

export type PlotOptions = Omit<uPlot.Options, 'width' | 'height'>;

export type PlotData = uPlot.AlignedData;

export type PlotInstance = uPlot;

/** Цвет ряда: токен темы и прозрачность заливки под линией. */
export interface PlotTone {
  token: string;
  fillAlpha: number;
}

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

interface Palette {
  axis: string;
  border: string;
  series: { stroke: string; fill: string }[];
}

function withAlpha(color: string, alpha: number): string {
  return color.includes('/') ? color : color.replace(/\)$/, ` / ${String(alpha)})`);
}

/**
 * Цвета токенов темы, прочитанные у контейнера. Канвас CSS-переменных не
 * понимает, и значение токена существует только в стилях.
 */
function readPalette(element: HTMLElement, tones: readonly PlotTone[]): Palette {
  const style = getComputedStyle(element);
  const read = (token: string) => style.getPropertyValue(token).trim();

  return {
    axis: read('--muted-foreground'),
    border: read('--border'),
    series: tones.map((tone) => ({ stroke: read(tone.token), fill: withAlpha(read(tone.token), tone.fillAlpha) })),
  };
}

/**
 * Шрифт и кегль осей берутся у контейнера, а не задаются пикселями: иначе
 * подписи не росли бы с настройкой размера шрифта в браузере. Цвета читаются
 * из палитры при отрисовке, поэтому смена палитры не пересоздаёт график.
 */
function withHouseStyle(options: PlotOptions, element: HTMLElement, palette: () => Palette): PlotOptions {
  const style = getComputedStyle(element);
  // uPlot масштабирует кегль под плотность экрана регуляркой по целым пикселям:
  // дробный кегль при нестандартном размере шрифта браузера она разбирает неверно.
  const fontSize = Math.round(Number.parseFloat(style.fontSize));
  const font = `${String(fontSize)}px ${style.fontFamily}`;

  return {
    ...options,
    legend: { show: false },
    cursor: { show: false },
    series: options.series.map((series, index) =>
      index === 0
        ? series
        : {
            ...series,
            stroke: () => palette().series[index - 1].stroke,
            fill: () => palette().series[index - 1].fill,
          }
    ),
    axes: options.axes?.map((axis) => ({
      font,
      size: fitAxis(font, fontSize),
      gap: TICK_GAP,
      stroke: () => palette().axis,
      ...axis,
      grid: { show: false, width: 1, stroke: () => palette().border, ...axis.grid },
      ticks: { size: TICK_SIZE, width: 1, stroke: () => palette().border, ...axis.ticks },
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
 * `options`, `tones` и `onChart` пересоздают график целиком и держатся
 * стабильной ссылкой; `data` и `scales` меняются свободно. Готовый график
 * отдаётся в `onChart`, при уничтожении туда приходит `null`.
 */
export function Plot({
  options,
  tones,
  data,
  scales,
  label,
  className,
  onChart,
}: {
  options: PlotOptions;
  /** Цвета рядов по порядку, без оси x. */
  tones: readonly PlotTone[];
  data: PlotData;
  scales?: PlotScales;
  /**
   * Доступное имя фигуры графика: канвас скринридер не читает, поэтому имя
   * задаётся явно и называет то, что на графике видно глазами.
   */
  label: string;
  className?: string;
  onChart?: (chart: PlotInstance | null) => void;
}) {
  const container = useRef<HTMLElement>(null);
  const chart = useRef<PlotInstance | null>(null);

  useEffect(
    function createPlot() {
      const element = container.current;

      if (element === null) {
        return;
      }

      // Данные ставит эффект обновления ниже: он идёт в том же коммите сразу за этим.
      const empty: PlotData = [[], ...options.series.slice(1).map((): number[] => [])];
      let palette = readPalette(element, tones);
      const instance = new uPlot(
        {
          ...withHouseStyle(options, element, () => palette),
          width: element.clientWidth,
          height: element.clientHeight,
        },
        empty,
        element
      );

      chart.current = instance;
      onChart?.(instance);

      const resize = new ResizeObserver(function fitPlot() {
        instance.setSize({ width: element.clientWidth, height: element.clientHeight });
      });

      // Класс темы next-themes ставит в своём эффекте, уже после эффектов
      // потомков: эффект по смене темы из React прочитал бы прежние цвета.
      const theme = new MutationObserver(function repaintForTheme() {
        palette = readPalette(element, tones);
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
    [options, tones, onChart]
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

  return <figure ref={container} aria-label={label} className={cn('min-w-0 font-mono text-xs', className)} />;
}
