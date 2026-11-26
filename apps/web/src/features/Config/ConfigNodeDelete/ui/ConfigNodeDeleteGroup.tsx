import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';

import { CONFIG_NODE_DELETE_NS } from '../i18n/ConfigNodeDelete.namespace.generated';
import type { NodeReferenceGroup } from '../model/ConfigNodeDelete.model';

/** Names shown in a group line before "and N more". */
const SHOWN_NAMES = 4;

export function ConfigNodeDeleteGroup({ group }: { group: NodeReferenceGroup }) {
  const { t } = useTranslation(CONFIG_NODE_DELETE_NS);
  const shown = group.names.slice(0, SHOWN_NAMES).join(', ');
  const rest = group.names.length - SHOWN_NAMES;
  const names = rest > 0 ? t('reference.more', { names: shown, count: rest }) : shown;

  return (
    <span role='listitem'>
      {group.names.length === 1
        ? t('reference.node', { kind: t(`nodeKind.${group.section}`, { ns: SHARED_NS }), names })
        : t('reference.nodes', { kind: t(`kinds.${group.section}`), names })}
    </span>
  );
}
