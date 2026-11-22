import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import type { WalkTerm } from '../model/HowItWorks.terms';

const TERM_LINK_CLASS = 'inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted';

export function HowItWorksTermLink({
  term,
  ruleNumber,
  ruleSetTag,
}: {
  term: WalkTerm;
  ruleNumber?: number;
  ruleSetTag?: string;
}) {
  const { t } = useTranslation('pages/HowItWorks');
  const label = t('terms.configure');

  switch (term) {
    case 'device':
      return (
        <Link to='/devices' className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'service':
      return (
        <Link to='/config/rule-set' search={{ set: ruleSetTag }} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'rule':
      return (
        <Link to='/config' search={{ rule: ruleNumber }} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'outbound':
    case 'server':
      return (
        <Link to='/config/$section' params={{ section: 'outbounds' }} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'group':
      return (
        <Link to='/proxies' className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'subscription':
      return (
        <Link to='/config/$section' params={{ section: 'providers' }} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'core':
      return (
        <Link to='/settings' className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
  }
}
