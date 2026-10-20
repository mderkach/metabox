import { Trans, useTranslation } from 'react-i18next';

import { CONFIG_CHANGE, type ConfigChange } from '@entities/Config';

import { toSectionLink, toValueText } from '../lib/ConfigApply.lib';
import { ConfigApplySectionLink } from './ConfigApplySectionLink';

export function ConfigApplyChangeItem({ change, onNavigate }: { change: ConfigChange; onNavigate: () => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const target = change.section === null ? null : toSectionLink(change.section);

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
            components={{ node: <ConfigApplySectionLink link={target} onNavigate={onNavigate} /> }}
          />
        ) : (
          <Trans
            t={t}
            i18nKey='changes.setting'
            values={{ path: change.path, from, to }}
            components={{ node: <ConfigApplySectionLink link={target} onNavigate={onNavigate} /> }}
          />
        )}
      </li>
    );
  }

  const kind = t(`nodeKind.${change.section}`, { ns: 'shared' });

  return (
    <li>
      {change.kind === CONFIG_CHANGE.Changed ? (
        <Trans
          t={t}
          i18nKey='changes.changed'
          values={{ kind, name: change.name, fields: change.fields.join(', ') }}
          components={{ node: <ConfigApplySectionLink link={target} onNavigate={onNavigate} /> }}
        />
      ) : (
        <Trans
          t={t}
          i18nKey={change.kind === CONFIG_CHANGE.Added ? 'changes.added' : 'changes.removed'}
          values={{ kind, name: change.name }}
          components={{ node: <ConfigApplySectionLink link={target} onNavigate={onNavigate} /> }}
        />
      )}
    </li>
  );
}
