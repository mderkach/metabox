import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogTrigger } from '@shared/ui';

import { RULE_CUSTOM_ADD_NS } from '../i18n/RuleCustomAdd.namespace.generated';
import { RuleCustomAddDialog } from './RuleCustomAddDialog';

export function RuleCustomAddButton({
  text,
  initialOutbound,
  ruleIndex,
}: {
  text: string;
  initialOutbound?: string;
  ruleIndex?: number;
}) {
  const { t } = useTranslation(RULE_CUSTOM_ADD_NS);
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
        <RuleCustomAddDialog
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
