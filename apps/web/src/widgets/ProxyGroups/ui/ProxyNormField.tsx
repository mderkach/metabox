import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Pencil } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useController, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useSaveOutboundMetadata } from '@entities/Proxy';
import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';
import { Button, InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@shared/ui';

import { PROXY_GROUPS_NS } from '../i18n/ProxyGroups.namespace.generated';
import { ProxyNormFormSchema, type ProxyNormFormModel } from '../model/ProxyMetadata.schema';

export function ProxyNormField({
  tag,
  usual,
  manual,
  onSaved,
}: {
  tag: string;
  usual: number | null;
  manual: boolean;
  onSaved: (tag: string) => void;
}) {
  const { t } = useTranslation(PROXY_GROUPS_NS);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const normDescriptionId = useId();
  const save = useSaveOutboundMetadata();
  const form = useForm<ProxyNormFormModel>({
    defaultValues: { norm: '' },
    resolver: zodResolver(ProxyNormFormSchema),
    mode: 'onChange',
  });
  const { field, fieldState } = useController({ control: form.control, name: 'norm' });
  const displayValue = usual === null ? '' : String(usual);
  const invalid = editing && fieldState.invalid;

  useLayoutEffect(
    function focusEditor() {
      if (!editing) return;

      input.current?.focus();
      input.current?.select();
    },
    [editing]
  );

  function handleOpen() {
    if (editing || save.isPending) return;

    form.reset({ norm: displayValue });
    setEditing(true);
  }

  function handleClose() {
    setEditing(false);
    action.current?.focus();
  }

  function saveNorm(normMs: number | undefined) {
    if (save.isPending) return;

    save.mutate(
      { tag, patch: { normMs } },
      {
        onSuccess() {
          handleClose();
          onSaved(tag);
        },
      }
    );
  }

  function commitNorm(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!editing) return;

    void form.handleSubmit(({ norm }) => {
      saveNorm(Number(norm));
    })(event);
  }

  function handleEscape(event: KeyboardEvent<HTMLInputElement | HTMLButtonElement>) {
    if (event.key !== 'Escape' || !editing || save.isPending) return;

    event.preventDefault();
    event.stopPropagation();
    handleClose();
  }

  function handleFieldKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (editing) commitNorm();
      else handleOpen();
      return;
    }
    handleEscape(event);
  }

  function handleActionKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (editing) commitNorm();
      else handleOpen();
      return;
    }
    handleEscape(event);
  }

  return (
    <form
      data-slot='proxy-node-norm'
      aria-busy={save.isPending}
      className='grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(5rem,max-content)] items-center gap-x-2'
      noValidate
      onSubmit={commitNorm}
    >
      <InputGroup className='pointer-coarse:h-11'>
        <InputGroupInput
          ref={(element) => {
            input.current = element;
            field.ref(element);
          }}
          name={field.name}
          className='min-w-0 rounded-s-lg ps-2 font-mono tabular-nums placeholder:font-sans placeholder:text-xs read-only:cursor-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring forced-colors:focus-visible:outline-[Highlight] pointer-coarse:text-base'
          aria-label={t('metadata.normField', { tag })}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          autoComplete='off'
          inputMode='numeric'
          required={editing}
          readOnly={!editing || save.isPending}
          placeholder={editing ? undefined : t('metadata.noNorm')}
          value={editing ? field.value : displayValue}
          onClick={handleOpen}
          onKeyDown={handleFieldKey}
          onBlur={field.onBlur}
          onChange={field.onChange}
        />
        <InputGroupAddon align='inline-end' className='h-full shrink-0 border-s py-0 ps-0 pe-0 has-[>button]:mr-0'>
          <InputGroupButton
            ref={action}
            size='icon-sm'
            className='rounded-s-none pointer-coarse:size-11'
            type='button'
            aria-label={t(editing ? 'metadata.saveNorm' : 'metadata.editNorm', { tag })}
            aria-describedby={editing ? undefined : normDescriptionId}
            aria-disabled={save.isPending}
            onClick={() => {
              if (editing) commitNorm();
              else handleOpen();
            }}
            onKeyDown={handleActionKey}
          >
            {editing ? <Check aria-hidden='true' /> : <Pencil aria-hidden='true' />}
          </InputGroupButton>
        </InputGroupAddon>
        <span id={normDescriptionId} className='sr-only'>
          {usual === null ? t('metadata.noNorm') : t('delay.value', { ns: SHARED_NS, value: usual })}
        </span>
        {invalid && (
          <span
            id={errorId}
            role='alert'
            className='absolute bottom-full z-10 mb-1 w-max max-w-[min(13.5rem,85vw)] rounded-md border border-destructive bg-popover px-2 py-1 text-xs text-destructive'
          >
            {t('metadata.invalidNorm')}
          </span>
        )}
      </InputGroup>
      <div className={cn('grid min-w-0 justify-items-start', !manual && 'invisible')} aria-hidden={!manual}>
        <span className='text-xs leading-tight text-muted-foreground'>{t('metadata.customNorm')}</span>
        <Button
          variant='link'
          size='sm'
          type='button'
          className='h-auto min-h-5 min-w-0 justify-start px-0 py-0 text-start text-xs leading-tight whitespace-normal underline underline-offset-2 pointer-coarse:min-h-11'
          aria-label={t('metadata.resetNorm', { tag })}
          aria-disabled={save.isPending}
          tabIndex={manual ? 0 : -1}
          onClick={() => {
            saveNorm(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              saveNorm(undefined);
              return;
            }
            handleEscape(event);
          }}
        >
          {t('metadata.returnAuto')}
        </Button>
      </div>
    </form>
  );
}
