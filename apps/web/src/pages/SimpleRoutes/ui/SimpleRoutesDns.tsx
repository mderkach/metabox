import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDnsEdit } from '@features/Config/ConfigDnsEdit';
import { Card } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import { SimpleRoutesSection } from './SimpleRoutesSection';

export function SimpleRoutesDns({
  text,
  servers,
  rules,
  final,
}: {
  text: string;
  servers: number;
  rules: number;
  final?: string;
}) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const [opened, setOpened] = useState(false);

  return (
    <SimpleRoutesSection section='dns'>
      <Card size='sm' className='py-0'>
        <details
          className='group'
          data-slot='route-help'
          onToggle={(event) => {
            if (event.currentTarget.open) setOpened(true);
          }}
        >
          <summary className='flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-3 font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden'>
            {t('dns.settings')}
            <ChevronDown
              aria-hidden
              className='size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-exit) group-open:rotate-180 motion-reduce:transition-none'
            />
          </summary>
          <div className='grid min-w-0 gap-4 px-3 pb-3 text-sm'>
            <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs wrap-anywhere text-muted-foreground'>
              <span>{t('dns.servers', { count: servers })}</span>
              <span>{t('dns.rules', { count: rules })}</span>
              <span>
                {final !== undefined && final !== '' ? t('dns.final', { tag: final }) : t('dns.finalUnknown')}
              </span>
            </div>
            {opened && <ConfigDnsEdit text={text} />}
          </div>
        </details>
      </Card>
    </SimpleRoutesSection>
  );
}
