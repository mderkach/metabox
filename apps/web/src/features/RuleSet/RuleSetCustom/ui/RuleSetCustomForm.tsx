import { zodResolver } from '@hookform/resolvers/zod';
import type { TFunction } from 'i18next';
import { CircleCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, RULE_SETS_PATH } from '@entities/Config';
import { Button, Input, Label, Textarea } from '@shared/ui';

import {
  RULE_SET_CUSTOM_ERROR,
  makeRuleSetCustomSchema,
  parseListEntries,
  ruleSetCustomDefaults,
  toInlineRuleSet,
  type RuleSetCustomModel,
} from '../model/RuleSetCustom.schema';

/**
 * Свой список доменов и адресов. Уходит в черновик узлом `inline` — правила
 * лежат в самом конфиге и применяются тем же протоколом, что и остальные
 * правки; большой список файлом `local` собирается отдельно.
 */
export function RuleSetCustomForm({ takenTags, onDone }: { takenTags: readonly string[]; onDone?: () => void }) {
  const { t } = useTranslation('features/RuleSet/RuleSetCustom');
  const insert = ConfigDocumentState.use.insert();
  const count = takenTags.length;
  const [added, setAdded] = useState<string | null>(null);
  const tagId = useId();
  const tagErrorId = useId();
  const entriesId = useId();
  const entriesHintId = useId();
  const entriesErrorId = useId();

  const form = useForm<RuleSetCustomModel>({
    defaultValues: ruleSetCustomDefaults(),
    mode: 'onTouched',
    resolver: zodResolver(makeRuleSetCustomSchema(takenTags)),
  });

  const onSubmit = form.handleSubmit((data) => {
    insert([...RULE_SETS_PATH, count], toInlineRuleSet(data));
    form.reset(ruleSetCustomDefaults());
    setAdded(data.tag.trim());
    onDone?.();
  });

  return (
    <form
      className='flex flex-col gap-4'
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <Controller
        control={form.control}
        name='tag'
        render={({ field, fieldState }) => (
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={tagId}>{t('field.tag.label')}</Label>
            <Input
              id={tagId}
              value={field.value}
              onChange={field.onChange}
              placeholder={t('field.tag.placeholder')}
              autoComplete='off'
              spellCheck={false}
              className='font-mono'
              aria-invalid={fieldState.error !== undefined}
              aria-describedby={fieldState.error === undefined ? undefined : tagErrorId}
            />
            <FieldError id={tagErrorId} t={t} error={fieldState.error?.message} entries={field.value} />
          </div>
        )}
      />

      <Controller
        control={form.control}
        name='entries'
        render={({ field, fieldState }) => (
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={entriesId}>{t('field.entries.label')}</Label>
            <Textarea
              id={entriesId}
              value={field.value}
              onChange={field.onChange}
              placeholder={t('field.entries.placeholder')}
              spellCheck={false}
              className='min-h-40 resize-none font-mono text-xs'
              aria-invalid={fieldState.error !== undefined}
              aria-describedby={fieldState.error === undefined ? entriesHintId : `${entriesHintId} ${entriesErrorId}`}
            />
            <p id={entriesHintId} className='text-xs text-pretty text-muted-foreground'>
              {t('field.entries.hint')}
            </p>
            <FieldError id={entriesErrorId} t={t} error={fieldState.error?.message} entries={field.value} />
          </div>
        )}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Button type='submit'>{t('submit')}</Button>
        {onDone !== undefined && (
          <Button type='button' variant='ghost' onClick={onDone}>
            {t('action.cancel', { ns: 'shared' })}
          </Button>
        )}
      </div>

      {added !== null && onDone === undefined && (
        <p role='status' className='flex items-start gap-1.5 text-xs text-pretty text-signal-ok'>
          <CircleCheck className='mt-px size-3.5 shrink-0' aria-hidden='true' />
          <span>{t('added', { tag: added })}</span>
        </p>
      )}
    </form>
  );
}

function FieldError({
  id,
  t,
  error,
  entries,
}: {
  id: string;
  t: TFunction<'features/RuleSet/RuleSetCustom'>;
  error: string | undefined;
  entries: string;
}) {
  const text = errorText(t, error, entries);

  return text === null ? null : (
    <p id={id} role='alert' className='text-xs text-destructive'>
      {text}
    </p>
  );
}

/** Код отказа схемы в текст; непонятой строке называется она сама. */
function errorText(
  t: TFunction<'features/RuleSet/RuleSetCustom'>,
  error: string | undefined,
  entries: string
): string | null {
  switch (error) {
    case undefined:
      return null;
    case RULE_SET_CUSTOM_ERROR.TagRequired:
      return t('error.tagRequired');
    case RULE_SET_CUSTOM_ERROR.TagTaken:
      return t('error.tagTaken');
    case RULE_SET_CUSTOM_ERROR.EntriesRequired:
      return t('error.entriesRequired');
    case RULE_SET_CUSTOM_ERROR.EntryInvalid:
      return t('error.entryInvalid', { entry: parseListEntries(entries).invalid ?? '' });
    default:
      return error;
  }
}
