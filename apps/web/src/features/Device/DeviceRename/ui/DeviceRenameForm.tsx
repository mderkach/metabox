import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys } from 'i18next';
import { useId, type KeyboardEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { toDevices, type Device, type NameSource } from '@entities/Device';
import { Button, Input } from '@shared/ui';

import { useRenameDevice } from '../api';
import { DEVICE_NAME_LIMIT, DEVICE_RENAME_ERROR, DeviceRenameSchema, type DeviceRenameModel } from '../model';

const ERROR_KEY: Readonly<Record<string, ParseKeys<'features/Device/DeviceRename'> | undefined>> = {
  [DEVICE_RENAME_ERROR.TooLong]: 'error.tooLong',
  [DEVICE_RENAME_ERROR.ControlChars]: 'error.controlChars',
};

const CUSTOM_SOURCE: NameSource = 'custom';

/**
 * Device's name right in the list row. The field holds the current label, so a
 * typo is fixed in place; an unchanged value is never saved (it would pin the
 * lease name as an own one), and the return to the lease name is a button.
 */
export function DeviceRenameForm({
  device,
  onDone,
}: {
  device: Device;
  /** The form closed: the name is saved (`label` is the new label) or the edit is cancelled (`null`). */
  onDone: (label: string | null) => void;
}) {
  const { t } = useTranslation('features/Device/DeviceRename');
  const rename = useRenameDevice();
  const inputId = useId();
  const hintId = useId();
  const form = useForm<DeviceRenameModel>({
    defaultValues: { name: device.name },
    mode: 'onChange',
    resolver: zodResolver(DeviceRenameSchema),
  });

  function save(name: string) {
    rename.mutate(
      { mac: device.mac, name },
      {
        onSuccess: (list) => {
          onDone(toDevices(list).find((item) => item.mac === device.mac)?.label ?? null);
        },
      }
    );
  }

  const onSubmit = form.handleSubmit(({ name }) => {
    if (name === device.name) {
      onDone(null);

      return;
    }

    save(name);
  });

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      onDone(null);
    }
  }

  return (
    // Escape cancels the edit: the handler on the form catches it from any of its fields.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <form
      className='flex min-w-0 flex-col gap-1.5'
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <Controller
        control={form.control}
        name='name'
        render={({ field, fieldState }) => {
          const errorKey = fieldState.error?.message === undefined ? undefined : ERROR_KEY[fieldState.error.message];

          return (
            <>
              <label htmlFor={inputId} className='sr-only'>
                {t('field.label', { device: device.label })}
              </label>
              <Input
                id={inputId}
                // The form opens on the "Rename" press: focus must land in the
                // field, not stay on the vanished button.
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
                autoFocus
                spellCheck={false}
                placeholder={device.ip}
                aria-describedby={hintId}
                aria-invalid={errorKey !== undefined}
                className='h-8 text-sm'
                {...field}
              />
              {errorKey === undefined ? (
                <p id={hintId} className='text-xs text-muted-foreground'>
                  {t('field.hint')}
                </p>
              ) : (
                <p id={hintId} role='alert' className='text-xs text-destructive'>
                  {t(errorKey, { limit: DEVICE_NAME_LIMIT })}
                </p>
              )}
            </>
          );
        }}
      />

      <div className='flex gap-2'>
        <Button type='submit' size='sm' disabled={!form.formState.isDirty || rename.isPending}>
          {t('save')}
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => {
            onDone(null);
          }}
        >
          {t('cancel')}
        </Button>
        {device.nameSource === CUSTOM_SOURCE && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='ml-auto'
            disabled={rename.isPending}
            onClick={() => {
              save('');
            }}
          >
            {t('useLease')}
          </Button>
        )}
      </div>
    </form>
  );
}
