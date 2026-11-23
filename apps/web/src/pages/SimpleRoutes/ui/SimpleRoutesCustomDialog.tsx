import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  ConfigDocumentStore,
  parseConfig,
  selectConfigCurrent,
  selectConfigStale,
  useConfigStale,
} from '@entities/Config';
import { getDevicesOptions, toDevices } from '@entities/Device';
import {
  Button,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  QueryFailure,
} from '@shared/ui';

import { isDeviceAddress, simpleTerminalConditions } from '../model/SimpleRoutes.conditions';
import { CustomRuleSchema, customExits, planCustomRule, type CustomRuleForm } from '../model/SimpleRoutes.custom';
import { SimpleRoutesCustomSelect } from './SimpleRoutesCustomSelect';

export function SimpleRoutesCustomDialog({
  text,
  initialOutbound,
  ruleIndex,
  changed,
  onAdded,
}: {
  text: string;
  initialOutbound?: string;
  ruleIndex?: number;
  changed: boolean;
  onAdded: () => void;
}) {
  const { t } = useTranslation('pages/SimpleRoutes');
  const addressId = useId();
  const serverChanged = useConfigStale();
  const config = useMemo(() => parseConfig(text).config, [text]);
  const exits = useMemo(() => customExits(config), [config]);
  const exception = ruleIndex !== undefined;
  const subject = exception ? simpleTerminalConditions(config?.route?.rules?.[ruleIndex])?.entries?.join(', ') : '';
  const inventory = useQuery({ ...getDevicesOptions(), enabled: exception, select: toDevices });
  const devices = useMemo(() => {
    const rows = inventory.data ?? [];
    const seen = new Set<string>();
    const ambiguous = new Set<string>();
    for (const { ip } of rows) {
      if (seen.has(ip)) ambiguous.add(ip);
      seen.add(ip);
    }
    return rows
      .filter(({ ip }) => !ambiguous.has(ip) && isDeviceAddress(ip))
      .map((row) => ({
        ...row,
        value: `${row.mac}/${row.ip}`,
        label: row.label === row.ip ? row.ip : `${row.label} · ${row.ip}`,
      }));
  }, [inventory.data]);
  const form = useForm<CustomRuleForm>({
    defaultValues: {
      address: '',
      device: '',
      outbound: exits.find((tag) => tag === initialOutbound) ?? (exits.length === 1 ? exits[0] : ''),
    },
    resolver: zodResolver(CustomRuleSchema),
  });
  const [address, device, outbound] = useWatch({ control: form.control, name: ['address', 'device', 'outbound'] });
  const selected = devices.find((row) => row.value === device);
  const plan = useMemo(
    () =>
      outbound !== '' && (exception ? selected !== undefined : address.trim() !== '')
        ? planCustomRule(text, { address, device: selected?.ip ?? '', outbound }, ruleIndex)
        : undefined,
    [text, address, outbound, exception, selected, ruleIndex]
  );
  const stale = changed || serverChanged || !!form.formState.errors.root;
  const submit = form.handleSubmit(() => {
    if (plan?.ok !== true) return;
    const state = ConfigDocumentStore.getState();
    if (selectConfigCurrent(state) !== text || selectConfigStale(state)) {
      form.setError('root', { type: 'stale' });
      return;
    }
    state.replace(plan.text);
    onAdded();
  });
  const scope = selected?.label ?? t('custom.all');

  return (
    <DialogContent
      showCloseButton={false}
      className='max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto overscroll-contain sm:max-w-md'
    >
      <DialogHeader>
        <DialogTitle>{t(exception ? 'custom.exceptionTitle' : 'custom.title')}</DialogTitle>
        <DialogDescription className='wrap-anywhere'>
          {exception ? t('custom.exceptionDescription', { position: ruleIndex + 1, subject }) : t('custom.description')}
        </DialogDescription>
      </DialogHeader>
      <FormProvider {...form}>
        <form
          className='grid min-w-0 gap-3'
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          {exception ? (
            <>
              {inventory.isLoadingError && <QueryFailure query={inventory} messageKey='source.devices' />}
              <SimpleRoutesCustomSelect name='device' items={devices} />
              {selected && !selected.static && (
                <p className='text-sm text-muted-foreground'>{t('custom.dynamic', { ip: selected.ip })}</p>
              )}
            </>
          ) : (
            <div className='grid gap-1.5'>
              <Label htmlFor={addressId}>{t('custom.address')}</Label>
              <Controller
                control={form.control}
                name='address'
                render={({ field }) => (
                  <Input
                    {...field}
                    id={addressId}
                    autoComplete='off'
                    spellCheck={false}
                    placeholder='example.org'
                    aria-invalid={plan?.ok === false && plan.reason === 'invalid'}
                  />
                )}
              />
            </div>
          )}
          <SimpleRoutesCustomSelect name='outbound' items={exits.map((value) => ({ value, label: value }))} />
          <div role='status' className='grid min-w-0 gap-1 text-sm wrap-anywhere'>
            {plan?.ok === true && (
              <>
                <p>{t('custom.preview', { position: plan.position, scope, outbound })}</p>
                {plan.before && (
                  <p className='text-muted-foreground'>
                    {t('custom.before', { position: plan.position, next: plan.position + 1 })}
                  </p>
                )}
              </>
            )}
            {plan?.ok === false && <p>{t(`custom.${plan.reason}`, { position: plan.position })}</p>}
            {stale && <p className='text-destructive'>{t('custom.stale')}</p>}
          </div>
          <div className='flex flex-wrap justify-end gap-2 pt-1'>
            <DialogClose render={<Button type='button' variant='ghost' />}>{t('custom.cancel')}</DialogClose>
            <Button type='submit' disabled={stale || plan?.ok !== true}>
              {t('custom.submit')}
            </Button>
          </div>
        </form>
      </FormProvider>
    </DialogContent>
  );
}
