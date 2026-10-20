import { useTranslation } from 'react-i18next';

import { Badge } from '@shared/ui';

import { GROUP_TYPE_LABEL } from '../model';

/** Node type in the header: a group type in words with the config key beside it, a protocol as is. */
export function ConfigNodeTypeBadge({ type }: { type: string }) {
  const { t } = useTranslation('shared');
  const label = GROUP_TYPE_LABEL[type];

  return (
    <Badge variant='secondary'>
      {label === undefined ? (
        type
      ) : (
        <>
          {t(label)}
          <span className='font-mono text-muted-foreground'>{type}</span>
        </>
      )}
    </Badge>
  );
}
