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
 * Своё имя устройства прямо в строке списка. Поле держит только своё имя:
 * имя из аренды стоит подсказкой, и пустое поле возвращает подпись к нему.
 */
export function DeviceRenameForm({
  device,
  onDone,
}: {
  device: Device;
  /** Форма закрылась: имя сохранено (`label` — новая подпись) или правка отменена (`null`). */
  onDone: (label: string | null) => void;
}) {
  const { t } = useTranslation('features/Device/DeviceRename');
  const rename = useRenameDevice();
  const inputId = useId();
  const hintId = useId();
  const form = useForm<DeviceRenameModel>({
    defaultValues: { name: device.nameSource === CUSTOM_SOURCE ? device.name : '' },
    mode: 'onChange',
    resolver: zodResolver(DeviceRenameSchema),
  });

  const onSubmit = form.handleSubmit(({ name }) => {
    rename.mutate(
      { mac: device.mac, name },
      {
        onSuccess: (list) => {
          onDone(toDevices(list).find((item) => item.mac === device.mac)?.label ?? null);
        },
      }
    );
  });

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      onDone(null);
    }
  }

  return (
    // Escape отменяет правку: обработчик на форме ловит его из любого её поля.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- см. выше
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
                // Форма открывается по нажатию «Переименовать»: фокус обязан
                // оказаться в поле, а не остаться на исчезнувшей кнопке.
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- см. выше
                autoFocus
                spellCheck={false}
                placeholder={device.nameSource === CUSTOM_SOURCE ? device.ip : device.label}
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
      </div>
    </form>
  );
}
