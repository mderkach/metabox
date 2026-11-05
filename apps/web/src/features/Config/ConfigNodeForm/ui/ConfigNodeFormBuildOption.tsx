import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@shared/ui';

import { NS } from './ConfigNodeForm.namespace';

export function ConfigNodeFormBuildOption({ tag, children }: { tag: string | null; children: ReactNode }) {
  const { t } = useTranslation(NS);

  if (tag === null) return <>{children}</>;

  return (
    <div className='flex flex-col gap-1.5'>
      <Badge variant='outline' className='self-start'>
        {t('unbuilt', { tag })}
      </Badge>
      {children}
    </div>
  );
}
