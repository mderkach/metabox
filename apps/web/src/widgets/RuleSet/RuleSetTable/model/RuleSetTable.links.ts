import type { RuleSetUsage } from '@entities/RuleSet';
import type { PageLink } from '@shared/lib/navigation';

export interface RuleSetLinks {
  reference: (usage: RuleSetUsage) => PageLink;
  byTag: (tag: string) => PageLink;
}
