import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ACL_MODE, ROUTE_REASON, routeReason, type DataplaneModel, type RouteSource } from '@entities/Dataplane';
import { ConfirmDialog, Switch } from '@shared/ui';

import { DeviceRouteReason } from './DeviceRouteReason';

/**
 * The "through sing-box" toggle in the device row. The position comes from the
 * model on the device and does not change until it is reread: switching only
 * opens a confirmation, and the change is driven by the apply cycle.
 */
export function DeviceRouteSwitch({
  source,
  label,
  model,
  locked,
  onRoute,
}: {
  source: RouteSource;
  /** Device label in the confirmation text and the accessible name. */
  label: string;
  model: DataplaneModel | null;
  locked: boolean;
  onRoute: (source: RouteSource, routed: boolean) => void;
}) {
  const { t } = useTranslation('features/Device/DeviceRoute');
  const [target, setTarget] = useState<boolean | null>(null);
  const noteId = useId();
  const reason = model === null ? null : routeReason(model, source);

  if (model?.aclMode === ACL_MODE.All) {
    return (
      <span className='flex items-center gap-2'>
        <Switch checked disabled aria-label={t('switch.label', { device: label })} />
        <span className='text-xs text-muted-foreground'>{t('switch.forAll')}</span>
      </span>
    );
  }

  const note = reason === null ? null : <DeviceRouteReason id={noteId} reason={reason} />;
  const describedBy = reason === null ? undefined : noteId;

  // The toggle does not write a subnet and cannot remove it: turning off would
  // remove only the device MAC and address and leave the device intercepted by
  // the subnet.
  if (reason?.kind === ROUTE_REASON.Subnet) {
    return (
      <span className='flex items-center gap-2'>
        <Switch checked disabled aria-label={t('switch.label', { device: label })} aria-describedby={describedBy} />
        {note}
      </span>
    );
  }

  return (
    <>
      <span className='flex items-center gap-2'>
        <Switch
          checked={reason !== null}
          disabled={locked || model?.aclMode !== ACL_MODE.Listed}
          aria-label={t('switch.label', { device: label })}
          aria-describedby={describedBy}
          onCheckedChange={setTarget}
        />
        {note}
      </span>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={t(target === true ? 'dialog.on' : 'dialog.off', { device: label })}
        description={t('dialog.description')}
        cancelLabel={t('dialog.cancel')}
        confirmLabel={t('dialog.apply')}
        onConfirm={() => {
          if (target !== null) onRoute(source, target);
        }}
      />
    </>
  );
}
