import { useTranslation } from 'react-i18next';

import type { RuleSetDescription } from '@entities/RuleSet';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';

export function RuleSetSourceDetails({ description }: { description: RuleSetDescription }) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);

  return (
    <div>
      {(description.kind === 'geosite' || description.kind === 'geoip') && (
        <>
          <p>
            {t(`details.${description.kind}`, { provider: description.providerName, category: description.category })}
          </p>
          {description.mirrorHost !== null && <p>{t('details.mirror', { host: description.mirrorHost })}</p>}
        </>
      )}
      {description.kind === 'remote' && (
        <p>
          {description.host === null ? t('details.remoteUnknown') : t('details.remote', { host: description.host })}
        </p>
      )}
      {description.kind === 'local' && <p>{t('details.local', { path: description.path })}</p>}
      {description.kind === 'inline' && <p>{t('details.inline')}</p>}
      {'fileName' in description && description.fileName !== null && (
        <p>{t('details.file', { name: description.fileName })}</p>
      )}
    </div>
  );
}
