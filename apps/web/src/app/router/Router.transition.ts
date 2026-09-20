import type { ParsedLocation } from '@tanstack/react-router';

import { NAV_TARGETS, pickActiveNav } from '@widgets/AppSidebar';

/**
 * Типы перехода между экранами. Их читает `:active-view-transition-type()` в
 * `app/styles/index.css`, и там же лежит сама анимация.
 */
export const PAGE_TRANSITION = {
  Forward: 'page-forward',
  Backward: 'page-backward',
  Fade: 'page-fade',
  /** Переход внутри раздела: содержимое меняется, оболочка стоит. */
  Hold: 'page-hold',
} as const;

export type PageTransition = (typeof PAGE_TRANSITION)[keyof typeof PAGE_TRANSITION];

interface LocationChange {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
  pathChanged: boolean;
}

/**
 * Раздел адреса — его первый сегмент: у вкладок раздела он общий, и общая же у
 * них оболочка, которую держит маршрут-раскладка.
 *
 * Равенство сегментов означает общую оболочку, пока раскладка в панели одна.
 * Вложенный маршрут без раскладки — например, отдельный экран соединения —
 * получит этот же тип, и его шапка сменится срезом вместо растворения.
 */
function toSection(pathname: string): string {
  return pathname.split('/')[1] ?? '';
}

function toNavIndex(pathname: string): number {
  const target = pickActiveNav(pathname, NAV_TARGETS);

  return target === null ? -1 : NAV_TARGETS.indexOf(target);
}

/**
 * Экран уходит в ту сторону, куда сместился текущий пункт меню. Пути вне меню
 * сменяются растворением. Первый заход и смена одних параметров адреса перехода
 * не получают: анимировать там нечего.
 *
 * Переход внутри раздела направления не получает по другой причине: оболочку
 * там держит маршрут-раскладка, и она стоит, а сдвиг содержимого под
 * неподвижной шапкой читается рывком, а не переходом. Направление при этом
 * показывает подчёркивание, переезжающее под новую вкладку. Цена решения:
 * «Конфигурация» и «Каталог сетов» — два соседних пункта меню, и подсветка
 * сайдбара между ними по-прежнему перескакивает, хотя содержимое только
 * растворяется.
 */
export function toPageTransitionTypes({
  fromLocation,
  toLocation,
  pathChanged,
}: LocationChange): PageTransition[] | false {
  if (fromLocation === undefined || !pathChanged) return false;

  if (toSection(fromLocation.pathname) === toSection(toLocation.pathname)) return [PAGE_TRANSITION.Hold];

  const from = toNavIndex(fromLocation.pathname);
  const to = toNavIndex(toLocation.pathname);
  if (from < 0 || to < 0 || from === to) return [PAGE_TRANSITION.Fade];

  return [from < to ? PAGE_TRANSITION.Forward : PAGE_TRANSITION.Backward];
}
