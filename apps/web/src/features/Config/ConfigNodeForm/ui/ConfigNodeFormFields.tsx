import type { ParseKeys, TFunction } from 'i18next';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { use, useEffect, useId, useState, type ReactNode } from 'react';
import { Controller, useFormContext, type FieldError as FormFieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { parseJsonc } from '@shared/lib/jsonc';
import type { FieldPlan } from '@shared/lib/schemaShape';
import { cn } from '@shared/lib/utils';
import {
  Button,
  FieldLegend,
  FieldSet,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@shared/ui';

import {
  isFilledGroup,
  isSameValue,
  isUnset,
  listToText,
  packList,
  parseNumber,
  parseScalar,
  textToList,
  toInputText,
  UNSET,
  unpackList,
  type ConfigNodeFormModel,
} from '../model';
import { RAW_PARSE_ERROR, RawFailuresContext } from './ConfigNodeForm.context';

const NS = 'features/Config/ConfigNodeForm';

/** Отступ JSON подузла: тот же, что у файла конфига. */
const JSON_INDENT = 2;

/** Пустой пункт селекта: значение `""` перечисления и «ключа нет» значат одно и то же. */
const ENUM_UNSET = '';

/** Пропсы виджета поля: план поля из схемы и имя поля формы. */
export interface NodeFieldProps {
  field: FieldPlan;
  /** Путь поля от корня узла через точку. */
  name: string;
  /** Поля группы, уже собранные рендерером. */
  children?: ReactNode;
}

/**
 * Код замечания Zod в текст: сгенерированная схема кодов отказа не несёт,
 * переводить приходится по коду замечания, который резолвер кладёт в `type`.
 */
const ERROR_KEY: Readonly<Record<string, ParseKeys<typeof NS> | undefined>> = {
  invalid_format: 'error.duration',
  too_small: 'error.tooSmall',
  invalid_type: 'error.type',
};

function errorText(t: TFunction<typeof NS>, error: FormFieldError | undefined): string | null {
  if (error === undefined) {
    return null;
  }

  if (error.type === RAW_PARSE_ERROR) {
    return t('error.parse', { reason: error.message ?? '' });
  }

  return t(ERROR_KEY[error.type] ?? 'error.invalid');
}

/** Подпись, поле и ошибка поля: каркас, общий для виджетов-значений. */
function FieldRow({
  id,
  label,
  errorId,
  error,
  children,
  aside = null,
}: {
  id: string;
  label: string;
  errorId: string;
  error: string | null;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex min-h-6 items-center gap-2'>
        <Label htmlFor={id} className='font-mono text-xs'>
          {label}
        </Label>
        {aside}
      </div>
      {children}
      {error !== null && (
        <p id={errorId} role='alert' className='text-xs text-destructive'>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Текст поля поверх значения формы. Набранное держится своим состоянием: из
 * значения его не восстановить — недописанная строка списка или JSON ещё не
 * значение. Значение, сменившееся снаружи (правка узла текстом, сброс формы),
 * переписывает текст.
 */
function useFieldText(value: unknown, format: (value: unknown) => string) {
  const [draft, setDraft] = useState(() => ({ text: format(value), value }));

  if (!isSameValue(draft.value, value)) {
    const synced = { text: format(value), value };

    setDraft(synced);

    return { text: synced.text, setDraft };
  }

  return { text: draft.text, setDraft };
}

function TextField({ field, name, placeholder }: NodeFieldProps & { placeholder?: string }) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <FieldRow id={id} label={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
          <Input
            id={id}
            value={toInputText(input.value)}
            placeholder={placeholder}
            autoComplete='off'
            spellCheck={false}
            className='font-mono text-xs'
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            onBlur={input.onBlur}
            onChange={(event) => {
              input.onChange(event.target.value === '' ? UNSET : event.target.value);
            }}
          />
        </FieldRow>
      )}
    />
  );
}

export function StringField(props: NodeFieldProps) {
  return <TextField {...props} />;
}

export function DurationField(props: NodeFieldProps) {
  const { t } = useTranslation(NS);

  return <TextField {...props} placeholder={t('duration.placeholder')} />;
}

export function NumberField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <FieldRow id={id} label={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
          <Input
            id={id}
            type='number'
            value={toInputText(input.value)}
            className='font-mono text-xs'
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            onBlur={input.onBlur}
            onChange={(event) => {
              input.onChange(parseNumber(event.target.value));
            }}
          />
        </FieldRow>
      )}
    />
  );
}

