/**
 * Classes shared by several screens. Only the sets that
 * repeat more than twice are here: if they drift apart, they give two different looks of one
 * and the same element on neighboring screens.
 */

/**
 * Card title: small caps with tracking instead of one more font size step.
 * Size 12px, not 10: functional text below eleven is unreadable at
 * working distance, and every panel card is labelled with this set.
 */
export const SECTION_LABEL = 'text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase';

/**
 * Mid-level title: a screen section, a panel, a group card. One
 * step between the card label and the screen title, 18px, one weight:
 * two steps at one level read as two levels. The `SECTION_LABEL` small caps
 * remains a card label and does not serve as a title.
 */
export const SECTION_HEADING = 'text-lg font-semibold';

/**
 * Table header small caps: the same technique as `SECTION_LABEL`, but a separate
 * constant — the table header and the card title change independently of each
 * other, even if they look the same today.
 */
export const TABLE_HEADER = 'text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase';

/** Search field in a list toolbar: one width for all panel lists. */
export const SEARCH_FIELD = 'relative w-full max-w-80';

/** Filter chip: outbound facet on rules. */
export const FACET_CLASS =
  'flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

export const FACET_ACTIVE = 'border-selected-edge bg-selected text-foreground';
export const FACET_IDLE = 'border-border text-muted-foreground hover:text-foreground';
export const FACET_MORE = 'border-dashed border-border text-muted-foreground hover:text-foreground';

/**
 * Destructive action: an outline in the danger tone, not a fill. A filled tone
 * among ordinary buttons reads as an error message, not as an available
 * action. It is worn by "Close all connections", "Stop" and "Discard
 * changes" — everything that cannot be undone with a button nearby.
 */
export const DESTRUCTIVE_OUTLINE =
  'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive';

/**
 * Surface edge: of cards, lists, panels.
 *
 * Values repeat the vendor-zone `Card` verbatim. It cannot be edited — the CLI
 * overwrites the file — and surfaces must not diverge from it either: on the
 * config and connections screens the list and the panel stand side by side, and a different edge
 * reads as a different kind of element.
 */
export const SURFACE = 'rounded-xl bg-card ring-1 ring-foreground/10';

/** Surface title strip: for a list, a panel and a card with a header of its own. */
export const SURFACE_HEAD = 'border-b border-border px-4 py-3';

/**
 * A `Card` whose content sets paddings itself. Under the title strip they must
 * run to the edges, and the card's own paddings get in the way.
 */
export const CARD_FLUSH = 'gap-0 py-0';

/**
 * `Empty` inside a card with data. The primitive's paddings are designed for an empty
 * screen: in a summary card with them the empty card is taller than the neighbors that have data.
 */
export const EMPTY_INLINE = 'p-4';

/**
 * Delayed skeleton reveal: on a fast response it never becomes
 * visible and does not flash. Sits on the wrapper, not on `Skeleton`: that one has its own
 * pulse animation, and a second one would override it.
 */
export const PENDING_REVEAL = 'animate-in fade-in fill-mode-backwards delay-200 duration-300';

/**
 * The bottom sheet slides in whole, from the bottom edge: the vendor 2.5rem shift on
 * a screen-tall sheet reads as a flash, not as motion. It leaves faster than it
 * arrives. Without animation the sheet appears at once.
 */
export const SHEET_BOTTOM =
  'duration-(--motion-sheet-enter) ease-(--motion-ease-out) data-ending-style:duration-(--motion-sheet-exit) data-ending-style:opacity-100 data-starting-style:opacity-100 data-[side=bottom]:data-ending-style:translate-y-full data-[side=bottom]:data-starting-style:translate-y-full motion-reduce:transition-none';
