import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';

import { ACL_MODE, sourceIpError, type DataplaneModel } from '@entities/Dataplane';
import { cn } from '@shared/lib/utils';
import { Button, CARD_TITLE, ConfirmDialog, FORM_ACTIONS, SURFACE, TokenInput } from '@shared/ui';

import { DEVICE_ROUTE_ERROR, DeviceRouteSubnetsSchema, type DeviceRouteSubnetsModel } from '../model';
import { DeviceRouteSubnetsError } from './DeviceRouteSubnetsError';

function isValidEntry(entry: string): boolean {
  return sourceIpError(entry) === null;
}

/**
 * The `source_ip` list: addresses and subnets whose devices go through
 * sing-box. The list is edited as a draft and goes to the device whole, through
 * the same confirmation window as the device toggle. After a confirmed change
 * the draft follows the model reread from the device; after a rollback the
 * typed list stays as a draft over the restored one.
 */
export function DeviceRouteSubnets({
  model,
  locked,
  onApply,
}: {
  model: DataplaneModel;
  locked: boolean;
  onApply: (sourceIp: string[]) => void;
}) {
  const { t } = useTranslation('features/Device/DeviceRoute');
  const titleId = useId();
  const hintId = useId();
  const [confirming, setConfirming] = useState(false);
  const applied = useMemo(() => ({ sourceIp: [...model.sourceIp] }), [model.sourceIp]);
  const form = useForm<DeviceRouteSubnetsModel>({
    defaultValues: applied,
    values: applied,
    resetOptions: { keepDirtyValues: true },
    mode: 'onChange',
    resolver: zodResolver(DeviceRouteSubnetsSchema),
  });
  const { isDirty } = form.formState;

  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col gap-3 px-4 py-3.5', SURFACE)}>
      <div className='flex flex-col gap-1'>
        <h2 id={titleId} className={CARD_TITLE}>
          {t('subnets.title')}
        </h2>
        <p className='max-w-prose text-xs text-pretty text-muted-foreground'>
          {model.aclMode === ACL_MODE.All ? (
            t('subnets.forAll')
          ) : (
            <Trans t={t} i18nKey='subnets.description' components={{ code: <code className='font-mono' /> }} />
          )}
        </p>
      </div>

      <form
        noValidate
        className='flex flex-col gap-2'
        onSubmit={(event) => {
          void form.handleSubmit(function askConfirmation() {
            setConfirming(true);
          })(event);
        }}
      >
        <Controller
          control={form.control}
          name='sourceIp'
          render={({ field, fieldState }) => (
            <>
              <TokenInput
                label={t('subnets.title')}
                aria-labelledby={titleId}
                aria-describedby={hintId}
                aria-invalid={fieldState.invalid}
                spellCheck={false}
                autoCapitalize='off'
                autoComplete='off'
                inputMode='decimal'
                placeholder={t('subnets.placeholder')}
                isValid={isValidEntry}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
              {fieldState.error?.message === DEVICE_ROUTE_ERROR.SourceIpInvalid ? (
                <DeviceRouteSubnetsError id={hintId} entries={field.value} />
              ) : (
                <p id={hintId} className='text-xs text-muted-foreground'>
                  {t('subnets.hint')}
                </p>
              )}
            </>
          )}
        />

        <div className={FORM_ACTIONS}>
          {isDirty && (
            <Button
              type='button'
              variant='ghost'
              onClick={() => {
                // `resetOptions` of the form apply to an explicit reset too and would keep the typed entries.
                form.reset(applied, { keepDirtyValues: false });
              }}
            >
              {t('subnets.reset')}
            </Button>
          )}
          <Button type='submit' disabled={locked || !isDirty}>
            {t('subnets.apply')}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('subnets.dialog')}
        description={t('dialog.description')}
        cancelLabel={t('dialog.cancel')}
        confirmLabel={t('dialog.apply')}
        onConfirm={() => {
          onApply(form.getValues('sourceIp'));
        }}
      />
    </section>
  );
}
