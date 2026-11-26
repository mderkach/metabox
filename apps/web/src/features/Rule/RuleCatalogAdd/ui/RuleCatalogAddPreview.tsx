import { useTranslation } from 'react-i18next';

import { RULE_CATALOG_ADD_NS } from '../i18n/RuleCatalogAdd.namespace.generated';
import type { planCatalogService } from '../model/RuleCatalogAdd.plan';

export function RuleCatalogAddPreview({
  plan,
  outbound,
  hasResolvers,
  subscriptionGroup,
}: {
  plan: ReturnType<typeof planCatalogService>;
  outbound: string;
  hasResolvers: boolean;
  subscriptionGroup: boolean;
}) {
  const { t } = useTranslation(RULE_CATALOG_ADD_NS);
  if (!plan.ok) {
    let message = t(`blocker.${plan.reason}`, { detail: plan.detail || t('unknown') });
    if (plan.reason === 'resolver' && hasResolvers) message = t('chooseResolver');
    if (plan.reason === 'exit' && subscriptionGroup) message = t('blocker.subscriptionExit', { detail: plan.detail });
    if (plan.reason === 'draft' && plan.detail) message = t('unsupportedSetting', { detail: plan.detail });

    return (
      <p role='status' className='rounded-lg bg-muted px-3 py-2 text-sm text-pretty wrap-anywhere'>
        {message}
      </p>
    );
  }

  return (
    <section aria-label={t('preview')} aria-live='polite' className='min-w-0 border-t border-border pt-3'>
      <h3 className='mb-2 text-sm font-semibold'>{t('preview')}</h3>
      <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm'>
        <dt className='text-muted-foreground'>{t('setLabel')}</dt>
        <dd className='wrap-anywhere'>
          <span className='font-mono'>{plan.setTag}</span> · {plan.addSet ? t('setAdded') : t('setReused')}
        </dd>
        <dt className='text-muted-foreground'>{t('routeRow', { position: plan.route.position })}</dt>
        <dd className='wrap-anywhere'>
          <span className='font-mono'>{outbound}</span> · {plan.route.reused ? t('reused') : t('added')}
        </dd>
        <dt className='text-muted-foreground'>{t('dnsRow', { position: plan.dns.position })}</dt>
        <dd className='wrap-anywhere'>
          <span className='font-mono'>{plan.resolver}</span> · {plan.dns.reused ? t('reused') : t('added')}
        </dd>
      </dl>
      <p className='mt-2 text-sm text-muted-foreground'>{t('allDevices')}</p>
    </section>
  );
}
