import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@entities/Auth';
import {
  Button,
  Dialog,
  DIALOG_SIZE,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/ui';

import { AuthPasswordForm } from './AuthPasswordForm';

/**
 * Panel password button with its dialog. Hidden while the daemon has not answered about login:
 * an older daemon without the endpoint has nothing to set.
 */
export function AuthPassword({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation('features/Auth/AuthPassword');
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  if (!auth.isSuccess) {
    return null;
  }

  const protectedPanel = auth.data.enabled;
  const label = t(protectedPanel ? 'trigger.change' : 'trigger.set');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant='ghost'
            size='sm'
            title={label}
            aria-label={collapsed ? label : undefined}
            className='justify-start text-muted-foreground'
          />
        }
      >
        <KeyRound aria-hidden='true' className='size-3.5' />
        {!collapsed && label}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={DIALOG_SIZE.Form}>
        <DialogCloseButton label={t('action.close', { ns: 'shared' })} />
        <DialogHeader>
          <DialogTitle>{t(protectedPanel ? 'title.change' : 'title.set')}</DialogTitle>
          <DialogDescription>{t(protectedPanel ? 'description.change' : 'description.set')}</DialogDescription>
        </DialogHeader>
        {/* The form is mounted per opening: fields and the refusal of the previous attempt do not survive closing. */}
        {open && (
          <AuthPasswordForm
            protectedPanel={protectedPanel}
            onDone={() => {
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
