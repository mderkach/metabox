import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import type { DataplaneChange, DataplaneModel } from '@entities/Dataplane';
import type { Device } from '@entities/Device';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/ui';

import { DEVICE_ROUTE_NS } from '../i18n/DeviceRoute.namespace.generated';
import { DeviceRouteScopeValue } from './DeviceRouteScopeValue';

export function DeviceRouteScopeReview({
  current,
  proposed,
  etag,
  devices,
  disabled,
  focus,
  onApply,
}: {
  current: DataplaneModel;
  proposed: DataplaneModel;
  etag: string | null;
  devices: readonly Device[];
  disabled: boolean;
  focus: RefObject<HTMLElement | null>;
  onApply: (change: DataplaneChange) => void;
}) {
  const { t } = useTranslation(DEVICE_ROUTE_NS);
  const [open, setOpen] = useState(false);
  const applied = useRef(false);
  const [review, setReview] = useState<{ current: DataplaneModel; change: DataplaneChange } | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          applied.current = false;
          setReview({ current, change: { model: proposed, base: etag } });
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant='outline' size='sm' disabled={disabled} />}>
        {t('scope.review')}
      </DialogTrigger>
      {review !== null && (
        <DialogContent
          showCloseButton={false}
          finalFocus={() => (applied.current || disabled ? focus.current : true)}
          className='max-h-[85dvh] overflow-y-auto sm:max-w-lg'
        >
          <DialogHeader>
            <DialogTitle>{t('scope.review')}</DialogTitle>
            <DialogDescription>{t('dialog.description')}</DialogDescription>
          </DialogHeader>
          <dl className='grid gap-3 sm:grid-cols-2'>
            <div className='min-w-0 space-y-1'>
              <dt className='font-medium'>{t('scope.current')}</dt>
              <dd>
                <DeviceRouteScopeValue model={review.current} devices={devices} />
              </dd>
            </div>
            <div className='min-w-0 space-y-1'>
              <dt className='font-medium'>{t('scope.proposed')}</dt>
              <dd>
                <DeviceRouteScopeValue model={review.change.model} devices={devices} />
              </dd>
            </div>
          </dl>
          {(review.change.base !== etag || disabled) && <p role='status'>{t('scope.reviewChanged')}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant='outline' />}>{t('dialog.cancel')}</DialogClose>
            <Button
              disabled={disabled || review.change.base !== etag}
              onClick={() => {
                applied.current = true;
                onApply(review.change);
                setOpen(false);
              }}
            >
              {t('scope.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
