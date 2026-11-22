import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys } from 'i18next';
import { useEffect, useId, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useSaveOutboundMetadata, type OutboundMetadata } from '@entities/Proxy';
import { Button, Input } from '@shared/ui';

import {
  METADATA_FORM_ERROR,
  ProxyMetadataFormSchema,
  type ProxyMetadataFormModel,
} from '../model/ProxyMetadata.schema';

const ERROR_KEY: Readonly<Record<string, ParseKeys<'widgets/ProxyGroups'> | undefined>> = {
  [METADATA_FORM_ERROR.LabelTooLong]: 'metadata.labelTooLong',
  [METADATA_FORM_ERROR.ControlChars]: 'metadata.controlChars',
  [METADATA_FORM_ERROR.InvalidNorm]: 'metadata.invalidNorm',
};

export function ProxyMetadataForm({
  id,
  tag,
  entry,
  server,
  computedNorm,
  onClose,
  onSaved,
}: {
  id: string;
  tag: string;
  entry: OutboundMetadata | undefined;
  server: boolean;
  computedNorm?: number | null | undefined;
  onClose: () => void;
  onSaved: (tag: string, label?: string) => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const save = useSaveOutboundMetadata();
  const labelId = useId();
  const normId = useId();
  const form = useForm<ProxyMetadataFormModel>({
    defaultValues: { label: entry?.label ?? '', norm: entry?.normMs?.toString() ?? '' },
    mode: 'onChange',
    resolver: zodResolver(ProxyMetadataFormSchema),
  });
  const { setFocus } = form;

  useEffect(
    function focusLabel() {
      setFocus('label');
    },
    [setFocus]
  );

  const submit = form.handleSubmit(({ label, norm }) => {
    const name = label.trim() || undefined;
    let normMs = entry?.normMs;
    if (server) normMs = norm === '' ? undefined : Number(norm);

    save.mutate(
      {
        tag,
        entry: {
          ...(name === undefined ? {} : { label: name }),
          ...(normMs === undefined ? {} : { normMs }),
        },
      },
      {
        onSuccess() {
          onSaved(tag, name);
          onClose();
        },
      }
    );
  });

  function handleEscape(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape' || save.isPending) return;

    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  const { errors, isDirty } = form.formState;
  const labelError = ERROR_KEY[errors.label?.message ?? ''];
  const normError = ERROR_KEY[errors.norm?.message ?? ''];

  return (
    // Escape cancels whenever focus is in either field.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <form
      id={id}
      noValidate
      className='flex min-w-0 flex-col gap-3 rounded-md border border-border px-3 py-2.5'
      onKeyDown={handleEscape}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className='grid min-w-0 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]'>
        <div className='flex min-w-0 flex-col gap-1'>
          <label htmlFor={labelId} className='text-xs font-medium'>
            {t('metadata.label')}
          </label>
          <Input
            id={labelId}
            autoComplete='off'
            spellCheck={false}
            placeholder={tag}
            aria-invalid={labelError !== undefined}
            aria-describedby={`${labelId}-hint`}
            readOnly={save.isPending}
            {...form.register('label')}
          />
          <p
            id={`${labelId}-hint`}
            role={labelError === undefined ? undefined : 'alert'}
            className={labelError === undefined ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}
          >
            {labelError === undefined ? t('metadata.labelHint') : t(labelError)}
          </p>
        </div>
        {server && (
          <div className='flex min-w-0 flex-col gap-1'>
            <label htmlFor={normId} className='text-xs font-medium'>
              {t('metadata.norm')}
            </label>
            <Input
              id={normId}
              inputMode='numeric'
              aria-invalid={normError !== undefined}
              aria-describedby={`${normId}-hint`}
              readOnly={save.isPending}
              {...form.register('norm')}
            />
            <p
              id={`${normId}-hint`}
              role={normError === undefined ? undefined : 'alert'}
              className={normError === undefined ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}
            >
              {normError !== undefined && t(normError)}
              {normError === undefined &&
                computedNorm != null &&
                t('metadata.normHintMeasured', { value: computedNorm })}
              {normError === undefined && computedNorm == null && t('metadata.normHint')}
            </p>
          </div>
        )}
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button type='submit' size='sm' className='max-sm:min-h-11' disabled={!isDirty || save.isPending}>
          {t('metadata.save')}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          className='max-sm:min-h-11'
          disabled={save.isPending}
          onClick={onClose}
        >
          {t('action.cancel', { ns: 'shared' })}
        </Button>
      </div>
    </form>
  );
}
