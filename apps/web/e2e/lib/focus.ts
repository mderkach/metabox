import type { Page } from '@playwright/test';

/** What one Tab press focused. */
export interface FocusStop {
  /** The element's place in the document: a walk ends when it comes back to one it has passed. */
  id: number;
  name: string;
  /** The focused element looks different from the same element without focus. */
  drawn: boolean;
  /** Contrast of the ring against the background around the element; null when there is no ring to measure. */
  ringContrast: number | null;
}

export interface IconContrast {
  name: string;
  contrast: number;
}

/**
 * The measures that run in the page, for `page.addInitScript({ content })`; the functions below call them. The
 * scenarios are typed without the DOM library, so the code that runs in the page is a string.
 */
export const FOCUS_METER = String.raw`
(() => {
  /** WCAG 2.2 relative luminance of sRGB. */
  const SRGB = { Max: 255, Knee: 0.040_45, Slope: 12.92, Offset: 0.055, Scale: 1.055, Gamma: 2.4, Flare: 0.05 };
  const LUMA = [0.2126, 0.7152, 0.0722];
  /** The fourth length of a box-shadow layer is its spread: a ring is drawn by the spread. */
  const SPREAD_INDEX = 3;
  const NAME_LENGTH = 60;
  const LOOK = ['outlineStyle', 'outlineColor', 'outlineWidth', 'boxShadow', 'borderColor', 'backgroundColor'];
  const CONTROLS =
    'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="switch"]';
  const COLOR = /[a-z]+\([^)]*\)/;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  /** Any CSS color as sRGB channels and alpha 0..1, read back from a canvas pixel, so oklch and oklab need no parser. */
  const rgba = (color) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000';
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;

    return [r, g, b, a / SRGB.Max];
  };

  const over = (top, bottom) => bottom.map((channel, index) => top[index] * top[3] + channel * (1 - top[3]));

  /** The fills of the element and its ancestors composed from the page up; null over an image or a gradient. */
  const backdrop = (from) => {
    const layers = [];

    for (let node = from; node; node = node.parentElement) {
      const style = getComputedStyle(node);

      if (style.backgroundImage !== 'none') {
        return null;
      }

      const fill = rgba(style.backgroundColor);

      if (fill[3] > 0) {
        layers.push(fill);
      }

      if (fill[3] === 1) {
        break;
      }
    }

    return layers.reduceRight((below, layer) => over(layer, below), [SRGB.Max, SRGB.Max, SRGB.Max]);
  };

  const luminance = (color) =>
    color.reduce((sum, value, index) => {
      const c = value / SRGB.Max;
      const linear = c <= SRGB.Knee ? c / SRGB.Slope : ((c + SRGB.Offset) / SRGB.Scale) ** SRGB.Gamma;

      return sum + linear * LUMA[index];
    }, 0);

  /** Contrast of a mark of color at opacity over the background behind the element; null when it cannot be read. */
  const contrast = (color, element, opacity = 1) => {
    const behind = backdrop(element);

    if (!behind) {
      return null;
    }

    const [r, g, b, a] = rgba(color);
    const [light, dark] = [luminance(over([r, g, b, a * opacity], behind)), luminance(behind)].toSorted(
      (x, y) => y - x
    );

    return (light + SRGB.Flare) / (dark + SRGB.Flare);
  };

  const name = (element) =>
    element.tagName.toLowerCase() + ' "' + (element.getAttribute('aria-label') ?? element.textContent.trim().slice(0, NAME_LENGTH)) + '"';

  /** The ring of a focused element: a box-shadow layer with a spread and a visible color; Tailwind keeps empty layers. */
  const ringColor = (style) =>
    style.boxShadow
      .split(/,(?![^(]*\))/)
      .map((layer) => ({
        color: COLOR.exec(layer)?.[0],
        spread: Number.parseFloat(layer.replace(COLOR, '').trim().split(/\s+/)[SPREAD_INDEX] ?? '0'),
      }))
      .find((layer) => layer.color && layer.spread > 0 && rgba(layer.color)[3] > 0)?.color;

  window.focusMeter = {
    /** The element in focus: whether it looks different from itself blurred, and the contrast of its ring. */
    describeFocus() {
      const element = document.activeElement;

      if (!(element instanceof HTMLElement) || element === document.body) {
        return null;
      }

      const focused = getComputedStyle(element);
      const look = LOOK.map((key) => focused[key]);
      const outlined = focused.outlineStyle !== 'none' && Number.parseFloat(focused.outlineWidth) > 0;
      const mark = outlined ? focused.outlineColor : ringColor(focused);
      const ringContrast = mark ? contrast(mark, element.parentElement) : null;
      const index = [...document.querySelectorAll('*')].indexOf(element);

      element.blur();
      const plain = getComputedStyle(element);
      const drawn = LOOK.some((key, position) => plain[key] !== look[position]);
      element.focus({ focusVisible: true });

      return { id: index, name: name(element), drawn, ringContrast };
    },

    /** Controls a user can operate that Tab cannot reach: not tabbable and not in a roving group. */
    untabbableControls() {
      return [...document.querySelectorAll(CONTROLS)]
        .filter(
          (control) =>
            control.tabIndex < 0 &&
            !control.matches(':disabled, [aria-hidden="true"], [aria-hidden="true"] *, [inert] *') &&
            control.checkVisibility()
        )
        .filter((control) => {
          // A roving group keeps one member tabbable and moves focus between the rest with the arrow keys.
          const siblings = control.parentElement?.parentElement?.querySelectorAll(control.tagName) ?? [];

          return ![...siblings].some((sibling) => sibling.tabIndex >= 0);
        })
        .map(name);
    },

    /** The icon contrast of every visible control with an icon and no text: there the icon alone says what it does. */
    iconContrasts() {
      return [...document.querySelectorAll('button, a[href]')]
        .filter((control) => control.checkVisibility() && !control.textContent.trim() && control.querySelector('svg'))
        .flatMap((control) => {
          const style = getComputedStyle(control.querySelector('svg'));
          const value = contrast(style.color, control, Number.parseFloat(style.opacity));

          return value === null ? [] : [{ name: name(control), contrast: value }];
        });
    },
  };
})();
`;

export async function describeFocus(page: Page) {
  return page.evaluate<FocusStop | null>('window.focusMeter.describeFocus()');
}

export async function untabbableControls(page: Page) {
  return page.evaluate<string[]>('window.focusMeter.untabbableControls()');
}

export async function iconContrasts(page: Page) {
  return page.evaluate<IconContrast[]>('window.focusMeter.iconContrasts()');
}
