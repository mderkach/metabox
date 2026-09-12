import { z } from 'zod';

import { EventSchema } from './daemon.generated';

/**
 * Топики потока рантайма. Панель подписывается на все сразу: отдельной
 * подписки на топик поток не имеет (ADR-0010).
 */
export const RUNTIME_TOPIC = {
  Traffic: 'traffic',
  Memory: 'memory',
  Connections: 'connections',
  Service: 'service',
} as const;

export type RuntimeTopic = (typeof RUNTIME_TOPIC)[keyof typeof RUNTIME_TOPIC];

export { EventSchema as RuntimeEventSchema } from './daemon.generated';
export type { EventWire as RuntimeEvent } from './daemon.generated';

/**
 * Всё, что обработчику нужно от потока. Узкий тип вместо `EventSource`: так
 * обработчик проверяется без транспорта, а подмена в тесте не изображает
 * протокол целиком — в jsdom `EventSource` нет вовсе.
 */
export interface StreamSource {
  addEventListener: (type: string, handler: (event: MessageEvent<string>) => void) => void;
  removeEventListener: (type: string, handler: (event: MessageEvent<string>) => void) => void;
}

/**
 * Следит за нумерацией конверта и зовёт `onGap`, когда номера разошлись:
 * демон считает `seq` для каждого читателя без пропусков, поэтому разрыв
 * означает отброшенное событие, а не порядок доставки (ADR-0010). Счётчик
 * общий на подписку, значит и проверять его нужно по всем топикам сразу.
 */
export function watchSequence(source: StreamSource, onGap: () => void): () => void {
  let expected: number | null = null;

  const handler = (event: MessageEvent<string>) => {
    const envelope = EventSchema.safeParse(safeJson(event.data));

    if (!envelope.success) {
      return;
    }

    const { seq } = envelope.data;

    if (expected !== null && seq !== expected) {
      onGap();
    }

    expected = seq + 1;
  };

  for (const topic of Object.values(RUNTIME_TOPIC)) {
    source.addEventListener(topic, handler);
  }

  return () => {
    for (const topic of Object.values(RUNTIME_TOPIC)) {
      source.removeEventListener(topic, handler);
    }
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Подписка на топик потока. Возвращает функцию отписки: без неё обработчик
 * переживёт размонтирование, и каждое переоткрытие экрана добавляло бы ещё
 * один разбор тех же событий.
 *
 * Данные достаются из конверта здесь: слайсу достаётся его топик, а не форма
 * транспорта.
 */
export function listenTopic(source: StreamSource, topic: RuntimeTopic, apply: (data: unknown) => void): () => void {
  const handler = (event: MessageEvent<string>) => {
    try {
      const envelope = EventSchema.safeParse(JSON.parse(event.data));

      if (!envelope.success) {
        console.warn(`[STREAM] конверт топика ${topic} не разобран`, z.prettifyError(envelope.error));

        return;
      }

      apply(envelope.data.data);
    } catch {
      // Битый кадр пропускается: следующий придёт через секунду.
    }
  };

  source.addEventListener(topic, handler);

  return () => {
    source.removeEventListener(topic, handler);
  };
}
