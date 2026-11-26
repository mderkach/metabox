import type { StaticPagePath, PageLink } from '@shared/lib/navigation';
import type { RuleSetLinks } from '@widgets/RuleSet/RuleSetTable';

export interface SimpleRoutesLinks {
  self: StaticPagePath;
  help: StaticPagePath;
  proxies: StaticPagePath;
  providers: PageLink;
  rule: (rule: number) => PageLink;
}

export interface SimpleRuleNavigation {
  links: Pick<SimpleRoutesLinks, 'self' | 'rule'>;
  referenceLink: RuleSetLinks['reference'];
  onOutboundChange: (outbound: string | undefined) => void;
}
