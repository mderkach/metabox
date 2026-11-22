import { useTranslation } from 'react-i18next';

import type { WalkGroup } from '../model/HowItWorks.model';

export function HowItWorksGroup({ group }: { group: WalkGroup }) {
  const { t } = useTranslation('pages/HowItWorks');
  const method = group.type?.toLowerCase();

  return (
    <div className='mt-2 grid gap-1 rounded-md border p-2 text-xs'>
      <span className='font-mono wrap-anywhere'>{group.tag}</span>
      {method === 'selector' && <span>{t('group.selector')}</span>}
      {method === 'urltest' && <span>{t('group.urltest')}</span>}
      {group.picked !== null && <span className='wrap-anywhere'>{t('group.picked', { tag: group.picked })}</span>}
      {group.group !== null && <HowItWorksGroup group={group.group} />}
    </div>
  );
}
