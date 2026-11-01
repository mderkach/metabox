import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { CARD_TITLE, Card, CardContent, CardHeader } from '@shared/ui';

/** The "panel computes" mark is carried by the section title, not the card. */
export function ConnectionSummaryPanel({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <Card className='gap-3'>
      <CardHeader>
        {href === undefined ? (
          <h3 className={CARD_TITLE}>{title}</h3>
        ) : (
          <h3>
            <Link
              to={href}
              className='flex w-fit items-center gap-1 transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11'
            >
              <span className={CARD_TITLE}>{title}</span>
              <ArrowUpRight className='size-3.5 text-muted-foreground' aria-hidden='true' />
            </Link>
          </h3>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
