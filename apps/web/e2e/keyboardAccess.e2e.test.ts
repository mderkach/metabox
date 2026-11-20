import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';
import {
  describeFocus,
  FOCUS_METER,
  type FocusStop,
  iconContrasts,
  missedTabStops,
  snapshotTabStops,
  untabbableControls,
} from './lib/focus.ts';

const SCREENS = [
  '/overview',
  '/config',
  '/config/rule-set',
  '/config/outbounds',
  '/proxies',
  '/connections',
  '/devices',
  '/logs',
  '/diagnostics',
  '/settings',
];
const PALETTES = [
  { name: 'dark theme', theme: 'dark', forcedColors: 'none' },
  { name: 'light theme', theme: 'light', forcedColors: 'none' },
  { name: 'forced colors mode', theme: 'light', forcedColors: 'active' },
] as const;
/** A Tab walk ends when focus comes back to its first stop; the bound only stops a walk that never does. */
const MAX_STOPS = 400;
/** Graphical cues, a focus ring and the icon of an icon-only control among them, need 3:1 against their background. */
const CUE_CONTRAST = 3;
const RATIO_DIGITS = 2;
for (const { name, theme, forcedColors } of PALETTES) {
  for (const screen of SCREENS) {
    test(
      `${screen} in the ${name} is walked with Tab and shows where the focus is`,
      { tag: E2E_TAG.Mock },
      async ({ page }) => {
        await page.addInitScript((value) => {
          localStorage.setItem('theme', value);
        }, theme);
        await page.addInitScript({ content: FOCUS_METER });
        await page.emulateMedia({ forcedColors });
        await page.goto(screen);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        // The walk is complete only against the filled screen: before its data the screen is the shell alone.
        await page.waitForLoadState('networkidle');
        // A transition would be read halfway: the focused and the plain look are compared at once.
        await page.addStyleTag({
          content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
        });

        const icons = await iconContrasts(page);
        const tabStops = await snapshotTabStops(page);
        const stops: FocusStop[] = [];
        let closed = false;

        for (let press = 0; press < MAX_STOPS && !closed; press++) {
          await page.keyboard.press('Tab');

          const stop = await describeFocus(page);

          if (!stop) {
            continue;
          }

          closed = stop.key === stops[0]?.key;

          if (!closed && !stops.some((passed) => passed.key === stop.key)) {
            stops.push(stop);
          }
        }

        expect(closed).toBe(true);
        expect(tabStops).toBeGreaterThan(0);
        expect(
          await missedTabStops(
            page,
            stops.map((stop) => stop.key)
          )
        ).toEqual([]);
        // A ring the meter cannot find would pass the contrast check below without measuring anything.
        expect(stops.filter((stop) => stop.ringContrast !== null).length).toBeGreaterThan(0);
        expect(await untabbableControls(page)).toEqual([]);
        expect(stops.filter((stop) => !stop.drawn).map((stop) => stop.name)).toEqual([]);
        if (forcedColors === 'active') {
          expect(stops.filter((stop) => !stop.outlined).map((stop) => stop.name)).toEqual([]);
        }
        expect(
          stops.flatMap((stop) =>
            stop.ringContrast !== null && stop.ringContrast < CUE_CONTRAST
              ? [`${stop.name}: ${stop.ringContrast.toFixed(RATIO_DIGITS)}:1`]
              : []
          )
        ).toEqual([]);
        expect(
          icons.flatMap((icon) =>
            icon.contrast < CUE_CONTRAST ? [`${icon.name}: ${icon.contrast.toFixed(RATIO_DIGITS)}:1`] : []
          )
        ).toEqual([]);
      }
    );
  }
}

test(
  'the text config editor shows an outline in forced colors and releases Tab after Escape',
  { tag: E2E_TAG.Mock },
  async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/config/raw');

    const editor = page.getByRole('textbox', {
      name: translate('widgets/Config/ConfigRawEditor', 'editor.label'),
    });

    await editor.focus();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveCSS('outline-style', 'solid');
    await expect(editor).toHaveCSS('outline-width', '2px');

    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');

    await expect(editor).not.toBeFocused();
  }
);
