import { http, HttpResponse } from 'msw';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { type RuntimeTopic } from '@shared/api';

/** What the mock sends to a topic: the value is taken by a function so that samples change. */
export interface RuntimeSample {
  topic: RuntimeTopic;
  data: () => unknown;
}

/**
 * Mock of the single runtime stream: SSE frames in the daemon envelope.
 *
 * Lives in the test harness, not in a slice: the stream is one for all topics, and fixtures of
 * different slices put data into it — the mock assembly point collects them.
 * No domain knowledge here, only framing.
 */
export function runtimeStreamHandler(samples: RuntimeSample[], interval: number) {
  return http.get(DAEMON_ENDPOINT.events(), () => {
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        let seq = 0;

        const push = () => {
          for (const sample of samples) {
            seq += 1;

            const event = { topic: sample.topic, seq, data: sample.data() };

            controller.enqueue(encoder.encode(`event: ${sample.topic}\ndata: ${JSON.stringify(event)}\n\n`));
          }
        };

        // A connecting client gets the state at once, not after a polling period:
        // the daemon behaves the same way.
        push();
        timer = setInterval(push, interval);
      },
      cancel() {
        if (timer !== null) clearInterval(timer);
      },
    });

    return new HttpResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
    });
  });
}
