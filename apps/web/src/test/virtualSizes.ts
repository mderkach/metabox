import { vi } from 'vitest';

/** Контейнер прокрутки виртуализованного списка помечает себя сам. */
const VIEWPORT_ATTRIBUTE = 'data-virtual-viewport';

/**
 * Размеры для виртуализованных списков.
 *
 * jsdom не раскладывает элементы, поэтому `offsetHeight` у него всегда ноль, а
 * `@tanstack/react-virtual` меряет окно прокрутки именно им и без высоты
 * отрисовывает ноль строк. Подмена задаёт высоту окна и строки, чтобы тест
 * проверял поведение списка, а не пустой DOM.
 *
 * Размеры получают только окно прокрутки и строки: подмена высоты у всех
 * элементов подряд ломает позиционирование попапов Base UI — они считают
 * себя не помещающимися и не рендерят содержимое.
 */
export function mockVirtualSizes({ viewport = 600, row = 52 }: { viewport?: number; row?: number } = {}): void {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-index')) {
      return row;
    }

    return this.hasAttribute(VIEWPORT_ATTRIBUTE) ? viewport : 0;
  });

  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-index') || this.hasAttribute(VIEWPORT_ATTRIBUTE) ? 1200 : 0;
  });
}
