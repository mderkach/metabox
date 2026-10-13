import { useEffect, useRef } from 'react';
import uPlot from 'uplot';

import { cn } from '../lib/utils';

export type PlotOptions = Omit<uPlot.Options, 'width' | 'height'>;

export type PlotData = uPlot.AlignedData;

export type PlotInstance = uPlot;

/** Series color: a theme token and the fill opacity under the line. */
export interface PlotTone {
  token: string;
  fillAlpha: number;
}

/** Scale ranges set over the data on every update. */
export type PlotScales = Readonly<Partial<Record<string, { min: number; max: number }>>>;

const TICK_SIZE = 4;
const TICK_GAP = 2;
const GAPS_AROUND_VALUE = 2;

/** Height of the horizontal axis in font-size rows: a label row and a row under the tick with padding. */
const HORIZONTAL_AXIS_LINES = 2;

/** Even uPlot sides are top and bottom, odd are right and left. */
const SIDES_IN_ORIENTATION = 2;

/**
 * Vertical axis width by the longest label: labels are in different units,
 * and a width set by a number would either cut a long one or eat the space by "0".
 */
function fitAxis(font: string, fontSize: number): uPlot.Axis.Size {
  return function measureAxis(chart, values, axisIdx) {
    if ((chart.axes[axisIdx].side ?? 0) % SIDES_IN_ORIENTATION === 0) {
      return Math.ceil(fontSize * HORIZONTAL_AXIS_LINES);
    }

    chart.ctx.save();
    chart.ctx.font = font;
    // uPlot calls the axis size before the first label computation too — then `values` is null despite the type.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the uPlot type does not account for the first call
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
 * Theme token colors read from the container. A canvas does not understand
 * CSS variables, and the token value exists only in styles.
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
 * The axis font and size are taken from the container, not set in pixels: otherwise
 * labels would not grow with the browser font size setting. Colors are read
 * from the palette at draw time, so a palette change does not recreate the chart.
 */
function withHouseStyle(options: PlotOptions, element: HTMLElement, palette: () => Palette): PlotOptions {
  const style = getComputedStyle(element);
  // uPlot scales the font size to the screen density with a regex over whole pixels:
  // it parses a fractional size wrongly at a non-standard browser font size.
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
 * The uPlot canvas. Data is updated via `setData(data, false)` without
 * recreation and without a transition animation.
 *
 * `options`, `tones` and `onChart` recreate the whole chart and are held
 * by a stable reference; `data` and `scales` change freely. The ready chart
 * is passed to `onChart`, and `null` arrives there on destruction.
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
  /** Series colors in order, without the x axis. */
  tones: readonly PlotTone[];
  data: PlotData;
  scales?: PlotScales;
  /**
   * Accessible name of the chart figure: a screen reader does not read the canvas, so the name
   * is set explicitly and names what is visible on the chart to the eye.
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

      // Data is set by the update effect below: it runs in the same commit right after this one.
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

      // The next-themes class is set in its own effect, after the effects
      // of descendants: a theme-change effect from React would read the old colors.
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
