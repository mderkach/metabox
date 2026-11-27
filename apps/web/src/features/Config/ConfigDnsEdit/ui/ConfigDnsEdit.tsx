import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, CARD_TITLE } from '@shared/ui';

import { CONFIG_DNS_EDIT_NS } from '../i18n/ConfigDnsEdit.namespace.generated';
import { useConfigDnsEditDraft } from '../model/ConfigDnsEdit.draft';
import { ConfigDnsEditAssignment } from './ConfigDnsEditAssignment';
import { ConfigDnsEditServerForm } from './ConfigDnsEditServerForm';

export function ConfigDnsEdit({ text }: { text: string }) {
  const { t } = useTranslation(CONFIG_DNS_EDIT_NS);
  const { model, addServer, assign, stale } = useConfigDnsEditDraft(text);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<{ tag: string; text: string } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const addReason = stale ? 'stale' : model.addReason;

  function usageLabel(referenced: boolean | null) {
    if (referenced === null) return t('dns.unknownUsage');
    return t(referenced ? 'dns.used' : 'dns.unassigned');
  }

  function closeForm() {
    setAdding(false);
    trigger.current?.focus();
  }

  return (
    <>
      <section className='grid min-w-0 gap-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h3 className={CARD_TITLE}>{t('dns.inventory')}</h3>
          <Button
            type='button'
            size='sm'
            variant='outline'
            ref={trigger}
            aria-expanded={adding}
            aria-controls={formId}
            disabled={addReason !== null}
            onClick={() => {
              setAdded(null);
              setAdding(!adding);
            }}
          >
            {t('dns.add')}
          </Button>
        </div>
        {model.inventory.length > 0 && (
          <ul className='divide-y rounded-lg border px-3'>
            {model.inventory.map((server, index) => (
              <li key={index} className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2'>
                <div className='grid min-w-0 gap-0.5 wrap-anywhere'>
                  <span className='font-mono font-medium'>{server.tag}</span>
                  <span className='font-mono text-xs text-muted-foreground'>
                    {[
                      server.type.toUpperCase(),
                      server.address,
                      server.detour !== null && server.detour !== '' && t('dns.via', { outbound: server.detour }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <span className='text-xs text-muted-foreground'>{usageLabel(server.referenced)}</span>
              </li>
            ))}
          </ul>
        )}
        {addReason !== null && <p className='text-sm text-muted-foreground'>{t(`dns.reason.${addReason}`)}</p>}
        <div id={formId} hidden={!adding}>
          {adding && (
            <ConfigDnsEditServerForm
              detours={model.detours}
              reason={addReason}
              onSubmit={(server) =>
                addServer(server, (next) => {
                  setAdded({ text: next, tag: server.tag });
                })
              }
              onClose={closeForm}
            />
          )}
        </div>
        <p role='status' className='text-sm wrap-anywhere empty:hidden'>
          {added?.text === text && t('dns.added', { tag: added.tag })}
        </p>
      </section>
      <section className='grid min-w-0 gap-2 border-t pt-4'>
        <h3 className={CARD_TITLE}>{t('dns.assignment')}</h3>
        {model.paths.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('dns.noPaths')}</p>
        ) : (
          <>
            <p className='max-w-prose text-sm text-muted-foreground'>{t('dns.scopeNote')}</p>
            <ul className='divide-y'>
              {model.paths.map((path) => (
                <ConfigDnsEditAssignment key={path.tag} path={path} text={text} stale={stale} onAssign={assign} />
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
