import type { MainThreadCost } from './fixtures/connectionLoad.ts';
import { E2E_TAG, expect, test } from './fixtures/index.ts';

/** A busy router: 5000 live connections matched by 500 different rules. */
const LOAD = { connections: 5000, rules: 500, frames: 40 } as const;
/** `CLOSED_LIMIT` of the connection model: the hidden tab holds this many rows on a busy router. */
const CLOSED_LIMIT = '200';
const TICKS = 5;
/**
 * The stand serializes every frame before the panel starts, and churn moves about 40 rows a frame
 * to closed, so the first snapshot and a full closed tab take several seconds on a busy runner.
 */
const STAND_READY_MS = 15_000;
/** The scenario waits about twenty ticks of a second, besides loading the stand. */
const SCENARIO_MS = 60_000;
/** Indent of the printed costs. */
const JSON_INDENT = 2;
/** `METABOX_E2E_CPU_RATE=4` slows the page down as a weak laptop or a phone would. */
const CPU_RATE = Number(process.env.METABOX_E2E_CPU_RATE ?? 1);

test(
  'the connections screen reports its longest main-thread task under 5000 connections',
  { tag: E2E_TAG.Mock },
  async ({ page, connectionLoad, connectionsPage }) => {
    test.setTimeout(SCENARIO_MS);
    await connectionLoad.install(LOAD);

    const cdp = await page.context().newCDPSession(page);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
    await connectionsPage.goto();
    await expect(connectionsPage.activeTab).toContainText(String(LOAD.connections), { timeout: STAND_READY_MS });
    await expect(connectionsPage.closedTab).toContainText(CLOSED_LIMIT, { timeout: STAND_READY_MS });

    const costs: Record<string, MainThreadCost> = {};

    await test.step('snapshot ticks', async () => {
      costs.ticks = await connectionLoad.measure(async () => {}, TICKS);
    });

    await test.step('sort by a number and by text', async () => {
      costs.sortVolume = await connectionLoad.measure(async () => {
        await connectionsPage.sortButton('column.volume').click();
      });
      costs.sortHost = await connectionLoad.measure(async () => {
        await connectionsPage.sortButton('column.host').click();
      });
    });

    await test.step('filter by typing', async () => {
      costs.filter = await connectionLoad.measure(async () => {
        await connectionsPage.search.pressSequentially('video');
      });
    });

    await test.step('switch the tabs', async () => {
      costs.tabs = await connectionLoad.measure(async () => {
        await connectionsPage.closedTab.click();
        await connectionsPage.activeTab.click();
      });
    });

    // The stand runs the development build of React, so the numbers are recorded, not compared
    // with a threshold: production renders the same steps several times faster.
    console.log(`[MAIN THREAD] cpu x${String(CPU_RATE)} ${JSON.stringify(costs, null, JSON_INDENT)}`);
  }
);
