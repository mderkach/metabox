import { fireEvent } from '@testing-library/react';

/**
 * End of the side panel slide-out. jsdom does not play transitions, and a closed panel
 * would hold the departing content and the column until the end of the test. A hidden panel
 * has no role in the accessibility tree, so it is found by `data-slot`.
 */
export function finishSidePanelTransition(): void {
  // oxlint-disable-next-line testing-library/no-node-access -- hidden panel without a role, there is no other way to find it
  const panel = document.querySelector('[data-slot="side-panel"]');

  if (panel === null) {
    throw new Error('[TEST] side panel is not rendered');
  }

  fireEvent.transitionEnd(panel, { propertyName: 'translate' });
}
