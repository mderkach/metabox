import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isNamedRuleAction, RULE_TARGET, useRuleTitle } from '@entities/Rule';
import { ConfigCacheNotice } from '@features/Config/ConfigCacheFile';
import { RuleCatalogAddDialog } from '@features/Rule/RuleCatalogAdd';
import { cn } from '@shared/lib/utils';
import { Button, Card, CardContent, Dialog, DialogTrigger } from '@shared/ui';

import type { toSimpleRoutes } from '../model/SimpleRoutes.model';
import { SimpleRoutesSection } from './SimpleRoutesSection';
import { SimpleRoutesServiceSuggestions } from './SimpleRoutesServiceSuggestions';

export function SimpleRoutesRules({
  model,
  text,
  outbound,
}: {
  model: ReturnType<typeof toSimpleRoutes>;
  text: string;
  outbound?: string;
}) {
  const { rules } = model;
  const [open, setOpen] = useState(false);
  const [initialService, setInitialService] = useState<string | null>(null);
  const opener = useRef<Element | undefined>(undefined);
  const addButton = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation('pages/SimpleRoutes');
  const { t: tShared } = useTranslation('shared');
  const { subject } = useRuleTitle();
  const shown =
    outbound === undefined
      ? rules
      : rules.filter((rule) => rule.targetKind === RULE_TARGET.Outbound && rule.target === outbound);

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          opener.current = details.trigger;
          setInitialService(details.trigger?.getAttribute('data-service') ?? '');
        }
        setOpen(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setInitialService(null);
      }}
    >
      <SimpleRoutesSection
        title={t('sections.rules')}
        actions={
          <DialogTrigger ref={addButton} render={<Button variant='outline' />}>
            <Plus data-icon='inline-start' />
            {t('catalog.action')}
          </DialogTrigger>
        }
      >
        {outbound !== undefined && (
          <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm wrap-anywhere'>
            <p>{t('rules.filtered', { outbound })}</p>
            <Link
              to='/config/simple'
              search={{ outbound: undefined }}
              className='text-primary underline underline-offset-4'
            >
              {t('rules.clear')}
            </Link>
          </div>
        )}
        <Card size='sm'>
          <CardContent>
            {model.empty && <SimpleRoutesServiceSuggestions />}
            {!model.empty && shown.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                {t(outbound === undefined ? 'rules.empty' : 'rules.noMatches')}
              </p>
            )}
            {shown.length > 0 && (
              <ol className='divide-y divide-border'>
                {shown.map((rule) => (
                  <li key={rule.id} value={rule.index} className='flex items-baseline gap-2 py-2 text-sm wrap-anywhere'>
                    <span className='shrink-0 text-muted-foreground tabular-nums'>{rule.index}.</span>
                    <span className='min-w-0 grow'>{subject(rule)}</span>
                    <span
                      className={cn(
                        'min-w-0 text-right text-muted-foreground',
                        rule.targetKind === RULE_TARGET.Outbound && 'font-mono'
                      )}
                    >
                      {rule.targetKind === RULE_TARGET.Action && isNamedRuleAction(rule.target)
                        ? tShared(`ruleAction.${rule.target}`)
                        : rule.target || t('rules.targetUnknown')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        {model.needsCache && <ConfigCacheNotice />}
      </SimpleRoutesSection>
      {initialService !== null && (
        <RuleCatalogAddDialog
          text={text}
          outbounds={model.outbounds}
          initialOutbound={outbound}
          initialService={initialService}
          stagedTags={model.stagedTags}
          onAdded={() => {
            setOpen(false);
          }}
          finalFocus={() => (opener.current?.isConnected === true ? true : addButton.current)}
        />
      )}
    </Dialog>
  );
}
