import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { initTestI18n } from './i18n';
import { server } from './server';

await initTestI18n();

// Глобалы vitest выключены, поэтому Testing Library не регистрирует свою очистку.
afterEach(cleanup);

/**
 * ResizeObserver в jsdom нет вовсе, а виртуализатор списков без него не
 * подписывается на изменение окна прокрутки. Заглушка сообщает об изменении
 * сразу, а размеры тест подставляет через `mockVirtualSizes`.
 */
class TestResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    // Пустой список записей: библиотека тогда меряет элемент сама, а тест
    // подменяет размеры через `mockVirtualSizes`.
    this.callback([], this);
  }

  unobserve(): void {
    // Наблюдение одноразовое: отписывать нечего.
  }

  disconnect(): void {
    // Наблюдение одноразовое: отключать нечего.
  }
}

globalThis.ResizeObserver = TestResizeObserver;

/**
 * Web Animations API в jsdom нет, а область прокрутки Base UI спрашивает у
 * вьюпорта текущие анимации по таймеру — уже после того, как тест закончился,
 * поэтому падение прилетает необработанным исключением мимо теста. Анимаций в
 * jsdom не бывает вовсе, поэтому пустой список здесь не упрощение.
 */
Element.prototype.getAnimations = function getAnimations(): Animation[] {
  return [];
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
