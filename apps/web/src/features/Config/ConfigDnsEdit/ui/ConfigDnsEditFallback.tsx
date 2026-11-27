import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CARD_TITLE } from '@shared/ui';

import { CONFIG_DNS_EDIT_NS } from '../i18n/ConfigDnsEdit.namespace.generated';
import { planDnsFallback, readDnsFallbacks, type DnsFallbackPlan } from '../model/ConfigDnsEdit.fallback';
import { ConfigDnsEditFallbackChain } from './ConfigDnsEditFallbackChain';

export function ConfigDnsEditFallback({
  text,
  version,
  stale,
  stage,
}: {
  text: string;
  version: string | undefined;
  stale: boolean;
  stage: (plan: DnsFallbackPlan) => 'draft' | 'stale' | null;
}) {
  const { t } = useTranslation(CONFIG_DNS_EDIT_NS);
  const [opened, setOpened] = useState(false);
  const model = useMemo(() => (opened ? readDnsFallbacks(text, version) : null), [opened, text, version]);
  return (
    <details
      className='group/fallback border-t pt-3'
      data-slot='route-help'
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className='flex cursor-pointer list-none items-center justify-between gap-2 rounded-md py-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden'>
        <span className={CARD_TITLE}>{t('fallback.title')}</span>
        <ChevronDown
          aria-hidden
          className='size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-exit) group-open/fallback:rotate-180 motion-reduce:transition-none'
        />
      </summary>
      <div className='grid min-w-0 gap-4 pt-2'>
        {model && !model.chains.length && (
          <p className='text-sm text-muted-foreground'>
            {model.problem ? t(`dns.reason.${model.problem}`) : t('fallback.absent')}
          </p>
        )}
        {model?.chains.map((chain) => (
          <ConfigDnsEditFallbackChain
            key={chain.index}
            chain={chain}
            text={text}
            stale={stale}
            onEdit={(edit) => stage(planDnsFallback(text, version, chain.index, edit))}
          />
        ))}
      </div>
    </details>
  );
}
