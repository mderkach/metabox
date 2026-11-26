import { useId } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { isRecord } from '@shared/lib/isRecord';
import { Checkbox, FieldGroup, Label } from '@shared/ui';

import { CONFIG_NODE_ADD_NS } from '../i18n/ConfigNodeAdd.namespace.generated';
import { shareLinkTag, type ShareLink } from '../model/ConfigNodeAdd.link';
import type { ConnectionLinkModel } from '../model/ConfigNodeAdd.schema';
import {
  SERVER_ERROR,
  SERVER_GROUP,
  serverGroups,
  serverImportAddress,
  type serverImportMatch,
  serverImportTags,
} from '../model/ConfigNodeAdd.server';
import { ConfigNodeAddLinkInput } from './ConfigNodeAddLinkInput';
import { ConfigNodeAddLinkSelect } from './ConfigNodeAddLinkSelect';

export function ConfigNodeAddServerFields({
  link,
  current,
  applied,
  match,
}: {
  link: ShareLink;
  current: string;
  applied: string;
  match: ReturnType<typeof serverImportMatch>;
}) {
  const { t } = useTranslation(CONFIG_NODE_ADD_NS);
  const { control } = useFormContext<ConnectionLinkModel>();
  const group = useWatch({ control, name: 'serverGroup' });
  const confirmationId = useId();
  const warningId = useId();
  const { flow, tls, transport } = link.fields;
  const tlsSettings = isRecord(tls) ? tls : null;
  const fingerprint = isRecord(tlsSettings?.utls) ? tlsSettings.utls.fingerprint : null;
  const tlsName = tlsSettings?.server_name;
  const isXray = link.type === 'vless' || link.type === 'vmess' || link.type === 'trojan';
  const transportName = isRecord(transport) ? transport.type : null;
  const parameters = [
    typeof transportName === 'string' ? transportName.toUpperCase() : isXray && 'TCP',
    flow === 'xtls-rprx-vision' && 'Vision',
    typeof fingerprint === 'string' &&
      /^[a-z][a-z0-9_]*$/i.test(fingerprint) &&
      t('server.fingerprint', { value: fingerprint }),
    typeof tlsName === 'string' &&
      /^(?:[a-z0-9.:-]+|\[[\da-f:]+\])$/i.test(tlsName) &&
      t('server.tlsName', { value: tlsName }),
  ].filter(Boolean);
  let protocol = link.type.toUpperCase();
  if (tlsSettings !== null) protocol += isRecord(tlsSettings.reality) ? ' · REALITY' : ' · TLS';

  return (
    <FieldGroup className='min-w-0 gap-3'>
      <div className='flex min-w-0 flex-col gap-1' role='status'>
        <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5'>
          <span className='text-sm font-medium'>{t('server.recognized', { protocol })}</span>
          <span className='font-mono text-xs wrap-anywhere text-muted-foreground'>{serverImportAddress(link)}</span>
        </div>
        {parameters.length > 0 && (
          <p className='font-mono text-xs wrap-anywhere text-muted-foreground'>{parameters.join(' · ')}</p>
        )}
      </div>
      {match === SERVER_ERROR.Duplicate ? (
        <p role='status' className='text-sm text-signal-warn'>
          {t('server.duplicate')}
        </p>
      ) : (
        <>
          {match === SERVER_ERROR.PossibleDuplicate && (
            <Controller
              control={control}
              name='serverSeparate'
              render={({ field, fieldState }) => (
                <div className='flex flex-col gap-1.5'>
                  <p id={warningId} role={fieldState.invalid ? 'alert' : 'status'} className='text-sm text-signal-warn'>
                    {t('server.possibleDuplicate')}
                  </p>
                  <Label htmlFor={confirmationId} className='min-h-8 items-center pointer-coarse:min-h-11'>
                    <Checkbox
                      ref={field.ref}
                      id={confirmationId}
                      checked={field.value}
                      aria-describedby={warningId}
                      aria-invalid={fieldState.invalid}
                      onBlur={field.onBlur}
                      onCheckedChange={field.onChange}
                    />
                    {t('server.addSeparate')}
                  </Label>
                </div>
              )}
            />
          )}
          <ConfigNodeAddLinkInput
            name='serverTag'
            label={t('server.tag')}
            suggestedValue={shareLinkTag(link, serverImportTags(current, applied))}
          />
          <ConfigNodeAddLinkSelect
            name='serverGroup'
            label={t('subscription.group')}
            description={t('server.groupHint')}
            items={[
              { value: SERVER_GROUP.None, label: t('subscription.noGroup') },
              ...serverGroups(current),
              { value: SERVER_GROUP.New, label: t('subscription.newGroup') },
            ]}
          />
          {group === SERVER_GROUP.New && (
            <ConfigNodeAddLinkInput name='serverGroupName' label={t('subscription.groupName')} />
          )}
        </>
      )}
    </FieldGroup>
  );
}
