import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import { ROUTE_MATCH } from '@entities/Route';
import { RouteOriginBadge } from '@entities/Route';
import { cn } from '@shared/lib/utils';

import { HOW_IT_WORKS_NS } from '../i18n/HowItWorks.namespace.generated';
import type { HowItWorksTermLinks } from '../model/HowItWorks.links';
import type { ConnectionWalk } from '../model/HowItWorks.model';
import type { WalkTerm } from '../model/HowItWorks.terms';
import { HowItWorksGroup } from './HowItWorksGroup';
import { HowItWorksTermPanel } from './HowItWorksTermPanel';

const STEPS = [
  { key: 'device', term: 'device' },
  { key: 'destination', term: 'service' },
  { key: 'rule', term: 'rule' },
  { key: 'outbound', term: 'outbound' },
  { key: 'server', term: 'server' },
] as const;

export function HowItWorksWalk({
  links,
  walk,
  loading,
  selected,
  inline,
  onSelect,
}: {
  links: HowItWorksTermLinks;
  walk: ConnectionWalk | null;
  loading: boolean;
  selected: WalkTerm;
  inline: boolean;
  onSelect: (term: WalkTerm) => void;
}) {
  const { t } = useTranslation(HOW_IT_WORKS_NS);
  const panels =
    walk === null
      ? null
      : {
          device: {
            value: walk.device.label,
            detail: walk.device.label === walk.device.address ? null : walk.device.address,
          },
          destination: { value: walk.destination.host, detail: null },
          rule: {
            value: ruleValue(walk, t),
            detail:
              walk.rule.verified === null
                ? ruleDetail(walk, t)
                : t('ruleNumber', { number: walk.rule.verified.position + 1 }),
          },
          outbound: {
            value: walk.outbound.kind === 'direct' ? t('direct') : walk.outbound.tag,
            detail: walk.outbound.kind === 'direct' ? t('withoutProxy') : null,
          },
          server: {
            value: walk.server.kind === 'none' ? t('noServer') : walk.server.tag,
            detail: serverDetail(walk, t),
          },
        };
  const verified = walk?.rule.verified;

  return (
    <ol
      aria-label={t('walk')}
      className='grid gap-2 min-[48.01rem]:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_1rem_minmax(0,1fr)_1rem_minmax(0,1.35fr)_1rem_minmax(0,1fr)]'
    >
      {STEPS.map(({ key, term }, index) => (
        <Fragment key={key}>
          {index > 0 && (
            <li
              role='presentation'
              className='flex items-center justify-center text-muted-foreground min-[48.01rem]:mt-5 min-[48.01rem]:self-start'
            >
              <ChevronRight aria-hidden='true' className='size-4 max-[48rem]:rotate-90' />
            </li>
          )}
          <li className='grid min-w-0 content-start gap-2'>
            <div
              className={cn(
                'min-w-0 rounded-lg border bg-card',
                selected === term && 'border-selected-edge bg-selected'
              )}
            >
              <button
                type='button'
                aria-pressed={selected === term}
                className='grid min-h-11 w-full min-w-0 gap-1 rounded-lg p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 min-[48.01rem]:px-2.5'
                onClick={() => {
                  onSelect(term);
                }}
              >
                <span className='text-xs text-muted-foreground'>{t(`steps.${key}`)}</span>
                {loading ? (
                  <span aria-hidden='true' className='h-4 w-2/3 rounded bg-muted' />
                ) : (
                  <span
                    className={cn(
                      'font-mono text-sm wrap-anywhere',
                      key === 'outbound' && walk?.outbound.kind === 'direct' && 'text-route-direct',
                      key === 'outbound' &&
                        (walk?.outbound.kind === 'group' || walk?.outbound.kind === 'server') &&
                        'text-route-proxy'
                    )}
                  >
                    {panels?.[key].value ?? (walk === null ? '—' : t('unknown'))}
                  </span>
                )}
                {panels?.[key].detail != null && (
                  <span className='text-xs wrap-anywhere text-muted-foreground'>{panels[key].detail}</span>
                )}
              </button>
              {walk !== null && key === 'rule' && (
                <div className='grid justify-items-start gap-2 px-3 pb-3 text-xs wrap-anywhere'>
                  {walk.rule.verified !== null && walk.rule.verified.services.length > 0 && (
                    <span>{walk.rule.verified.services.join(', ')}</span>
                  )}
                  <RouteOriginBadge origin={walk.rule.origin} />
                </div>
              )}
              {walk !== null && key === 'outbound' && (
                <div className='grid justify-items-start gap-1 px-3 pb-3'>
                  <RouteOriginBadge origin={walk.outbound.origin} />
                  {walk.outbound.group !== null && <HowItWorksGroup group={walk.outbound.group} />}
                </div>
              )}
              {walk !== null && key === 'server' && (
                <div className='px-3 pb-3'>
                  <RouteOriginBadge origin={walk.server.origin} />
                </div>
              )}
            </div>
            {inline && selected === term && (
              <HowItWorksTermPanel
                links={links}
                term={term}
                ruleSearch={verified?.editorSearch}
                ruleSetTag={verified?.services[0]}
                groupExample={walk?.outbound.kind === 'group'}
              />
            )}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

type WalkTranslator = ReturnType<typeof useTranslation<typeof HOW_IT_WORKS_NS>>['t'];

function ruleValue(walk: ConnectionWalk, t: WalkTranslator): string {
  if (walk.rule.verified !== null) return walk.rule.verified.label;
  if (walk.rule.kind === ROUTE_MATCH.Final) return t('noRule');

  if (walk.rule.kind === ROUTE_MATCH.Rule && walk.rule.conditions === '') return t('unconditional');

  return walk.rule.conditions === '' ? t('unknown') : walk.rule.conditions;
}

function serverDetail(walk: ConnectionWalk, t: WalkTranslator): string | null {
  if (walk.server.kind === 'none') return t('internet');

  return walk.server.provider === null ? null : t('provider', { name: walk.server.provider });
}

function ruleDetail(walk: ConnectionWalk, t: WalkTranslator): string {
  if (walk.rule.kind === ROUTE_MATCH.Final) return t('final');
  if (walk.rule.kind === ROUTE_MATCH.Unknown) return walk.rule.reason;

  return [walk.rule.action, t('unconfirmed')].filter(Boolean).join(' · ');
}
