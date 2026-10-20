import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Sheet, SheetContent, SheetTitle, SHEET_BOTTOM } from '@shared/ui';

import { HEADING } from './RouteExplanation.styles';
import { RouteExplanationBody } from './RouteExplanationBody';
import { RouteExplanationHeader } from './RouteExplanationHeader';
import { RouteExplanationTitle } from './RouteExplanationTitle';

/**
 * The same explanation as a sheet on top of the list — for a screen where there is no room for a panel
 * beside the list. Escape, a click outside and the close button call `onClose`, as
 * for the panel.
 */
export function RouteExplanationSheet({
  id,
  connectionId,
  host,
  source,
  onClose,
}: {
  id?: string;
  /** `null` means no connection is selected, the sheet is closed. */
  connectionId: string | null;
  host: string;
  source: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');
  // The sheet slides away with an animation after the selection is reset and all that time
  // shows the last connection, not emptiness.
  const [shown, setShown] = useState({ connectionId, host, source });

  if (connectionId !== null && (connectionId !== shown.connectionId || host !== shown.host)) {
    setShown({ connectionId, host, source });
  }

  // The sheet height is set, not taken from content: the body arrives by request,
  // and a sheet that grew from a skeleton to the explanation would jerk mid-slide.
  return (
    <Sheet
      open={connectionId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        id={id}
        side='bottom'
        showCloseButton={false}
        className={cn(SHEET_BOTTOM, 'max-h-[85svh] min-h-[85svh] gap-0')}
      >
        <RouteExplanationHeader
          heading={
            // Base UI takes the sheet name from the title, while the visible text would glue
            // the label to the node without a space.
            <SheetTitle aria-label={t('titleFor', { host: shown.host })} className={HEADING}>
              <RouteExplanationTitle host={shown.host} source={shown.source} />
            </SheetTitle>
          }
          onClose={onClose}
        />
        {shown.connectionId !== null && <RouteExplanationBody connectionId={shown.connectionId} />}
      </SheetContent>
    </Sheet>
  );
}
