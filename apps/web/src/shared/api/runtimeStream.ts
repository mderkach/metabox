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
 */
export interface RuntimeEvent<T> {
  topic: RuntimeTopic;
  seq: number;
  data: T;
}

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
export function listenTopic<T>(source: StreamSource, topic: RuntimeTopic, apply: (data: T) => void): () => void {
  const handler = (event: MessageEvent<string>) => {
    try {
      // Схемой поток не проверяется намеренно: разбор снапшота на 5000
      // соединений раз в секунду и есть та работа, которую запрещает NFR-2.
      // Применение стоит внутри: кадр с валидным JSON и чужой формой уронил бы
      // обработчик так же, как оборванный.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- см. выше
      const envelope = JSON.parse(event.data) as RuntimeEvent<T>;

      apply(envelope.data);
    } catch {
      // Битый кадр пропускается: следующий придёт через секунду.
    }
  };

  source.addEventListener(topic, handler);

  return () => {
    source.removeEventListener(topic, handler);
  };
}
