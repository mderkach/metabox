import { isGenericSection } from '@entities/Config';

import { SectionNodes } from './SectionNodes';

export function SectionPage({ section, node }: { section: string; node?: number }) {
  // A foreign section name was already cut off by the route; the check here only narrows the type.
  if (!isGenericSection(section)) {
    return null;
  }

  // The section is in the key: the panel and what is typed in the add form belong to their own
  // section and do not move to a neighboring one.
  return <SectionNodes key={section} section={section} requestedNode={node} />;
}
