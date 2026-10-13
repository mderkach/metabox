import { useEffect, useState } from 'react';

import { MS_IN_SECOND } from './time';

/**
 * Seconds down to zero, ticking once a second. A new `seconds` value — the answer of
 * the source of truth — resets the countdown to it: a `setInterval` throttled in a background
 * tab does not accumulate drift this way.
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
