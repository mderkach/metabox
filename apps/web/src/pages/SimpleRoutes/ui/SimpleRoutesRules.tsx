import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigCacheNotice } from '@features/Config/ConfigCacheFile';
import { RuleCatalogAddDialog } from '@features/Rule/RuleCatalogAdd';
import { Button, Dialog, DialogTrigger } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import type { SimpleRuleNavigation } from '../model/SimpleRoutes.links';
import type { toSimpleRoutes } from '../model/SimpleRoutes.model';
import { SimpleRoutesRuleList } from './SimpleRoutesRuleList';
import { SimpleRoutesSection } from './SimpleRoutesSection';

export function SimpleRoutesRules({
  links,
  referenceLink,
  onOutboundChange,
  model,
  text,
  outbound,
}: SimpleRuleNavigation & {
  model: ReturnType<typeof toSimpleRoutes>;
  text: string;
  outbound?: string;
}) {
  const [open, setOpen] = useState(false);
  const [initialService, setInitialService] = useState<string | null>(null);
  const opener = useRef<Element | undefined>(undefined);
  const addButton = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation(SIMPLE_ROUTES_NS);

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
        section='rules'
        actions={
          <DialogTrigger ref={addButton} render={<Button variant='outline' />}>
            <Plus data-icon='inline-start' />
            {t('catalog.action')}
          </DialogTrigger>
        }
      >
        <SimpleRoutesRuleList
          links={links}
          referenceLink={referenceLink}
          onOutboundChange={onOutboundChange}
          model={model}
          text={text}
          outbound={outbound}
        />
        {model.needsCache && <ConfigCacheNotice />}
      </SimpleRoutesSection>
      {initialService !== null && (
        <RuleCatalogAddDialog
          text={text}
          outbounds={model.outbounds}
          initialOutbound={outbound}
          initialService={initialService}
          stagedTags={model.stagedTags}
          appliedProviderTags={model.appliedProviderTags}
          hasStagedSubscriptions={model.hasStagedSubscriptions}
          onAdded={() => {
            setOpen(false);
          }}
          finalFocus={() => (opener.current?.isConnected === true ? true : addButton.current)}
        />
      )}
    </Dialog>
  );
}
