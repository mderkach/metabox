import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import type { SectionLink } from '../lib/ConfigApply.lib';

const LINK_CLASS =
  'rounded-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/** Leads from the summary to the screen of the edit; `onNavigate` closes the dialog on the way. */
export function ConfigApplySectionLink({
  link,
  search,
  onNavigate,
  children,
}: {
  link: SectionLink | null;
  search?: { rule: number };
  onNavigate: () => void;
  children?: ReactNode;
}) {
  if (link === null) {
    return <span className='font-mono'>{children}</span>;
  }

  return (
    <Link {...link} search={search} className={LINK_CLASS} onClick={onNavigate}>
      {children}
    </Link>
  );
}
