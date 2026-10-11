import { fireEvent } from '@testing-library/react';

/**
 * Конец выезда бара применения. jsdom переходов не играет, и уехавший бар
 * держал бы снимок и место под собой до конца теста. Скрытый бар роли в
 * дереве доступности не имеет, поэтому ищется по `data-slot`.
 */
export function finishApplyBarTransition(): void {
  // oxlint-disable-next-line testing-library/no-node-access -- скрытый бар без роли, искать его по-другому нечем
  const bar = document.querySelector('[data-slot="apply-bar"]');

  if (bar === null) {
    throw new Error('[TEST] apply bar is not rendered');
  }

  fireEvent.transitionEnd(bar, { propertyName: 'translate' });
}
