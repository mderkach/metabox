import { Plus } from 'lucide-react';
import { use, type Ref } from 'react';

import { Button, DialogTrigger } from '@shared/ui';

import { ConfigNodeAddDialogContext } from './ConfigNodeAddDialog.context';

export function ConfigNodeAddDialogTrigger({
  label,
  primary = false,
  ref,
}: {
  label: string;
  primary?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const handle = use(ConfigNodeAddDialogContext);

  return (
    <DialogTrigger
      ref={ref}
      handle={handle}
      render={<Button size='default' variant={primary ? 'default' : 'outline'} />}
    >
      <Plus data-icon='inline-start' />
      {label}
    </DialogTrigger>
  );
}
