import { useTranslation } from 'react-i18next';

import { CARD_FLUSH, Card } from '@shared/ui';
import { DaemonServiceControl } from '@widgets/Daemon/DaemonService';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { OverviewLinks } from '../model/Overview.links';
import { OverviewCheck } from './OverviewCheck';

/**
 * What the screen is opened for, in one strip: the service with its commands,
 * plus a check on demand.
 */
export function OverviewStatus({
  links,
  onAnnounce,
}: {
  links: Pick<OverviewLinks, 'diagnostics'>;
  onAnnounce: (message: string) => void;
}) {
  const { t } = useTranslation(OVERVIEW_NS);

  return (
    <section aria-label={t('status.label')}>
      <Card className={CARD_FLUSH}>
        <div className='grid gap-px bg-border lg:grid-cols-2'>
          <div className='bg-card p-4'>
            <DaemonServiceControl heading='h2' emphasizeRestart showStatus={false} />
          </div>
          <div className='bg-card p-4'>
            <OverviewCheck diagnosticsTo={links.diagnostics} onChecked={onAnnounce} />
          </div>
        </div>
      </Card>
    </section>
  );
}
