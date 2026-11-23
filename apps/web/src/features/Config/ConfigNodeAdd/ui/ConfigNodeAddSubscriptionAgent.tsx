import { Info } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@shared/ui';

import type { ConnectionLinkModel } from '../model/ConfigNodeAdd.schema';
import { SUBSCRIPTION_AGENTS, SUBSCRIPTION_AGENT_PROFILES } from '../model/ConfigNodeAdd.subscription';
import { ConfigNodeAddSubscriptionInput } from './ConfigNodeAddSubscriptionInput';
import { ConfigNodeAddSubscriptionSelect } from './ConfigNodeAddSubscriptionSelect';

export function ConfigNodeAddSubscriptionAgent() {
  const { t } = useTranslation('features/Config/ConfigNodeAdd');
  const { control, setValue } = useFormContext<ConnectionLinkModel>();
  const agent = useWatch({ control, name: 'agent' });

  return (
    <div className='flex flex-col gap-2'>
      <ConfigNodeAddSubscriptionSelect
        name='agent'
        label={t('subscription.agent')}
        help={
          <Popover>
            <PopoverTrigger
              aria-label={t('subscription.agentHelpLabel')}
              render={<Button type='button' variant='outline' size='icon-xs' className='rounded-full' />}
            >
              <Info aria-hidden />
            </PopoverTrigger>
            <PopoverContent
              aria-label={t('subscription.agentHelpLabel')}
              className='max-w-[calc(100vw-2rem)] text-sm text-pretty'
            >
              {t('subscription.agentHelp')}
            </PopoverContent>
          </Popover>
        }
        items={SUBSCRIPTION_AGENT_PROFILES.map((value) => ({ value, label: t(`subscription.${value}`) }))}
        onChange={(value) => {
          const example = SUBSCRIPTION_AGENTS.get(value);
          if (example !== undefined) setValue('agentValue', example, { shouldValidate: true });
        }}
      />
      {agent !== 'defaultAgent' && (
        <div className='motion-safe:animate-in motion-safe:fade-in'>
          <ConfigNodeAddSubscriptionInput
            name='agentValue'
            label={t('subscription.agentValue')}
            onChange={() => {
              if (agent !== 'customAgent') setValue('agent', 'customAgent');
            }}
          />
        </div>
      )}
    </div>
  );
}