/** Строка или число одним полем: `routing_mark` бывает и `255`, и `"0xff"`. */
export function ScalarField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <FieldRow id={id} label={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
          <Input
            id={id}
            value={toInputText(input.value)}
            autoComplete='off'
            spellCheck={false}
            className='font-mono text-xs'
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            onBlur={input.onBlur}
            onChange={(event) => {
              input.onChange(parseScalar(event.target.value));
            }}
          />
        </FieldRow>
      )}
    />
  );
}

/**
 * Флаг. Выключенный и незаданный — разные состояния: `false` пишется в файл,
 * а незаданный оставляет бинарю его значение по умолчанию. Поэтому у флага
 * есть сброс, удаляющий ключ.
 */
export function BooleanField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <FieldRow
          id={id}
          label={field.key}
          errorId={errorId}
          error={errorText(t, fieldState.error)}
          aside={
            isUnset(input.value) ? (
              <span className='text-xs text-muted-foreground'>{t('boolean.unset')}</span>
            ) : (
              <Button
                type='button'
                variant='ghost'
                size='icon-xs'
                aria-label={t('boolean.reset', { name: field.key })}
                onClick={() => {
                  input.onChange(UNSET);
                }}
              >
                <RotateCcw />
              </Button>
            )
          }
        >
          <Switch
            id={id}
            checked={input.value === true}
            aria-invalid={fieldState.invalid}
            onCheckedChange={(checked) => {
              input.onChange(checked);
            }}
          />
        </FieldRow>
      )}
    />
  );
}

export function EnumField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();
  const items = [
    { value: ENUM_UNSET, label: t('enum.unset') },
    ...(field.options ?? [])
      .filter((option) => option !== ENUM_UNSET)
      .map((option) => ({ value: option, label: option })),
  ];

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <FieldRow id={id} label={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
          <Select
            items={items}
            value={typeof input.value === 'string' ? input.value : ENUM_UNSET}
            onValueChange={(next: string | null) => {
              input.onChange(next === null || next === ENUM_UNSET ? UNSET : next);
            }}
          >
            <SelectTrigger
              id={id}
              className='w-full font-mono text-xs'
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? errorId : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value} className='font-mono text-xs'>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      )}
    />
  );
}

/** Список строк: значение на строку. */
export function ListField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();
  const hintId = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <FieldRow id={id} label={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
          <ListInput
            id={id}
            value={input.value}
            invalid={fieldState.invalid}
            describedBy={fieldState.invalid ? `${hintId} ${errorId}` : hintId}
            onBlur={input.onBlur}
            onChange={(text) => textToList(text, field.listable === true)}
            onValue={input.onChange}
          />
          <p id={hintId} className='text-xs text-muted-foreground'>
            {t('list.hint')}
          </p>
        </FieldRow>
      )}
    />
  );
}

function ListInput({
  id,
  value,
  invalid,
  describedBy,
  onBlur,
  onChange,
  onValue,
}: {
  id: string;
  value: unknown;
  invalid: boolean;
  describedBy: string;
  onBlur: () => void;
  /** Текст поля в значение формы. */
  onChange: (text: string) => unknown;
  onValue: (value: unknown) => void;
}) {
  const { text, setDraft } = useFieldText(value, listToText);

  return (
    <Textarea
      id={id}
      value={text}
      spellCheck={false}
      className='min-h-16 font-mono text-xs'
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onBlur={onBlur}
      onChange={(event) => {
        const next = onChange(event.target.value);

        setDraft({ text: event.target.value, value: next });
        onValue(next);
      }}
    />
  );
}

/** Набор значений перечисления: каждое включается своей кнопкой. */
export function EnumListField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const labelId = useId();
  const errorId = useId();
  const options = field.options ?? [];

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <div className='flex flex-col gap-1.5'>
          <span id={labelId} className='font-mono text-xs font-medium'>
            {field.key}
          </span>
          <ToggleGroup
            multiple
            spacing={1}
            aria-labelledby={labelId}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            value={unpackList(input.value)}
            onValueChange={(next) => {
              // Порядок — порядок схемы, а не нажатий: иначе тот же набор
              // давал бы разный текст файла.
              input.onChange(
                packList(
                  options.filter((option) => next.includes(option)),
                  field.listable === true
                )
              );
            }}
          >
            {options.map((option) => (
              <ToggleGroupItem key={option} value={option} variant='outline' size='sm' className='font-mono text-xs'>
                {option}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {fieldState.invalid && (
            <p id={errorId} role='alert' className='text-xs text-destructive'>
              {errorText(t, fieldState.error)}
            </p>
          )}
        </div>
      )}
    />
  );
}

