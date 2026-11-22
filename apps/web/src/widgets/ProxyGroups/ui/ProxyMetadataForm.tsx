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
};

export function ProxyMetadataForm({
  id,
  tag,
  entry,
  onClose,
  onSaved,
}: {
  id: string;
  tag: string;
  entry: OutboundMetadata | undefined;
  onClose: () => void;
  onSaved: (tag: string, label?: string) => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const save = useSaveOutboundMetadata();
  const labelId = useId();
  const form = useForm<ProxyMetadataFormModel>({
    defaultValues: { label: entry?.label ?? '' },
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

  const submit = form.handleSubmit(({ label }) => {
    const name = label.trim() || undefined;

    save.mutate(
      {
        tag,
        patch: { label: name },
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

  return (
    // Escape cancels editing and returns focus to the pencil.
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
