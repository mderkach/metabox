import { useTranslation } from 'react-i18next';

import { ACL_MODE, type DataplaneModel } from '@entities/Dataplane';
import type { Device } from '@entities/Device';

import { DEVICE_ROUTE_NS } from '../i18n/DeviceRoute.namespace.generated';
import { scopeEntries } from '../model/DeviceRoute.scope';

export function DeviceRouteScopeValue({ model, devices }: { model: DataplaneModel; devices: readonly Device[] }) {
  const { t } = useTranslation(DEVICE_ROUTE_NS);
  if (!model.enabled) return <p>{t('scope.off')}</p>;
  if (model.aclMode === ACL_MODE.All) return <p>{t('scope.allValue')}</p>;
  if (model.aclMode !== ACL_MODE.Listed) return <code className='wrap-anywhere'>{model.aclMode}</code>;

  const entries = scopeEntries(model, devices);
  return (
    <div className='grid gap-1'>
      {entries.length ? (
        <ul className='grid gap-0.5 font-mono text-xs wrap-anywhere'>
          {entries.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : (
        <p>{t('scope.none')}</p>
      )}
      {(model.sourceIpExclude.length > 0 || model.sourceMacExclude.length > 0) && (
        <p className='wrap-anywhere'>
          {t('scope.except', { entries: [...model.sourceIpExclude, ...model.sourceMacExclude].join(', ') })}
        </p>
      )}
    </div>
  );
}
