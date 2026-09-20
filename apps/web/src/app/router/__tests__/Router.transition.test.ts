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

describe('направление перехода между экранами', () => {
  it('первый заход не анимируется', () => {
    expect(toPageTransitionTypes(toChange(undefined, '/config'))).toBe(false);
  });

  it('смена одних параметров адреса не анимируется', () => {
    const location = toLocation('/config');
    const withRule = Router.buildLocation({ to: '/config', search: { rule: 3 } });

    expect(toPageTransitionTypes({ fromLocation: location, toLocation: withRule, pathChanged: false })).toBe(false);
  });

  it('вниз по меню экран уходит вперёд', () => {
    expect(toPageTransitionTypes(toChange('/overview', '/connections'))).toEqual([PAGE_TRANSITION.Forward]);
  });

  it('вверх по меню экран уходит назад', () => {
    expect(toPageTransitionTypes(toChange('/connections', '/config'))).toEqual([PAGE_TRANSITION.Backward]);
  });

  // Оболочку раздела держит маршрут-раскладка, и при переходе между вкладками
  // она стоит: шапка на них одна и та же, растворять её нечего.
  it('переход между вкладками раздела оболочку не трогает', () => {
    expect(toPageTransitionTypes(toChange('/config', '/config/rule-set'))).toEqual([PAGE_TRANSITION.Hold]);
    expect(toPageTransitionTypes(toChange('/config', '/config/raw'))).toEqual([PAGE_TRANSITION.Hold]);
    expect(toPageTransitionTypes(toChange('/config/raw', '/config/rule-set'))).toEqual([PAGE_TRANSITION.Hold]);
  });

  // Раздел считается первым сегментом адреса, и корень своего раздела не имеет:
  // иначе `/` и `/config` считались бы одним разделом и переход бы пропал.
  it('корень и раздел разделами не совпадают', () => {
    expect(toPageTransitionTypes(toChange('/', '/config'))).toEqual([PAGE_TRANSITION.Fade]);
  });

  it('разные разделы с общим началом имени не путаются', () => {
    expect(toPageTransitionTypes(toChange('/config', '/connections'))).not.toEqual([PAGE_TRANSITION.Hold]);
  });

  it('путь вне меню сменяется растворением', () => {
    expect(toPageTransitionTypes(toChange('/config', '/nope'))).toEqual([PAGE_TRANSITION.Fade]);
  });
});
