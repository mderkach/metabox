import { Link } from '@tanstack/react-router';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import type { PageLink } from '@shared/lib/navigation';

import { RULE_SET_NS } from '../i18n/RuleSet.namespace.generated';
import type { RuleSetUsage } from '../model/RuleSet.model';

export type RuleSetReferenceLink = (usage: RuleSetUsage) => PageLink;

export function RuleSetReferenceLinks({
  usage,
  referenceLink,
}: {
  usage: readonly RuleSetUsage[];
  referenceLink: RuleSetReferenceLink;
}) {
  const { t } = useTranslation(RULE_SET_NS);
  const groups = [
    { kind: 'route', label: 'details.routeRules' },
    { kind: 'dns', label: 'details.dnsRules' },
  ] as const;

  return (
    <div>
      <p className='font-medium'>{t('details.usage')}</p>
      {usage.length === 0 && <p>{t('details.unused')}</p>}
      {groups.map(({ kind, label }) => {
        const rules = usage.filter((item) => item.kind === kind);
        return (
          rules.length > 0 && (
            <Fragment key={kind}>
              <p>{t(label)}</p>
              <ul className='list-disc pl-5'>
                {rules.map((item) => (
                  <li key={item.number}>
                    <Link
                      {...referenceLink(item)}
                      className='inline-flex items-center text-primary underline max-md:min-h-11'
                    >
                      {item.name ?? t('details.rule', { number: item.number })}
                    </Link>
                  </li>
                ))}
              </ul>
            </Fragment>
          )
        );
      })}
    </div>
  );
}
