import { advanceConnectionsSnapshot, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { RUNTIME_TOPIC } from '@shared/api';
import { MS_IN_SECOND } from '@shared/lib/time';

/** Stream step on the device: one snapshot per second. */
const STREAM_INTERVAL = MS_IN_SECOND;

const READY_STATE = { Connecting: 0, Open: 1, Closed: 2 } as const;

/** One entry of the Long Animation Frames API: the DOM types do not declare it yet. */
interface LongFrameEntry extends PerformanceEntry {
  scripts: readonly { duration: number; invoker: string; sourceURL: string; sourceFunctionName: string }[];
}

/**
 * The connection stream fed from frames serialized before the app starts, and the main-thread
 * tasks over 50 ms recorded with their scripts.
 *
 * The msw stream handler builds and serializes every snapshot in the page and passes it through the
 * service worker, which costs more than the panel itself; here a tick is one `MessageEvent` with a
 * ready string, so the main thread pays only for what the panel does with the frame. Other requests
 * still go to msw.
 */
export function installConnectionLoad(load: ConnectionLoad): void {
  observeLongTasks(load);

  const frames = buildFrames(load.connections, load.rules, load.frames);
  const streams = new Set<EventTarget>();
  let seq = 0;

  function push() {
    const frame = frames[load.sent] as string | undefined;

    if (streams.size === 0 || frame === undefined) {
      return;
    }

    seq += 1;
    load.sent += 1;

    // One event for all listeners, as the browser does: the panel parses a frame once per event.
    const event = new MessageEvent(RUNTIME_TOPIC.Connections, {
      data: `{"topic":"${RUNTIME_TOPIC.Connections}","seq":${String(seq)},"data":${frame}}`,
    });

    for (const stream of streams) {
      stream.dispatchEvent(event);
    }
  }

  class LoadEventSource extends EventTarget {
    readonly url: string;
    readyState: number = READY_STATE.Connecting;

    constructor(url: string) {
      super();
      this.url = url;
      streams.add(this);
      setTimeout(() => {
        this.readyState = READY_STATE.Open;
        this.dispatchEvent(new Event('open'));
        push();
      });
    }

    close() {
      this.readyState = READY_STATE.Closed;
      streams.delete(this);
    }
  }

  // Only the runtime stream is replaced; the log stream and the `CLOSED` constants stay the browser's.
  window.EventSource = new Proxy(window.EventSource, {
    construct(target, [url, init]: [string | URL, EventSourceInit | undefined]) {
      return String(url) === DAEMON_ENDPOINT.events() ? new LoadEventSource(String(url)) : new target(url, init);
    },
  });
  setInterval(push, STREAM_INTERVAL);
}

/**
 * Frames of the stream, serialized in advance: the snapshot changes in place, so each one is a
 * string. The matched rule of a connection is spread over `rules` texts, as on a config with that
 * many rules.
 */
function buildFrames(connections: number, rules: number, count: number): string[] {
  const snapshot = makeConnectionsSnapshot(connections, { vary: true });

  snapshot.connections = snapshot.connections.map((row, index) => ({
    ...row,
    rule: `rule_set=list-${String(index % rules)}`,
  }));

  return Array.from({ length: count }, (_, index) => JSON.stringify(advanceConnectionsSnapshot(snapshot, index + 1)));
}

function observeLongTasks(load: ConnectionLoad) {
  function recordTasks(entries: PerformanceEntryList) {
    for (const entry of entries) {
      load.longTasks.push({ startTime: entry.startTime, duration: entry.duration, scripts: [] });
    }
  }

  function recordFrames(entries: PerformanceEntryList) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the observer is subscribed to this entry type only.
    for (const entry of entries as LongFrameEntry[]) {
      load.longFrames.push({
        startTime: entry.startTime,
        duration: entry.duration,
        scripts: entry.scripts.map(
          (script) =>
            `${String(Math.round(script.duration))} ms ${script.invoker} ${script.sourceFunctionName} ${script.sourceURL}`
        ),
      });
    }
  }

  const tasks = new PerformanceObserver((list) => {
    recordTasks(list.getEntries());
  });
  const frames = new PerformanceObserver((list) => {
    recordFrames(list.getEntries());
  });

  tasks.observe({ type: 'longtask', buffered: true });
  frames.observe({ type: 'long-animation-frame', buffered: true });

  // Entries still queued for the callbacks are taken here, so a step reads every task before its end.
  load.flush = () => {
    recordTasks(tasks.takeRecords());
    recordFrames(frames.takeRecords());
  };
}
