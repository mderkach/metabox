import { useTranslation } from 'react-i18next';

import type { NodeReferenceGroup } from '../model/ConfigNodeDelete.model';

/** Names shown in a group line before "and N more". */
const SHOWN_NAMES = 4;

export function ConfigNodeDeleteGroup({ group }: { group: NodeReferenceGroup }) {
  const { t } = useTranslation('features/Config/ConfigNodeDelete');
  const shown = group.names.slice(0, SHOWN_NAMES).join(', ');
  const rest = group.names.length - SHOWN_NAMES;
  const names = rest > 0 ? t('reference.more', { names: shown, count: rest }) : shown;

  return (
    <span role='listitem'>
      {group.names.length === 1
        ? t('reference.node', { kind: t(`nodeKind.${group.section}`, { ns: 'shared' }), names })
        : t('reference.nodes', { kind: t(`kinds.${group.section}`), names })}
    </span>
  );
}
