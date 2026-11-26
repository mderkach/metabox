import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SHORTCUT } from '@shared/lib/shortcuts';
import { Button, ShortcutKbd } from '@shared/ui';

import { SECTION_NS } from '../i18n/Section.namespace.generated';

export function SectionAddButton({ adding, onAdd }: { adding: boolean; onAdd: () => void }) {
  const { t } = useTranslation(SECTION_NS);

  return (
    <Button variant='outline' size='sm' aria-expanded={adding} aria-keyshortcuts={SHORTCUT.Add} onClick={onAdd}>
      <Plus data-icon='inline-start' />
      {t('add.open')}
      <ShortcutKbd shortcut={SHORTCUT.Add} />
    </Button>
  );
}
