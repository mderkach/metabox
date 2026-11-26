import type { GenericSection } from '@entities/Config';
import type { RuleEditorSearch } from '@entities/Route';
import type { StaticPagePath, PageLink } from '@shared/lib/navigation';

export interface HowItWorksTermLinks {
  devices: StaticPagePath;
  proxies: StaticPagePath;
  settings: StaticPagePath;
  ruleSet: (set?: string) => PageLink;
  rule: (search: RuleEditorSearch) => PageLink;
  section: (section: GenericSection) => PageLink;
}

export interface HowItWorksLinks extends HowItWorksTermLinks {
  overview: StaticPagePath;
}
