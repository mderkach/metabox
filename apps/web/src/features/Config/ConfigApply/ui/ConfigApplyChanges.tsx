import { useTranslation } from 'react-i18next';

import { CONFIG_APPLY_NS } from '../i18n/ConfigApply.namespace.generated';
import { useConfigChanges } from '../lib/ConfigApply.lib';
import type { ConfigApplyNavigation } from '../model/ConfigApply.link';
import { ConfigApplyChangeItem } from './ConfigApplyChangeItem';

/** Summary lines before "and N more": the rest is read in the text of the changes. */
const SHOWN_CHANGES = 8;

/** Nodes and parameters that change, named in words: the text diff is folded under it. */
export function ConfigApplyChanges({ onNavigate, ChangeLink }: ConfigApplyNavigation & { onNavigate: () => void }) {
  const { t } = useTranslation(CONFIG_APPLY_NS);
  const changes = useConfigChanges();

  if (changes.length === 0) return null;

  const rest = changes.length - SHOWN_CHANGES;

  return (
    <ul aria-label={t('changes.label')} className='flex flex-col gap-0.5 text-sm'>
      {changes.slice(0, SHOWN_CHANGES).map((change) => (
        <ConfigApplyChangeItem
          key={`${change.kind}:${change.section ?? ''}:${'name' in change ? change.name : change.path}`}
          ChangeLink={ChangeLink}
          change={change}
          onNavigate={onNavigate}
        />
      ))}
      {rest > 0 && <li className='text-muted-foreground'>{t('changes.more', { count: rest })}</li>}
    </ul>
  );
}
