import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { CONFIG_SECTION } from '@entities/Config';
import type { RuleEditorSearch } from '@entities/Route';

import { HOW_IT_WORKS_NS } from '../i18n/HowItWorks.namespace.generated';
import type { HowItWorksTermLinks } from '../model/HowItWorks.links';
import type { WalkTerm } from '../model/HowItWorks.terms';

const TERM_LINK_CLASS = 'inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted';

export function HowItWorksTermLink({
  links,
  term,
  ruleSearch,
  ruleSetTag,
}: {
  links: HowItWorksTermLinks;
  term: WalkTerm;
  ruleSearch?: RuleEditorSearch;
  ruleSetTag?: string;
}) {
  const { t } = useTranslation(HOW_IT_WORKS_NS);
  const label = t('terms.configure');

  switch (term) {
    case 'device':
      return (
        <Link to={links.devices} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'service':
      return (
        <Link {...links.ruleSet(ruleSetTag)} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'rule':
      return (
        <Link {...links.rule(ruleSearch ?? {})} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'outbound':
    case 'server':
      return (
        <Link {...links.section(CONFIG_SECTION.Outbounds)} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'group':
      return (
        <Link to={links.proxies} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'subscription':
      return (
        <Link {...links.section(CONFIG_SECTION.Providers)} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
    case 'core':
      return (
        <Link to={links.settings} className={TERM_LINK_CLASS}>
          {label}
        </Link>
      );
  }
}
