import type { RuleSetReferenceLink } from '@entities/RuleSet';
import type { PageLink } from '@shared/lib/navigation';

export interface RuleSetLinks {
  reference: RuleSetReferenceLink;
  byTag: (tag: string) => PageLink;
}
