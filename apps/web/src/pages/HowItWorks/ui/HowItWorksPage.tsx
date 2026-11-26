import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConnectionStream } from '@entities/Connection';
import { SERVICE_STATUS, toConfirmedStatus, useRuntimeStream, useServiceState } from '@entities/Daemon';
import { useDeviceIndex } from '@entities/Device';
import { useProxies, useProxyProviders } from '@entities/Proxy';
import { useNarrowScreen } from '@shared/lib/media';
import { QueryFailure } from '@shared/ui';

import { HOW_IT_WORKS_NS } from '../i18n/HowItWorks.namespace.generated';
import { useHowItWorksLive } from '../lib/HowItWorks.live';
import { useHowItWorksRule } from '../lib/HowItWorks.rule';
import type { HowItWorksLinks } from '../model/HowItWorks.links';
import { toConnectionWalk } from '../model/HowItWorks.model';
import type { WalkTerm } from '../model/HowItWorks.terms';
import { HowItWorksChoices } from './HowItWorksChoices';
import { HowItWorksTermPanel } from './HowItWorksTermPanel';
import { HowItWorksTerms } from './HowItWorksTerms';
import { HowItWorksWalk } from './HowItWorksWalk';

export function HowItWorksPage({ links }: { links: HowItWorksLinks }) {
  const { t } = useTranslation(HOW_IT_WORKS_NS);
  useConnectionStream();
  useRuntimeStream();
  const service = useServiceState();
  const status = service.data === undefined ? null : toConfirmedStatus(service.data);
  const stopped = status === SERVICE_STATUS.Stopped || status === SERVICE_STATUS.Failed;
  const live = useHowItWorksLive(!stopped);
  const verifiedRule = useHowItWorksRule(stopped ? null : (live.query.data?.match.appliedRule ?? null));
  const proxies = useProxies();
  const providers = useProxyProviders();
  const devices = useDeviceIndex();
  const narrow = useNarrowScreen();
  const [selected, setSelected] = useState<{ term: WalkTerm; source: 'step' | 'glossary' }>({
    term: 'outbound',
    source: 'step',
  });
  const walk =
    stopped || live.row === undefined || live.query.data === undefined
      ? null
      : toConnectionWalk({
          row: live.row,
          explanation: live.query.data,
          groups: proxies.data?.groups,
          providers: providers.data,
          devices,
          verifiedRule,
        });
  const showFailure = live.query.isLoadingError && !live.discontinued;
  const inline = narrow && !stopped && !showFailure && selected.source === 'step';
  const pending = live.waitingForFrame || (live.row !== undefined && live.query.isPending);
  const target = walk?.rule.verified;

  return (
    <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-6'>
      <header className='grid gap-1'>
        <h1 className='text-xl font-semibold'>{t('title')}</h1>
        <p className='max-w-prose text-sm text-muted-foreground'>{t('intro')}</p>
      </header>

      {stopped ? (
        <section className='grid justify-items-start gap-2 rounded-lg border bg-card p-4'>
          <p role='status' className='text-sm'>
            {t(status === SERVICE_STATUS.Failed ? 'failed' : 'stopped')}
          </p>
          <Link to={links.overview} className='inline-flex min-h-11 items-center text-sm text-primary underline'>
            {t('overview')}
          </Link>
        </section>
      ) : (
        <section className='grid min-w-0 gap-3'>
          <HowItWorksChoices
            candidates={live.candidates}
            selected={live.kind}
            onSelect={live.select}
            onRefresh={live.refresh}
          />
          {live.waitingForFrame && (
            <p role='status' className='text-sm text-muted-foreground'>
              {t('loading')}
            </p>
          )}
          {!live.waitingForFrame && live.row === undefined && (
            <p role='status' className='text-sm text-muted-foreground'>
              {t('empty')}
            </p>
          )}
          {live.closed && walk !== null && (
            <p role='status' className='text-sm text-muted-foreground'>
              {t('closed')}
            </p>
          )}
          {showFailure ? (
            <QueryFailure messageKey='source.route' query={live.query} />
          ) : (
            <HowItWorksWalk
              links={links}
              walk={walk}
              loading={pending}
              selected={selected.term}
              inline={inline}
              onSelect={(term) => {
                setSelected({ term, source: 'step' });
              }}
            />
          )}
        </section>
      )}

      {!inline && !narrow && (
        <HowItWorksTermPanel
          links={links}
          term={selected.term}
          ruleSearch={target?.editorSearch}
          ruleSetTag={target?.services[0]}
          groupExample={walk?.outbound.kind === 'group'}
        />
      )}
      <p role='status' aria-live='polite' aria-atomic='true' className='sr-only'>
        {t(`terms.${selected.term}.title`)}. {t(`terms.${selected.term}.description`)}
      </p>
      <HowItWorksTerms
        links={links}
        selected={selected.term}
        inline={narrow && !inline}
        ruleSearch={target?.editorSearch}
        ruleSetTag={target?.services[0]}
        groupExample={walk?.outbound.kind === 'group'}
        onSelect={(term) => {
          setSelected({ term, source: 'glossary' });
        }}
      />
    </div>
  );
}
