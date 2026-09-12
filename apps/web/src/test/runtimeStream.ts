import { http, HttpResponse } from 'msw';

import { API_ENDPOINT, type RuntimeTopic } from '@shared/api';

/** Что мок шлёт в топик: значение берётся функцией, чтобы сэмплы менялись. */
export interface RuntimeSample {
  topic: RuntimeTopic;
  data: () => unknown;
}

/**
 * Мок единого потока рантайма: кадры SSE в конверте демона (ADR-0010).
 *
 * Живёт в оснастке, а не в слайсе: поток один на все топики, и данные в него
 * складывают фикстуры разных слайсов — собирает их точка сборки моков.
 * Доменного знания здесь нет, только кадрирование.
 */
export function runtimeStreamHandler(samples: RuntimeSample[], interval: number) {
  return http.get(API_ENDPOINT.events(), () => {
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

        // Подключившийся получает состояние сразу, а не через период опроса:
        // так же ведёт себя демон.
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
