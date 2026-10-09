import { useEffect, useState } from 'react';

import { MS_IN_SECOND } from './time';

/**
 * Секунды до нуля, тикающие раз в секунду. Новое значение `seconds` — ответ
 * источника истины — сбрасывает отсчёт к нему: дросселированный в фоновой
 * вкладке `setInterval` так не копит расхождение.
 */
export function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  const [prevSeconds, setPrevSeconds] = useState(seconds);

  if (seconds !== prevSeconds) {
    setPrevSeconds(seconds);
    setLeft(seconds);
  }

  useEffect(function countDown() {
    const timer = setInterval(function tick() {
      setLeft((current) => Math.max(0, current - 1));
    }, MS_IN_SECOND);

    return function stopCountdown() {
      clearInterval(timer);
    };
  }, []);

  return left;
}
