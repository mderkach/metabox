import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card } from '@shared/ui';

const SECTIONS = ['interception', 'dns', 'outbounds', 'rules'] as const;

export function SimpleRoutesHelp() {
  const { t } = useTranslation('pages/SimpleRoutes');

  return (
    <Card size='sm' className='overflow-visible py-0'>
      <details data-slot='route-help' className='group'>
        <summary className='flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-3 font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden'>
          {t('help.title')}
          <ChevronDown
            aria-hidden
            className='size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-exit) group-open:rotate-180 motion-reduce:transition-none'
          />
        </summary>
        <div className='flex max-w-prose flex-col gap-3 px-3 pb-3 text-muted-foreground'>
          <ol className='list-decimal space-y-1 ps-5'>
            {SECTIONS.map((section) => (
              <li key={section}>
                <strong className='font-medium text-foreground'>{t(`sections.${section}`)}</strong>
                {' — '}
                {t(`help.${section}`)}
              </li>
            ))}
          </ol>
          <p>{t('help.order')}</p>
          <p>{t('help.draft')}</p>
          <Link
            to='/how-it-works'
            className='inline-flex w-fit items-center gap-1 rounded-sm text-primary underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11'
          >
            {t('help.examples')}
            <ArrowRight aria-hidden className='size-4 shrink-0' />
          </Link>
        </div>
      </details>
    </Card>
  );
}
