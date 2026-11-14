import { getRouteApi } from '@tanstack/react-router';

import { isGenericSection } from '@entities/Config';

import { SectionNodes } from './SectionNodes';

const routeApi = getRouteApi('/config/$section');

export function SectionPage() {
  const { section } = routeApi.useParams();
  // The node number from the address opens the node: the Apply summary leads here to it.
  const { node } = routeApi.useSearch();

  // A foreign section name was already cut off by the route; the check here only narrows the type.
  if (!isGenericSection(section)) {
    return null;
  }

  // The section is in the key: the panel and what is typed in the add form belong to their own
  // section and do not move to a neighboring one.
  return <SectionNodes key={section} section={section} requestedNode={node} />;
}
