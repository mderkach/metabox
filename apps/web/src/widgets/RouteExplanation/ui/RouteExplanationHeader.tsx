import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button, SURFACE_HEAD } from '@shared/ui';

export function RouteExplanationHeader({
  heading,
  actions = null,
  onClose,
}: {
  heading: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');

  return (
    <header className={cn('flex items-center gap-2.5', SURFACE_HEAD)}>
      {heading}
      {actions}
      <Button variant='outline' size='icon-sm' aria-label={t('close')} onClick={onClose}>
        <X />
      </Button>
    </header>
  );
}
