import { test as base, expect, type Page } from '@playwright/test';

/** The record the mock entry keeps in the page (`mocks/connectionLoad.ts`); the e2e types have no DOM. */
interface LongTaskRecord {
  startTime: number;
  duration: number;
  scripts: string[];
}

interface ConnectionLoadRecord {
  connections: number;
  rules: number;
  frames: number;
  sent: number;
  longTasks: LongTaskRecord[];
  longFrames: LongTaskRecord[];
  flush: () => void;
}

interface LoadGlobal {
  __METABOX_CONNECTION_LOAD__: ConnectionLoadRecord;
}

/** What one step of a scenario cost the main thread. */
export interface MainThreadCost {
  /** The longest task in ms; 0 when none reached the 50 ms the browser reports from. */
  longest: number;
  /** Stream frames sent while the step ran: a step without them did not overlap a tick. */
  frames: number;
  /** Scripts of the longest animation frame of the step, for finding the place of a block. */
  scripts: string[];
}

interface StepStart {
  from: number;
  sent: number;
}

/** The stand stream sends a frame a second, as the daemon does. */
const FRAME_MS = 1000;
/** Frames a step may wait beyond its own before failing: a slow runner delays the timer. */
const FRAME_SLACK = 3;
/** A step waits for this many frames after its action. */
const FRAMES_PER_STEP = 2;

/**
 * The connection load of the mock stand: the runtime stream sends snapshots of `connections`
 * rows serialized before the page started, and the page records main-thread tasks over 50 ms.
 */
export class ConnectionLoad {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Called before the first navigation: the mock entry reads the load when the page starts. */
  async install(options: { connections: number; rules: number; frames: number }) {
    await this.page.addInitScript((load) => {
      Object.assign(globalThis, {
        __METABOX_CONNECTION_LOAD__: { ...load, sent: 0, longTasks: [], longFrames: [], flush: () => {} },
      });
    }, options);
  }

  /** Runs `act`, then lets the stream send `frames` more snapshots and returns the step cost. */
  async measure(act: () => Promise<void>, frames = FRAMES_PER_STEP): Promise<MainThreadCost> {
    const start = await this.page.evaluate<StepStart>(() => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `install` puts the record on the page before its scripts run.
      const load = (globalThis as unknown as LoadGlobal).__METABOX_CONNECTION_LOAD__;

      return { from: performance.now(), sent: load.sent };
    });

    await act();
    // One frame more: the panel applies a frame on its next half-second batch, so the last
    // counted frame is rendered by the time the following one is sent.
    await expect
      .poll(
        async () =>
          this.page.evaluate(
            () =>
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `install` puts the record on the page before its scripts run.
              (globalThis as unknown as LoadGlobal).__METABOX_CONNECTION_LOAD__.sent
          ),
        {
          timeout: (frames + 1 + FRAME_SLACK) * FRAME_MS,
        }
      )
      .toBeGreaterThanOrEqual(start.sent + frames + 1);

    return this.page.evaluate((step) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `install` puts the record on the page before its scripts run.
      const load = (globalThis as unknown as LoadGlobal).__METABOX_CONNECTION_LOAD__;

      load.flush();

      const tasks = load.longTasks.filter((task) => task.startTime >= step.from);
      const longFrames = load.longFrames.filter((frame) => frame.startTime >= step.from);
      const worst = longFrames.reduce<LongTaskRecord | null>(
        (max, frame) => (max === null || frame.duration > max.duration ? frame : max),
        null
      );

      return {
        longest: Math.max(0, ...tasks.map((task) => task.duration)),
        frames: load.sent - step.sent,
        scripts: worst?.scripts ?? [],
      };
    }, start);
  }
}

export const test = base.extend<{ connectionLoad: ConnectionLoad }>({
  connectionLoad: async ({ page }, use) => {
    await use(new ConnectionLoad(page));
  },
});
