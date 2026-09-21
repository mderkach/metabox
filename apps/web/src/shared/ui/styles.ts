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

/**
 * Капитель шапки таблицы: тот же приём, что у `SECTION_LABEL`, но отдельная
 * константа — шапка таблицы и заголовок карточки меняются независимо друг от
 * друга, даже если сегодня выглядят одинаково.
 */
export const TABLE_HEADER = 'text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase';

/** Чип отбора: фасет по устройству на соединениях и по исходу на правилах. */
export const FACET_CLASS =
  'flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

export const FACET_ACTIVE = 'border-selected-edge bg-selected text-foreground';
export const FACET_IDLE = 'border-border text-muted-foreground hover:text-foreground';
export const FACET_MORE = 'border-dashed border-border text-muted-foreground hover:text-foreground';

/**
 * Разрушительное действие: контур в тоне опасности, а не заливка. Залитый тон
 * среди обычных кнопок читается как сообщение об ошибке, а не как доступное
 * действие. Носят его «Закрыть все соединения», «Остановить» и «Отменить
 * правки» — всё, чего нельзя вернуть кнопкой рядом.
 */
export const DESTRUCTIVE_OUTLINE =
  'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive';

/**
 * Край поверхности: карточки, списка, панели.
 *
 * Значения повторяют `Card` вендорной зоны дословно. Править её нельзя — файл
 * перезаписывает CLI, — а расходиться с ней поверхностям тем более нельзя: на
 * экранах конфигурации и соединений список и панель стоят рядом, и разный край
 * читается как разный вид элемента.
 */
export const SURFACE = 'rounded-xl bg-card ring-1 ring-foreground/10';

/** Полоса заголовка поверхности: у списка, панели и карточки со своей шапкой. */
export const SURFACE_HEAD = 'border-b border-border px-4 py-3';

/**
 * `Card`, чьё содержимое задаёт отступы само. Под полосой заголовка они обязаны
 * идти до краёв, а собственные отступы карточки этому мешают.
 */
export const CARD_FLUSH = 'gap-0 py-0';
