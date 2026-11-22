import { Pencil } from 'lucide-react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

export function ProxyMetadataButton({
  tag,
  server = false,
  expanded,
  editorId,
  onClick,
  ref,
}: {
  tag: string;
  server?: boolean;
  expanded: boolean;
  editorId: string;
  onClick: () => void;
  ref: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');

  return (
    <Button
      type='button'
      size='icon-sm'
      variant='outline'
      className='max-sm:size-11'
      ref={ref}
      aria-label={t(server ? 'metadata.editServer' : 'metadata.editLabel', { tag })}
      aria-expanded={expanded}
      aria-disabled={expanded}
      aria-controls={expanded ? editorId : undefined}
      onClick={onClick}
    >
      <Pencil aria-hidden='true' />
    </Button>
  );
}
