import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ACL_MODE, isDeviceRouted, type DataplaneModel, type RouteSource } from '@entities/Dataplane';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Switch,
} from '@shared/ui';

/**
 * Тумблер «через sing-box» в строке устройства. Положение берётся из модели на
 * устройстве и до её перечитывания не меняется: переключение лишь открывает
 * подтверждение, а смену ведёт цикл применения.
 */
export function DeviceRouteSwitch({
  source,
  label,
  model,
  locked,
  foreignService,
  onRoute,
}: {
  source: RouteSource;
  /** Подпись устройства в тексте подтверждения и доступном имени. */
  label: string;
  model: DataplaneModel | null;
  locked: boolean;
  /** Демон управляет чужой службой: положение показывается, смена не предлагается. */
  foreignService: boolean;
  onRoute: (source: RouteSource, routed: boolean) => void;
}) {
  const { t } = useTranslation('features/Device/DeviceRoute');
  const [target, setTarget] = useState<boolean | null>(null);

  if (foreignService) {
    return (
      <span className='flex items-center gap-2'>
        <Switch
          checked={model !== null && isDeviceRouted(model, source)}
          disabled
          aria-label={t('switch.label', { device: label })}
        />
        <span className='text-xs text-muted-foreground'>{t('switch.foreignService')}</span>
      </span>
    );
  }

  if (model?.aclMode === ACL_MODE.All) {
    return (
      <span className='flex items-center gap-2'>
        <Switch checked disabled aria-label={t('switch.label', { device: label })} />
        <span className='text-xs text-muted-foreground'>{t('switch.forAll')}</span>
      </span>
    );
  }

  const routed = model !== null && isDeviceRouted(model, source);

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
    >
      <Switch
        checked={routed}
        disabled={locked || model?.aclMode !== ACL_MODE.Listed}
        aria-label={t('switch.label', { device: label })}
        onCheckedChange={setTarget}
      />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(target === true ? 'dialog.on' : 'dialog.off', { device: label })}</AlertDialogTitle>
          <AlertDialogDescription>{t('dialog.description')}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t('dialog.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (target !== null) onRoute(source, target);

              setTarget(null);
            }}
          >
            {t('dialog.apply')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
