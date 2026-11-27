import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConfigDocument } from '@entities/Config';
import { ACL_MODE, useDataplane } from '@entities/Dataplane';
import { DeviceRouteScope } from '@features/Device/DeviceRoute';
import { Card } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import { SimpleRoutesProxyAccess } from './SimpleRoutesProxyAccess';
import { SimpleRoutesSection } from './SimpleRoutesSection';

export function SimpleRoutesInterception({
  inbounds,
  appliedConfig,
}: {
  inbounds: number;
  appliedConfig: ConfigDocument | null;
}) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const [opened, setOpened] = useState(false);
  const dataplane = useDataplane();
  const model = dataplane.data?.model;

  function interceptionStatus(): string {
    if (model === undefined) return t('interception.unknown');
    if (!model.enabled) return t('interception.disabled');
    if (model.aclMode === ACL_MODE.All) return t('interception.all');
    if (model.aclMode === ACL_MODE.Listed) return t('interception.listed');

    return t('interception.scopeUnknown');
  }

  return (
    <SimpleRoutesSection section='interception'>
      <Card size='sm' className='py-0'>
        <details
          className='group/settings'
          data-slot='route-help'
          onToggle={(event) => {
            if (event.currentTarget.open) setOpened(true);
          }}
        >
          <summary className='flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden'>
            <span className='grid gap-0.5'>
              <span className='font-medium'>{t('interception.settings')}</span>
              <span className='text-xs text-muted-foreground'>{interceptionStatus()}</span>
            </span>
            <ChevronDown
              aria-hidden
              className='size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-exit) group-open/settings:rotate-180 motion-reduce:transition-none'
            />
          </summary>
          <div className='@container grid min-w-0 gap-4 border-t px-3 py-3 text-sm'>
            <div className='grid min-w-0 gap-4 @2xl:grid-cols-2'>
              <section className='grid min-w-0 content-start gap-3'>
                <div className='grid gap-1'>
                  <h3 className='font-semibold'>{t('interception.automatic')}</h3>
                  <p className='max-w-prose text-pretty text-muted-foreground'>{t('interception.description')}</p>
                </div>
                {opened && <DeviceRouteScope />}
              </section>
              <SimpleRoutesProxyAccess config={appliedConfig} />
            </div>
            <p className='text-xs text-muted-foreground'>{t('interception.inbounds', { count: inbounds })}</p>
          </div>
        </details>
      </Card>
    </SimpleRoutesSection>
  );
}
