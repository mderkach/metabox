import { vi } from 'vitest';

/** The scroll container of a virtualized list marks itself. */
const VIEWPORT_ATTRIBUTE = 'data-virtual-viewport';

/**
 * Sizes for virtualized lists.
 *
 * jsdom does not lay out elements, so its `offsetHeight` is always zero, while
 * `@tanstack/react-virtual` measures the scroll window by exactly that and without a height
 * renders zero rows. The stand-in sets the window and row height so the test
 * checks list behavior, not an empty DOM.
 *
 * Sizes go only to the scroll window and rows: stubbing the height of all
 * elements indiscriminately breaks Base UI popup positioning — they consider
 * themselves not fitting and do not render content.
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
