/**
 * Классы, общие для нескольких экранов. Здесь только те наборы, которые
 * повторяются больше двух раз: разъехавшись, они дают два разных вида одного и
 * того же элемента на соседних экранах.
 */

/** Заголовок секции: капитель с трекингом вместо ещё одной ступени кегля. */
export const SECTION_LABEL = 'text-2xs font-medium tracking-[0.08em] text-muted-foreground uppercase';

/** Чип отбора: фасет по устройству на соединениях и по исходу на правилах. */
export const FACET_CLASS =
  'flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

export const FACET_ACTIVE = 'border-selected-edge bg-selected text-foreground';
export const FACET_IDLE = 'border-border text-muted-foreground hover:text-foreground';
export const FACET_MORE = 'border-dashed border-border text-muted-foreground hover:text-foreground';
