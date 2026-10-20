import { cn } from '@shared/lib/utils';
import { SECTION_HEADING } from '@shared/ui';

/**
 * The title gets focus when the panel opens. The ring needs a gap, like on a
 * button: inner padding moves it away from the text, and a negative margin
 * keeps the text in place.
 */
export const HEADING = cn(
  '-mx-1.5 -my-0.5 flex min-w-0 grow flex-col rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
  SECTION_HEADING
);
