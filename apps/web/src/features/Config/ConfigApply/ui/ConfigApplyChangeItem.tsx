import { Trans, useTranslation } from 'react-i18next';

import { CONFIG_CHANGE, type ConfigChange } from '@entities/Config';
import { SHARED_NS } from '@shared/i18n';

import { CONFIG_APPLY_NS } from '../i18n/ConfigApply.namespace.generated';
import { toValueText } from '../lib/ConfigApply.lib';
import type { ConfigApplyNavigation } from '../model/ConfigApply.link';

export function ConfigApplyChangeItem({
  change,
  onNavigate,
  ChangeLink,
}: ConfigApplyNavigation & { change: ConfigChange; onNavigate: () => void }) {
  const { t } = useTranslation(CONFIG_APPLY_NS);
  const node = change.kind === CONFIG_CHANGE.Added || change.kind === CONFIG_CHANGE.Changed ? change.index : undefined;
  const target = { section: change.section, node };

  if (change.kind === CONFIG_CHANGE.Setting) {
    const from = toValueText(change.from);
    const to = toValueText(change.to);

    return (
      <li>
        {from === null || to === null ? (
          <Trans
            t={t}
            i18nKey='changes.settingChanged'
            values={{ path: change.path }}
            components={{ node: <ChangeLink target={target} onNavigate={onNavigate} /> }}
          />
        ) : (
          <Trans
            t={t}
            i18nKey='changes.setting'
            values={{ path: change.path, from, to }}
            components={{ node: <ChangeLink target={target} onNavigate={onNavigate} /> }}
          />
        )}
      </li>
    );
  }

  const kind = t(`nodeKind.${change.section}`, { ns: SHARED_NS });

  return (
    <li>
      {change.kind === CONFIG_CHANGE.Changed ? (
        <Trans
          t={t}
          i18nKey='changes.changed'
          values={{ kind, name: change.name, fields: change.fields.join(', ') }}
          components={{ node: <ChangeLink target={target} onNavigate={onNavigate} /> }}
        />
      ) : (
        <Trans
          t={t}
          i18nKey={change.kind === CONFIG_CHANGE.Added ? 'changes.added' : 'changes.removed'}
          values={{ kind, name: change.name }}
          components={{ node: <ChangeLink target={target} onNavigate={onNavigate} /> }}
        />
      )}
    </li>
  );
}
