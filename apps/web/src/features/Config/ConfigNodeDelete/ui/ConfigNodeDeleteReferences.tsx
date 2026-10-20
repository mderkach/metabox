import { useTranslation } from 'react-i18next';

import { CONFIG_REFERENCE, type ConfigReference } from '@entities/Config';

import { toRanges } from '../lib/ConfigNodeDelete.lib';
import { groupNodeReferences } from '../model/ConfigNodeDelete.model';
import { ConfigNodeDeleteGroup } from './ConfigNodeDeleteGroup';

/** The confirmation text: where the tag is still named, rules and nodes of one section gathered in one line. */
export function ConfigNodeDeleteReferences({ references }: { references: readonly ConfigReference[] }) {
  const { t } = useTranslation('features/Config/ConfigNodeDelete');
  const rules = references.flatMap((reference) => (reference.kind === CONFIG_REFERENCE.Rule ? [reference.index] : []));
  const settings = references.flatMap((reference) =>
    reference.kind === CONFIG_REFERENCE.Setting ? [reference.path] : []
  );

  if (references.length === 0) {
    return t('confirm.description');
  }

  return (
    <span className='flex flex-col gap-2'>
      <span>{t('confirm.referenced')}</span>
      <span role='list' className='flex flex-col gap-0.5'>
        {rules.length > 0 && (
          <span role='listitem'>{t('reference.rules', { count: rules.length, list: toRanges(rules) })}</span>
        )}
        {groupNodeReferences(references).map((group) => (
          <ConfigNodeDeleteGroup key={group.section} group={group} />
        ))}
        {settings.map((path) => (
          <span key={path} role='listitem' className='break-all'>
            {t('reference.setting', { path })}
          </span>
        ))}
      </span>
      <span>{t('confirm.broken')}</span>
    </span>
  );
}
