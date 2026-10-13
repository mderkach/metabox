import { fireEvent } from '@testing-library/react';

/**
 * End of the apply bar slide-out. jsdom does not play transitions, and a bar that slid away
 * would hold the snapshot and the space under it until the end of the test. A hidden bar has no role
 * in the accessibility tree, so it is found by `data-slot`.
 */
export function finishApplyBarTransition(): void {
  // oxlint-disable-next-line testing-library/no-node-access -- hidden bar without a role, there is no other way to find it
  const bar = document.querySelector('[data-slot="apply-bar"]');

  if (bar === null) {
    throw new Error('[TEST] apply bar is not rendered');
  }

  fireEvent.transitionEnd(bar, { propertyName: 'translate' });
}
