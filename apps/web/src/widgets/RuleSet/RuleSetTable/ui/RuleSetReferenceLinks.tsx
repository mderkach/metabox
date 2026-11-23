import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import type { RuleSetUsage } from '@entities/RuleSet';

export function RuleSetReferenceLinks({ usage }: { usage: readonly RuleSetUsage[] }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');
  const routeRules = usage.filter((item) => item.kind === 'route');
  const dnsRules = usage.filter((item) => item.kind === 'dns');

  return (
    <div>
      <p className='font-medium'>{t('details.usage')}</p>
      {usage.length === 0 && <p>{t('details.unused')}</p>}
      {routeRules.length > 0 && (
        <>
          <p>{t('details.routeRules')}</p>
          <ul className='list-disc pl-5'>
            {routeRules.map((item) => (
              <li key={item.number}>
                <Link
                  to='/config'
                  search={{ rule: item.number }}
                  className='inline-flex items-center text-primary underline max-md:min-h-11'
                >
                  {item.name ?? t('details.rule', { number: item.number })}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {dnsRules.length > 0 && (
        <>
          <p>{t('details.dnsRules')}</p>
          <ul className='list-disc pl-5'>
            {dnsRules.map((item) => (
              <li key={item.number}>
                <Link
                  to='/config/$section'
                  params={{ section: 'dnsRules' }}
                  search={{ node: item.number }}
                  className='inline-flex items-center text-primary underline max-md:min-h-11'
                >
                  {item.name ?? t('details.rule', { number: item.number })}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
