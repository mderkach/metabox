import { useTranslation } from 'react-i18next';

import type { LiveMessage } from '../lib/useLiveRegion';

/**
 * Live region: the result of an action that a screen reader reads on its own without
 * moving focus. State is held by `useLiveRegion` from `shared/lib` on the screen. A toast does not replace it — a toast is shown, not announced, and `sonner`
 * announces only itself.
 *
 * The region stands in the markup in advance and empty: a screen reader watches changes of an
 * already existing region and skips one that appeared together with text. The text
 * lies in a node with the announcement key — repeating the same text changes the node, and
 * the announcement sounds again.
 *
 * The region has its own name: other statuses stand next to it on screen — stream state,
 * loading — and both a test and a screen reader find it in the region list by name.
 */
export function LiveRegion({ message }: { message: LiveMessage | null }) {
  const { t } = useTranslation('shared');

  return (
    <div role='status' aria-live='polite' aria-atomic='true' aria-label={t('liveRegion.label')} className='sr-only'>
      {message !== null && <span key={message.id}>{message.text}</span>}
    </div>
  );
}