function toJsonText(value: unknown): string {
  return isUnset(value) ? '' : JSON.stringify(value, null, JSON_INDENT);
}

/**
 * Поле, вид которого форма не знает: JSON-значение текстом. Поле не теряется и
 * форму не валит; неразобранный текст не стирается, а останавливает запись.
 */
export function RawField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { control } = useFormContext<ConfigNodeFormModel>();
  const failures = use(RawFailuresContext);
  const id = useId();
  const errorId = useId();
  const hintId = useId();
  const [failure, setFailure] = useState<{ reason: string; value: unknown } | null>(null);

  // Свёрнутая группа снимает поле вместе с набранным текстом: его отказ
  // запись больше не останавливает.
  useEffect(
    function trackRawFailure() {
      return function forgetRawFailure() {
        failures.delete(name);
      };
    },
    [failures, name]
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => {
        // Отказ относится к значению, при котором текст не разобрался: значение,
        // сменившееся снаружи, переписало и текст поля.
        const reason = failure !== null && isSameValue(failure.value, input.value) ? failure.reason : null;

        return (
          <FieldRow
            id={id}
            label={field.key}
            errorId={errorId}
            error={reason === null ? errorText(t, fieldState.error) : t('error.parse', { reason })}
          >
            <RawInput
              id={id}
              value={input.value}
              invalid={reason !== null || fieldState.invalid}
              describedBy={reason !== null || fieldState.invalid ? `${hintId} ${errorId}` : hintId}
              onBlur={input.onBlur}
              onParsed={(value) => {
                failures.delete(name);
                setFailure(null);
                input.onChange(value);
              }}
              onFailure={(text) => {
                failures.set(name, input.value);
                setFailure({ reason: text, value: input.value });
              }}
            />
            <p id={hintId} className='text-xs text-muted-foreground'>
              {t('raw.hint')}
            </p>
          </FieldRow>
        );
      }}
    />
  );
}

function RawInput({
  id,
  value,
  invalid,
  describedBy,
  onBlur,
  onParsed,
  onFailure,
}: {
  id: string;
  value: unknown;
  invalid: boolean;
  describedBy: string;
  onBlur: () => void;
  onParsed: (value: unknown) => void;
  onFailure: (reason: string) => void;
}) {
  const { text, setDraft } = useFieldText(value, toJsonText);

  return (
    <Textarea
      id={id}
      value={text}
      spellCheck={false}
      className='min-h-20 font-mono text-xs'
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onBlur={onBlur}
      onChange={(event) => {
        const next = event.target.value;

        if (next.trim() === '') {
          setDraft({ text: next, value: UNSET });
          onParsed(UNSET);

          return;
        }

        const { value: parsed, failure } = parseJsonc(next);

        if (failure !== null) {
          // Значение формы прежнее: в черновик уйдёт только разобранное.
          setDraft({ text: next, value });
          onFailure(failure.text);

          return;
        }

        setDraft({ text: next, value: parsed });
        onParsed(parsed);
      }}
    />
  );
}

/**
 * Вложенный объект: свои поля под общей подписью. Свёрнут, пока в нём ничего
 * не задано, — длинный тип иначе открывался бы стеной полей TLS и мультиплекса.
 * Свёрнутые поля не монтируются: значения формы при этом не теряются.
 */
export function GroupField({ field, name, children }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const { getValues } = useFormContext<ConfigNodeFormModel>();
  const [open, setOpen] = useState(() => isFilledGroup(getValues(name)));
  const contentId = useId();

  return (
    <FieldSet className='gap-3 rounded-lg border border-border p-3'>
      <FieldLegend variant='label' className='mb-0 px-1'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={t('group.toggle', { name: field.key })}
          className='-mx-1 font-mono text-xs'
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
          {field.key}
        </Button>
      </FieldLegend>
      <div id={contentId} hidden={!open} className='flex flex-col gap-3'>
        {open && children}
      </div>
    </FieldSet>
  );
}
