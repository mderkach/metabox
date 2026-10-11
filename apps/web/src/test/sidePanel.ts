import { fireEvent } from '@testing-library/react';

/**
 * Конец выезда боковой панели. jsdom переходов не играет, и закрытая панель
 * держала бы уходящее содержимое и колонку до конца теста. Скрытая панель
 * роли в дереве доступности не имеет, поэтому ищется по `data-slot`.
 */
export function finishSidePanelTransition(): void {
  // oxlint-disable-next-line testing-library/no-node-access -- скрытая панель без роли, искать её по-другому нечем
  const panel = document.querySelector('[data-slot="side-panel"]');

  if (panel === null) {
    throw new Error('[TEST] side panel is not rendered');
  }

  fireEvent.transitionEnd(panel, { propertyName: 'translate' });
}
