import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SHORTCUT } from '@shared/lib/shortcuts';
import { Button, ShortcutKbd } from '@shared/ui';

export function SectionAddButton({ adding, onAdd }: { adding: boolean; onAdd: () => void }) {
  const { t } = useTranslation('pages/Section');

  return (
    <Button variant='outline' size='sm' aria-expanded={adding} aria-keyshortcuts={SHORTCUT.Add} onClick={onAdd}>
      <Plus data-icon='inline-start' />
      {t('add.open')}
      <ShortcutKbd shortcut={SHORTCUT.Add} />
    </Button>
  );
}
