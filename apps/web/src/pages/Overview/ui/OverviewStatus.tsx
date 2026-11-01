import { useTranslation } from 'react-i18next';

import { CARD_FLUSH, Card } from '@shared/ui';
import { DaemonServiceControl } from '@widgets/Daemon/DaemonService';

import { OverviewCheck } from './OverviewCheck';
import { OverviewNode } from './OverviewNode';

/**
 * What the screen is opened for, in one strip: the service with its commands,
 * the node the traffic leaves through and a check on demand. The verdict in
 * the header says what is wrong, this strip is where it is fixed.
 */
export function OverviewStatus({ onAnnounce }: { onAnnounce: (message: string) => void }) {
  const { t } = useTranslation('pages/Overview');

  return (
    <section aria-label={t('status.label')}>
      <Card className={CARD_FLUSH}>
        <div className='grid gap-px bg-border lg:grid-cols-3'>
          <div className='bg-card p-4'>
            <DaemonServiceControl />
          </div>
          <div className='bg-card p-4'>
            <OverviewNode onSelected={onAnnounce} />
          </div>
          <div className='bg-card p-4'>
            <OverviewCheck onChecked={onAnnounce} />
          </div>
        </div>
      </Card>
    </section>
  );
}
