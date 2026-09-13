/**
 * Классы, общие для нескольких экранов. Здесь только те наборы, которые
 * повторяются больше двух раз: разъехавшись, они дают два разных вида одного и
 * того же элемента на соседних экранах.
 */

/**
 * Заголовок карточки: капитель с трекингом вместо ещё одной ступени кегля.
 * Кегль 12px, а не 10: функциональный текст ниже одиннадцати не читается на
 * рабочем расстоянии, а этим набором подписана каждая карточка панели.
 */
export const SECTION_LABEL = 'text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase';

/** Заголовок секции экрана: на ступень крупнее заголовка карточки внутри неё. */
export const SECTION_HEADING = 'text-sm font-semibold';

/** Чип отбора: фасет по устройству на соединениях и по исходу на правилах. */
export const FACET_CLASS =
  'flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

export const FACET_ACTIVE = 'border-selected-edge bg-selected text-foreground';
export const FACET_IDLE = 'border-border text-muted-foreground hover:text-foreground';
export const FACET_MORE = 'border-dashed border-border text-muted-foreground hover:text-foreground';
