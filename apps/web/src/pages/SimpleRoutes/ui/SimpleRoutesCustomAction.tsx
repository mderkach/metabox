import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogTrigger } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import { SimpleRoutesCustomDialog } from './SimpleRoutesCustomDialog';

export function SimpleRoutesCustomAction({
  text,
  initialOutbound,
  ruleIndex,
}: {
  text: string;
  initialOutbound?: string;
  ruleIndex?: number;
}) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const [review, setReview] = useState<{ text: string; ruleIndex?: number } | null>(null);
  return (
    <Dialog
      open={review !== null}
      onOpenChange={(open) => {
        setReview(open ? { text, ruleIndex } : null);
      }}
    >
      <DialogTrigger render={<Button size='sm' variant={ruleIndex === undefined ? 'outline' : 'ghost'} />}>
        <Plus data-icon='inline-start' />
        {t(ruleIndex === undefined ? 'custom.add' : 'custom.exception')}
      </DialogTrigger>
      {review && (
        <SimpleRoutesCustomDialog
          text={review.text}
          initialOutbound={initialOutbound}
          ruleIndex={review.ruleIndex}
          changed={text !== review.text}
          onAdded={() => {
            setReview(null);
          }}
        />
      )}
    </Dialog>
  );
}
