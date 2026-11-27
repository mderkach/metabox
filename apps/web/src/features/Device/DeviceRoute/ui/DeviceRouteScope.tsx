import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  isApplyActive,
  SERVICE_STATUS,
  toConfirmedStatus,
  useDaemonStatus,
  useRuntimeStream,
  useServiceState,
} from '@entities/Daemon';
import { ACL_MODE, useDataplane, useDataplaneTransaction, type DataplaneChange } from '@entities/Dataplane';
import { useDevices } from '@entities/Device';
import { ApiError } from '@shared/api';
import { Button, QueryFailure } from '@shared/ui';

import { useChangeDeviceRoute } from '../api';
import { DEVICE_ROUTE_NS } from '../i18n/DeviceRoute.namespace.generated';
import { DEVICE_ROUTE_BAR_ID } from '../model/DeviceRoute.constants';
import {
  conflictingLease,
  deviceSelected,
  proposedScope,
  scopeDevices,
  scopeRestriction,
  type ScopeDevice,
  type ScopeEdit,
} from '../model/DeviceRoute.scope';
import { DeviceRouteScopePicker } from './DeviceRouteScopePicker';
import { DeviceRouteScopeReview } from './DeviceRouteScopeReview';
import { DeviceRouteScopeValue } from './DeviceRouteScopeValue';

export function DeviceRouteScope() {
  const { t } = useTranslation(DEVICE_ROUTE_NS);
  useRuntimeStream();
  const scopeId = useId();
  const focus = useRef<HTMLHeadingElement>(null);
  const dataplane = useDataplane();
  const inventory = useDevices();
  const status = useDaemonStatus();
  const service = useServiceState();
  const planeTransaction = status.data?.dataplaneTransaction;
  const transaction = useDataplaneTransaction(planeTransaction?.id ?? null);
  const change = useChangeDeviceRoute();
  const ownTransaction = useRef<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [edits, setEdits] = useState<ScopeEdit[]>([]);
  const [editedVersion, setEditedVersion] = useState<string | null>(null);
  const progress = transaction.data ?? planeTransaction;
  function focusOwnProgress() {
    if (
      progress?.id !== ownTransaction.current ||
      !isApplyActive(progress.phase) ||
      document.activeElement !== focus.current
    )
      return;
    document.getElementById(DEVICE_ROUTE_BAR_ID)?.focus();
  }
  useEffect(focusOwnProgress, [progress]);
  const data = dataplane.data;
  if (data === undefined)
    return dataplane.isError ? <QueryFailure messageKey='source.dataplane' query={dataplane} /> : null;
  const { model, etag } = data;
  const managed =
    service.data?.managed === true && !service.isError && toConfirmedStatus(service.data) === SERVICE_STATUS.Running;
  const restriction = scopeRestriction(model, etag, data.applied, managed);
  const active =
    isApplyActive(transaction.data?.phase ?? planeTransaction?.phase) || isApplyActive(status.data?.transaction?.phase);
  const selectedMode = mode ?? model.aclMode;
  const proposed = proposedScope(model, selectedMode, edits);
  const devices = inventory.data ?? [];
  const staleLease = selectedMode === ACL_MODE.Listed ? conflictingLease(edits, devices) : undefined;
  const empty = selectedMode === ACL_MODE.Listed && proposed.sourceMac.length + proposed.sourceIp.length === 0;
  const dirty =
    proposed.aclMode !== model.aclMode ||
    proposed.sourceIp !== model.sourceIp ||
    proposed.sourceMac !== model.sourceMac;
  const locked = active || change.isPending || status.data === undefined || status.isError || dataplane.isError;
  const conflict =
    change.error instanceof ApiError &&
    (change.error.code === 'dataplane_modified' || change.error.code === 'apply_in_progress');

  function reset() {
    setMode(null);
    setEdits([]);
    setEditedVersion(null);
    change.reset();
  }

  function toggleDevice(device: ScopeDevice, checked: boolean) {
    setEditedVersion(etag);
    setMode(selectedMode);
    setEdits((previous) => {
      const kept = previous.filter((edit) => edit.device.key !== device.key);
      return deviceSelected(model, device) === checked ? kept : [...kept, { device, checked }];
    });
  }

  function apply(next: DataplaneChange) {
    if (locked || !dirty || empty || staleLease !== undefined || restriction !== null || next.base !== etag) return;
    change.mutate(next, {
      onSuccess: (started) => {
        ownTransaction.current = started.id;
        reset();
      },
      onError: () => {
        void dataplane.refetch();
        void status.refetch();
      },
    });
  }

  return (
    <div onFocusCapture={focusOwnProgress} className='grid min-w-0 content-start gap-3'>
      <div className='space-y-1'>
        <h4 ref={focus} tabIndex={-1} className='font-medium'>
          {t('scope.current')}
        </h4>
        <DeviceRouteScopeValue model={model} devices={devices} />
      </div>
      {active && <p role='status'>{t('scope.busy')}</p>}
      {restriction !== null && (
        <p className='text-pretty text-muted-foreground'>{t(`scope.restriction.${restriction}`)}</p>
      )}
      {restriction === null && (
        <>
          <fieldset disabled={locked} className='grid min-w-0 gap-2'>
            <legend className='mb-1 font-medium'>{t('scope.question')}</legend>
            <div className='flex flex-wrap gap-x-4 gap-y-1'>
              {([ACL_MODE.Listed, ACL_MODE.All] as const).map((value) => (
                <label
                  key={value}
                  className='inline-flex cursor-pointer items-center gap-2 py-1 pointer-coarse:min-h-11'
                >
                  <input
                    type='radio'
                    name={scopeId}
                    value={value}
                    checked={selectedMode === value}
                    className='size-4 accent-primary focus-visible:outline-ring'
                    onChange={() => {
                      setEditedVersion(etag);
                      setMode(value);
                    }}
                  />
                  {t(`scope.mode.${value}`)}
                </label>
              ))}
            </div>
            {selectedMode === ACL_MODE.Listed && (
              <DeviceRouteScopePicker
                rows={scopeDevices(model, devices, edits)}
                model={proposed}
                disabled={locked}
                onChange={toggleDevice}
              />
            )}
          </fieldset>
          {inventory.isError && selectedMode === ACL_MODE.Listed && (
            <QueryFailure messageKey='source.devices' query={inventory} />
          )}
          {staleLease && <p role='alert'>{t('scope.leaseChanged', { name: staleLease.label, ip: staleLease.ip })}</p>}
          {empty && <p className='text-pretty text-muted-foreground'>{t('scope.empty')}</p>}
          {status.isError && <p role='status'>{t('scope.statusUnknown')}</p>}
          {dataplane.isError && <QueryFailure messageKey='source.dataplane' query={dataplane} />}
          {(conflict || (editedVersion !== null && editedVersion !== etag)) && (
            <p role='alert'>{t('scope.conflict')}</p>
          )}
          <div className='flex flex-wrap gap-2'>
            <DeviceRouteScopeReview
              current={model}
              proposed={proposed}
              etag={etag}
              devices={devices}
              focus={focus}
              disabled={
                locked ||
                !dirty ||
                empty ||
                staleLease !== undefined ||
                (conflict && (dataplane.isFetching || status.isFetching))
              }
              onApply={apply}
            />
            {editedVersion !== null && (
              <Button
                size='sm'
                variant='ghost'
                disabled={change.isPending}
                onClick={() => {
                  reset();
                  focus.current?.focus();
                }}
              >
                {t('scope.reset')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
