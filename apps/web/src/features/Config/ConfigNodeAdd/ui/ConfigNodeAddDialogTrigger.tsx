import { Plus } from 'lucide-react';
import { use, type Ref } from 'react';

import { Button, DialogTrigger } from '@shared/ui';

import { ConfigNodeAddDialogContext } from './ConfigNodeAddDialog.context';

export function ConfigNodeAddDialogTrigger({
  label,
  detached = false,
  primary = false,
  ref,
}: {
  label: string;
  detached?: boolean;
  primary?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const dialog = use(ConfigNodeAddDialogContext);
  if (detached && dialog?.ready !== true) return null;

  return (
    <DialogTrigger
      ref={ref}
      handle={dialog?.handle}
      render={<Button size='default' variant={primary ? 'default' : 'outline'} />}
    >
      <Plus data-icon='inline-start' />
      {label}
    </DialogTrigger>
  );
}
