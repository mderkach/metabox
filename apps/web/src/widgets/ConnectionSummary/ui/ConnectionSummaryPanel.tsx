import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, SECTION_LABEL } from '@shared/ui';

/** Пометку «считает панель» несёт заголовок секции, а не карточка. */
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
          <h3 className={SECTION_LABEL}>{title}</h3>
        ) : (
          <h3>
            <Link
              to={href}
              className='flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
            >
              <span className={SECTION_LABEL}>{title}</span>
              <ArrowUpRight className='size-3.5' aria-hidden='true' />
            </Link>
          </h3>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
