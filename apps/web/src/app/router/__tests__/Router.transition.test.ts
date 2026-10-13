import { describe, expect, it } from 'vitest';

import { Router } from '../Router';
import { PAGE_TRANSITION, toPageTransitionTypes } from '../Router.transition';

function toLocation(to: string) {
  return Router.buildLocation({ to });
}

function toChange(from: string | undefined, to: string) {
  const fromLocation = from === undefined ? undefined : toLocation(from);
  const toLocation_ = toLocation(to);

  return { fromLocation, toLocation: toLocation_, pathChanged: fromLocation?.pathname !== toLocation_.pathname };
}

describe('transition direction between screens', () => {
  it('the first visit is not animated', () => {
    expect(toPageTransitionTypes(toChange(undefined, '/config'))).toBe(false);
  });

  it('changing only address parameters is not animated', () => {
    const location = toLocation('/config');
    const withRule = Router.buildLocation({ to: '/config', search: { rule: 3 } });

    expect(toPageTransitionTypes({ fromLocation: location, toLocation: withRule, pathChanged: false })).toBe(false);
  });

  it('down the menu the screen moves forward', () => {
    expect(toPageTransitionTypes(toChange('/overview', '/connections'))).toEqual([PAGE_TRANSITION.Forward]);
  });

  it('up the menu the screen moves back', () => {
    expect(toPageTransitionTypes(toChange('/connections', '/config'))).toEqual([PAGE_TRANSITION.Backward]);
  });

  // The section shell is held by the layout route, and on a switch between tabs
  // it stays put: the header is the same on them, there is nothing to dissolve.
  it('a switch between section tabs does not touch the shell', () => {
    expect(toPageTransitionTypes(toChange('/config', '/config/rule-set'))).toEqual([PAGE_TRANSITION.Hold]);
    expect(toPageTransitionTypes(toChange('/config', '/config/raw'))).toEqual([PAGE_TRANSITION.Hold]);
    expect(toPageTransitionTypes(toChange('/config/raw', '/config/rule-set'))).toEqual([PAGE_TRANSITION.Hold]);
  });

  // A section is the first address segment, and the root has no section of its own:
  // otherwise `/` and `/config` would count as one section and the transition would be lost.
  it('the root and a section are not the same section', () => {
    expect(toPageTransitionTypes(toChange('/', '/config'))).toEqual([PAGE_TRANSITION.Fade]);
  });

  it('different sections with a common name prefix are not confused', () => {
    expect(toPageTransitionTypes(toChange('/config', '/connections'))).not.toEqual([PAGE_TRANSITION.Hold]);
  });

  it('a path outside the menu changes with a dissolve', () => {
    expect(toPageTransitionTypes(toChange('/config', '/nope'))).toEqual([PAGE_TRANSITION.Fade]);
  });
});
