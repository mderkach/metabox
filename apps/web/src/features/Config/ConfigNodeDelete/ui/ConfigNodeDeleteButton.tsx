import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  selectConfigCurrent,
  ConfigDocumentState,
  ConfigDocumentStore,
  findReferences,
  sectionNodePath,
  type ConfigReference,
  type GenericSection,
} from '@entities/Config';
import { showQueryError } from '@shared/api';
import { SHARED_NS } from '@shared/i18n';
import { Button, ConfirmDialog } from '@shared/ui';

import { CONFIG_NODE_DELETE_NS } from '../i18n/ConfigNodeDelete.namespace.generated';
import { ConfigNodeDeleteReferences } from './ConfigNodeDeleteReferences';

/**
 * Deleting a list node from the draft after a confirmation that names what
 * still points to its tag, read when the dialog opens. References do not block
 * it: the text mode would allow it anyway, and `sing-box check` stops such a
 * config on Apply.
 */
export function ConfigNodeDeleteButton({
  section,
  index,
  name,
  tag,
  onDeleted,
}: {
  section: GenericSection;
  index: number;
  name: string;
  /** `''` means the node has no tag and nothing can point to it. */
  tag: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation(CONFIG_NODE_DELETE_NS);
  const remove = ConfigDocumentState.use.remove();
  const [references, setReferences] = useState<readonly ConfigReference[]>([]);

  return (
    <ConfirmDialog
      trigger={
        <Button variant='ghost' size='icon-sm' aria-label={t('remove', { name })}>
          <Trash2 />
        </Button>
      }
      title={t('confirm.title', { name })}
      description={<ConfigNodeDeleteReferences references={references} />}
      cancelLabel={t('action.cancel', { ns: SHARED_NS })}
      confirmLabel={t('confirm.action')}
      destructive
      onOpenChange={(open) => {
        if (open) {
          setReferences(findReferences(selectConfigCurrent(ConfigDocumentStore.getState()) ?? '', tag));
        }
      }}
      onConfirm={() => {
        if (!remove(sectionNodePath(section, index))) {
          showQueryError({ showError: true, errorMessageKey: 'toast.config.edit.failed' }, null);

          return;
        }

        onDeleted();
      }}
    />
  );
}
