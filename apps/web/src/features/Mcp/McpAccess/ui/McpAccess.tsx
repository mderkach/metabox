import { Plug } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMcp } from '@entities/Mcp';
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

import { McpAccessBody } from './McpAccessBody';

/**
 * MCP access button with its dialog. Hidden while the daemon has not answered about MCP:
 * an older daemon without the endpoint has nothing to switch.
 */
export function McpAccess({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation('features/Mcp/McpAccess');
  const mcp = useMcp();
  const [open, setOpen] = useState(false);

  if (!mcp.isSuccess) {
    return null;
  }

  const label = t('trigger');

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
        <Plug aria-hidden='true' className='size-3.5' />
        {!collapsed && label}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={DIALOG_SIZE.List}>
        <DialogCloseButton label={t('action.close', { ns: 'shared' })} />
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t(mcp.data.enabled ? 'description.on' : 'description.off')}</DialogDescription>
        </DialogHeader>
        {open && (
          <McpAccessBody
            enabled={mcp.data.enabled}
            endpoint={mcp.data.endpoint}
            permissions={mcp.data.permissions}
            onDone={() => {
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
