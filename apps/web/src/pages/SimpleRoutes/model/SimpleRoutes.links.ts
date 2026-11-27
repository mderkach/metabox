import type { RuleSetReferenceLink } from '@entities/RuleSet';
import type { StaticPagePath, PageLink } from '@shared/lib/navigation';

export interface SimpleRoutesLinks {
  self: StaticPagePath;
  help: StaticPagePath;
  proxies: StaticPagePath;
  providers: PageLink;
  rule: (rule: number) => PageLink;
}

export interface SimpleRuleNavigation {
  links: Pick<SimpleRoutesLinks, 'self' | 'rule'>;
  referenceLink: RuleSetReferenceLink;
  onOutboundChange: (outbound: string | undefined) => void;
}
