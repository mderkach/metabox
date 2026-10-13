import { http, HttpResponse } from 'msw';

import { MS_IN_SECOND } from '@shared/lib/time';

import { LOG_ENDPOINT } from '../api/Log.endpoints';
import { LEVEL, type EntryWire, type LogsWire } from '../api/Log.schema';
import { LOG_STREAM_SAMPLES, LOGS_FIXTURE } from './Log.fixture';

/** Stream line step in dev mode: a live log at `info` writes about like this. */
const STREAM_INTERVAL = MS_IN_SECOND;

/** As in the daemon: a line without a level passes the filter: it is a continuation of the message. */
function passes(entry: EntryWire, level: string): boolean {
  const min = LEVEL.findIndex((value) => value === level);

  return entry.level === undefined || LEVEL.findIndex((value) => value === entry.level) >= min;
}

function minLevel(request: Request): string {
  return new URL(request.url).searchParams.get('level') ?? 'trace';
}

/**
 * Log handlers. State is in the factory closure: clearing drops the lines up to
 * the mark, like the daemon mark with `logread`.
 */
export function createLogHandlers(initial: LogsWire = LOGS_FIXTURE) {
  let tail = initial;

  return [
    http.get(LOG_ENDPOINT.logs(), ({ request }) => {
      const level = minLevel(request);

      return HttpResponse.json({ ...tail, entries: tail.entries.filter((entry) => passes(entry, level)) });
    }),
    http.post(LOG_ENDPOINT.clear(), () => {
      const since = new Date().toISOString();

      tail = { ...tail, since, entries: [] };

      return HttpResponse.json({ since });
    }),
    http.get(LOG_ENDPOINT.stream(), ({ request }) => {
      const level = minLevel(request);
      const encoder = new TextEncoder();
      let timer: ReturnType<typeof setInterval> | null = null;

      const stream = new ReadableStream({
        start(controller) {
          let seq = 0;

          function pushLine() {
            const sample = LOG_STREAM_SAMPLES[seq % LOG_STREAM_SAMPLES.length];

            seq += 1;

            if (!passes(sample, level)) {
              return;
            }

            const event = { seq, entry: { ...sample, time: new Date().toISOString() } };

            controller.enqueue(encoder.encode(`event: log\ndata: ${JSON.stringify(event)}\n\n`));
          }

          timer = setInterval(pushLine, STREAM_INTERVAL);
        },
        cancel() {
          if (timer !== null) clearInterval(timer);
        },
      });

      return new HttpResponse(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
      });
    }),
  ];
}
