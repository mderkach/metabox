import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useConfigCurrent } from '@entities/Config';
import { FieldGroup } from '@shared/ui';

import type { ConnectionLinkModel } from '../model/ConfigNodeAdd.schema';
import { SUBSCRIPTION_GROUP, subscriptionGroups } from '../model/ConfigNodeAdd.subscription';
import { ConfigNodeAddLinkInput } from './ConfigNodeAddLinkInput';
import { ConfigNodeAddLinkSelect } from './ConfigNodeAddLinkSelect';
import { ConfigNodeAddSubscriptionAgent } from './ConfigNodeAddSubscriptionAgent';
import { ConfigNodeAddSubscriptionInterval } from './ConfigNodeAddSubscriptionInterval';

export function ConfigNodeAddSubscriptionFields() {
  const { t } = useTranslation('features/Config/ConfigNodeAdd');
  const { control } = useFormContext<ConnectionLinkModel>();
  const group = useWatch({ control, name: 'group' });
  const { explicit, automatic } = subscriptionGroups(useConfigCurrent() ?? '{}');

  return (
    <FieldGroup className='min-w-0 gap-3 motion-safe:animate-in motion-safe:fade-in'>
      <ConfigNodeAddLinkInput name='tag' label={t('subscription.tag')} />
      <ConfigNodeAddLinkSelect
        name='group'
        label={t('subscription.group')}
        items={[
          { value: SUBSCRIPTION_GROUP.None, label: t('subscription.noGroup') },
          ...explicit,
          { value: SUBSCRIPTION_GROUP.New, label: t('subscription.newGroup') },
        ]}
      />
      <p className='text-xs text-pretty text-muted-foreground'>
        {t(automatic ? 'subscription.automaticGroup' : 'subscription.groupHint')}
      </p>
      {group === SUBSCRIPTION_GROUP.New && (
        <div className='motion-safe:animate-in motion-safe:fade-in'>
          <ConfigNodeAddLinkInput name='groupName' label={t('subscription.groupName')} />
        </div>
      )}
      <ConfigNodeAddSubscriptionInterval />
      <ConfigNodeAddSubscriptionAgent />
    </FieldGroup>
  );
}
