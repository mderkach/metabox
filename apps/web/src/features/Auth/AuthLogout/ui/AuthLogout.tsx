import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@entities/Auth';
import { Button } from '@shared/ui';

import { useLogout } from '../api';

/** Shown only with a password and a live session: without a password there is nothing to leave. */
export function AuthLogout({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation('features/Auth/AuthLogout');
  const auth = useAuth();
  const logout = useLogout();

  if (!auth.isSuccess || !auth.data.authenticated) {
    return null;
  }

  const label = t('label');

  return (
    <Button
      variant='ghost'
      size='sm'
      title={label}
      aria-label={collapsed ? label : undefined}
      disabled={logout.isPending}
      className='justify-start text-muted-foreground'
      onClick={() => {
        logout.mutate();
      }}
    >
      <LogOut aria-hidden='true' className='size-3.5' />
      {!collapsed && label}
    </Button>
  );
}
