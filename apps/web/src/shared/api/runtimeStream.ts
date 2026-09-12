import { z } from 'zod';

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

/**
 * Конверт демона. `seq` считается для каждого читателя отдельно и растёт без
 * пропусков: разрыв в номерах означает, что читатель не успевал и событие
 * было отброшено.
 *
 * Полезная нагрузка остаётся `unknown`: её форму знает слайс-владелец топика,
 * а конверт отвечает только за доставку.
 */
export const RuntimeEventSchema = z.object({
  topic: z.string(),
  seq: z.number(),
  data: z.unknown(),
});

export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

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
      const envelope = RuntimeEventSchema.safeParse(JSON.parse(event.data));

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
