import { linkOptions } from '@tanstack/react-router';

import { CONFIG_SECTION } from '@entities/Config';
import type { RuleSetLinks } from '@widgets/RuleSet/RuleSetTable';

export const RULE_SET_LINKS: RuleSetLinks = {
  byTag: (tag) => linkOptions({ to: '/config', search: { rule_set: tag } }),
  reference: (usage) =>
    usage.kind === 'route'
      ? linkOptions({ to: '/config', search: { rule: usage.number } })
      : linkOptions({
          to: '/config/$section',
          params: { section: CONFIG_SECTION.DnsRules },
          search: { node: usage.number },
        }),
};
