import { useTranslation } from 'react-i18next';

import { SOURCE_IP_ERROR, sourceIpError } from '@entities/Dataplane';

import { DEVICE_ROUTE_NS } from '../i18n/DeviceRoute.namespace.generated';

/** Names the first wrong entry and how to write it: a list of failures would repeat one sentence. */
export function DeviceRouteSubnetsError({ id, entries }: { id: string; entries: readonly string[] }) {
  const { t } = useTranslation(DEVICE_ROUTE_NS);
  const entry = entries.find((value) => sourceIpError(value) !== null) ?? '';
  const error = sourceIpError(entry);
  const text =
    error?.kind === SOURCE_IP_ERROR.HostBits
      ? t('subnets.error.hostBits', { value: entry, subnet: error.subnet })
      : t('subnets.error.invalid', { value: entry });

  return (
    <p id={id} role='alert' className='text-xs text-destructive'>
      {text}
    </p>
  );
}
