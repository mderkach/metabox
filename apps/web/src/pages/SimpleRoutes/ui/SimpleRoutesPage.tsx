import { useSearch } from '@tanstack/react-router';
import { use, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfigDocument } from '@entities/Config';
import { ConfigNodeAddDialogContext } from '@features/Config/ConfigNodeAdd';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Dialog,
  QueryFailure,
  SkeletonRows,
  SURFACE,
} from '@shared/ui';

import { toSimpleRoutes } from '../model/SimpleRoutes.model';
import { SimpleRoutesAddDialog } from './SimpleRoutesAddDialog';
import { SimpleRoutesAddTrigger } from './SimpleRoutesAddTrigger';
import { SimpleRoutesDns } from './SimpleRoutesDns';
import { SimpleRoutesHelp } from './SimpleRoutesHelp';
import { SimpleRoutesInterception } from './SimpleRoutesInterception';
import { SimpleRoutesOutbounds } from './SimpleRoutesOutbounds';
import { SimpleRoutesRules } from './SimpleRoutesRules';

export function SimpleRoutesPage() {
  const { t } = useTranslation('pages/SimpleRoutes');
  const { outbound } = useSearch({ from: '/config/simple' });
  const document = useConfigDocument();
  const addHandle = use(ConfigNodeAddDialogContext);
  const starterId = useId();
  const starterTrigger = useRef<HTMLButtonElement>(null);
  const outboundsTrigger = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const { config, text, appliedText } = document;
  const model = useMemo(
    () => (config === null || text === null ? null : toSimpleRoutes(config, text, appliedText)),
    [config, text, appliedText]
  );

  function closeAddDialog() {
    // The first outbound replaces the starter and removes its trigger.
    if (opener.current === starterTrigger.current) opener.current = undefined;
    setOpen(false);
  }

  function restoreAddFocus() {
    return opener.current?.isConnected === true ? true : outboundsTrigger.current;
  }

  return (
    <div className='min-h-0 grow overflow-y-auto px-4 py-5 sm:px-6'>
      <div className='flex min-w-0 flex-col gap-6'>
        {document.isPending && <SkeletonRows className={SURFACE} />}

        {document.query.isLoadingError && <QueryFailure messageKey='source.config' query={document.query} />}

        {model === null && document.query.isSuccess && (
          <Alert>
            <AlertTitle>{t('unavailable.title')}</AlertTitle>
            <AlertDescription>{t('unavailable.description')}</AlertDescription>
          </Alert>
        )}

        {model !== null && (
          <>
            <SimpleRoutesHelp />
            <Dialog
              handle={addHandle}
              open={open}
              onOpenChange={(next, details) => {
                if (next) opener.current = details.trigger;
                setOpen(next);
              }}
            >
              {model.empty && (
                <section aria-labelledby={starterId}>
                  <Card size='sm'>
                    <CardHeader>
                      <h2 id={starterId} className='text-base font-semibold'>
                        {t('starter.title')}
                      </h2>
                      <CardDescription>{t('starter.description')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <SimpleRoutesAddTrigger ref={starterTrigger} primary />
                    </CardContent>
                  </Card>
                </section>
              )}

              <SimpleRoutesInterception inbounds={model.inbounds} />
              <SimpleRoutesDns servers={model.dnsServers} rules={model.dnsRules} final={model.dnsFinal} />
              <SimpleRoutesOutbounds
                outbounds={model.outbounds}
                providers={model.providers}
                stagedTags={model.stagedTags}
                addTriggerRef={outboundsTrigger}
              />
              <SimpleRoutesAddDialog
                takenTags={model.takenTags}
                onAdded={closeAddDialog}
                finalFocus={restoreAddFocus}
              />
            </Dialog>
            {text !== null && <SimpleRoutesRules model={model} text={text} outbound={outbound} />}
          </>
        )}
      </div>
    </div>
  );
}
