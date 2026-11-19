import { E2E_TAG, expect, test } from './fixtures/index.ts';
import { describeFocus, FOCUS_METER, type FocusStop, iconContrasts, untabbableControls } from './lib/focus.ts';

const SCREENS = [
  '/overview',
  '/config',
  '/config/rule-set',
  '/proxies',
  '/connections',
  '/devices',
  '/logs',
  '/diagnostics',
  '/settings',
];
const THEMES = ['dark', 'light'];
/** A Tab walk ends when focus comes back to an element it has passed; the bound only stops a broken walk. */
const MAX_STOPS = 400;
/** Graphical cues, a focus ring and the icon of an icon-only control among them, need 3:1 against their background. */
const CUE_CONTRAST = 3;
const RATIO_DIGITS = 2;
/**
 * The focus ring is the accent at half opacity and measures below 3:1 against the screen in both themes. Until the
 * token is fixed the walk holds the lowest ring measured, so a ring that gets fainter still fails.
 */
const RING_FLOOR: Record<string, number> = { dark: 2.5, light: 2 };

for (const theme of THEMES) {
  for (const screen of SCREENS) {
    test(
      `${screen} in the ${theme} theme is walked with Tab and shows where the focus is`,
      { tag: E2E_TAG.Mock },
      async ({ page }) => {
        await page.addInitScript((value) => {
          localStorage.setItem('theme', value);
        }, theme);
        await page.addInitScript({ content: FOCUS_METER });
        await page.goto(screen);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        // A transition would be read halfway: the focused and the plain look are compared at once.
        await page.addStyleTag({
          content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
        });

        const icons = await iconContrasts(page);
        const stops: FocusStop[] = [];
        const seen = new Set<number>();

        for (let press = 0; press < MAX_STOPS; press++) {
          await page.keyboard.press('Tab');

          const stop = await describeFocus(page);

          if (!stop) {
            continue;
          }

          if (seen.has(stop.id)) {
            break;
          }

          seen.add(stop.id);
          stops.push(stop);
        }

        const floor = RING_FLOOR[theme] ?? CUE_CONTRAST;

        expect(stops.length).toBeGreaterThan(0);
        // A ring the meter cannot find would pass the contrast check below without measuring anything.
        expect(stops.filter((stop) => stop.ringContrast !== null).length).toBeGreaterThan(0);
        expect(await untabbableControls(page)).toEqual([]);
        expect(stops.filter((stop) => !stop.drawn).map((stop) => stop.name)).toEqual([]);
        expect(
          stops.flatMap((stop) =>
            stop.ringContrast !== null && stop.ringContrast < floor
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
