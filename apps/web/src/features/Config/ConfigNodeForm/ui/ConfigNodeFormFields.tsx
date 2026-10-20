import type { ParseKeys, TFunction } from 'i18next';
import { ChevronRight, Eye, EyeOff, RotateCcw } from 'lucide-react';
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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
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
  NODE_OVERRIDE_ERROR,
  packList,
  parseNumber,
  parseScalar,
  SECRET_MASK,
  secretMaskOf,
  textToList,
  toInputText,
  UNSET,
  unpackList,
  type ConfigNodeFormModel,
  type SecretMask,
} from '../model';
import { RAW_PARSE_ERROR, RawFailuresContext } from './ConfigNodeForm.context';
import { useFieldLabel } from './ConfigNodeForm.labels';
import { ConfigNodeFormFieldName } from './ConfigNodeFormFieldName';

const NS = 'features/Config/ConfigNodeForm';

/** Indent of a sub-node JSON: the same as the config file's. */
const JSON_INDENT = 2;

/** Empty select item: the enum value `""` and "no key" mean the same thing. */
const ENUM_UNSET = '';

/** Field widget props: the field plan from the schema and the form field name. */
export interface NodeFieldProps {
  field: FieldPlan;
  /** Field path from the node root, dotted. */
  name: string;
  /** Group fields already assembled by the renderer. */
  children?: ReactNode;
}

/**
 * Remark code into text. The generated schema carries no failure codes, so the
 * translation goes by the Zod remark code that the resolver puts into `type`;
 * override checks put their own code there.
 */
const ERROR_KEY: Readonly<Record<string, ParseKeys<typeof NS> | undefined>> = {
  invalid_format: 'error.duration',
  too_small: 'error.tooSmall',
  invalid_type: 'error.type',
  [NODE_OVERRIDE_ERROR.Required]: 'error.required',
  [NODE_OVERRIDE_ERROR.RealityPublicKey]: 'error.realityPublicKey',
  [NODE_OVERRIDE_ERROR.RealityShortId]: 'error.realityShortId',
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

/** Label, field and field error: a frame shared by value widgets. */
function FieldRow({
  id,
  name,
  fieldKey,
  errorId,
  error,
  children,
  aside = null,
}: {
  id: string;
  name: string;
  fieldKey: string;
  errorId: string;
  error: string | null;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const label = useFieldLabel(name);

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex min-h-6 items-center gap-2'>
        <Label htmlFor={id} className='flex-wrap gap-x-2 gap-y-0.5'>
          <ConfigNodeFormFieldName label={label} fieldKey={fieldKey} />
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
 * Field text on top of the form value. What was typed is held in its own state:
 * it cannot be restored from the value, since an unfinished list line or JSON
 * is not a value yet. A value that changed from outside (a node text edit, a
 * form reset) rewrites the text.
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
        <FieldRow id={id} name={name} fieldKey={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
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
  const mask = secretMaskOf(props.field.path);

  return mask === null ? <TextField {...props} /> : <SecretField {...props} mask={mask} />;
}

/** Characters in place of a hidden secret or of the part of a URL after the host. */
const MASK = '••••••';

/**
 * URL with everything after the host masked: credentials, path, query, anchor.
 * `null` means there is nothing to hide, the URL is just a host.
 */
function maskUrl(text: string): string | null {
  if (!URL.canParse(text)) {
    return MASK;
  }

  const url = new URL(text);
  const tail = `${url.username}${url.password}${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}`;

  return tail === '' ? null : `${url.protocol}//${url.host}/${MASK}`;
}

/**
 * Value of a secret field with every non-empty string inside masked: sing-box
 * accepts a key as a list of PEM lines and a header as a list of values.
 */
function maskValue(value: unknown, mask: SecretMask): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, mask));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskValue(item, mask)]));
  }

  if (typeof value !== 'string' || value === '') {
    return value;
  }

  return mask === SECRET_MASK.Whole ? MASK : (maskUrl(value) ?? value);
}

/**
 * JSON value with secret keys masked at any depth, by the same names and rule
 * as `SecretField`.
 */
function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSecrets);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const mask = secretMaskOf([key]);

      return [key, mask === null ? maskSecrets(item) : maskValue(item, mask)];
    })
  );
}

/**
 * Field JSON text with secrets masked; `null` means there is nothing to hide.
 * `mask` is the mask of the field itself: then everything inside it is hidden.
 */
function maskedJsonText(value: unknown, mask: SecretMask | null): string | null {
  const masked = mask === null ? maskSecrets(value) : maskValue(value, mask);

  return isSameValue(masked, value) ? null : toJsonText(masked);
}

/** List field text with every item masked; `null` means there is nothing to hide. */
function maskedListText(value: unknown, mask: SecretMask): string | null {
  const masked = maskValue(value, mask);

  return isSameValue(masked, value) ? null : listToText(masked);
}

/**
 * Secret: hidden until revealed with a button. The hiding is on screen only:
 * the form value, and with it the draft and the diff, stay full. A fully hidden
 * secret is edited blind, like a password; for a URL the part before the path
 * is visible, and editing opens by revealing: masked text is not a value.
 */
function SecretField({ field, name, mask }: NodeFieldProps & { mask: SecretMask }) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name) ?? field.key;
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();
  const [revealed, setRevealed] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => {
        const text = toInputText(input.value);
        const masked = mask === SECRET_MASK.AfterHost && !revealed && text !== '' ? maskUrl(text) : null;

        return (
          <FieldRow id={id} name={name} fieldKey={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
            <InputGroup>
              <InputGroupInput
                id={id}
                type={mask === SECRET_MASK.Whole && !revealed ? 'password' : 'text'}
                value={masked ?? text}
                readOnly={masked !== null}
                autoComplete='off'
                spellCheck={false}
                className='font-mono text-xs'
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.invalid ? errorId : undefined}
                onBlur={input.onBlur}
                onChange={(event) => {
                  // A URL typed into an empty field is not hidden at the first character.
                  if (mask === SECRET_MASK.AfterHost) {
                    setRevealed(true);
                  }

                  input.onChange(event.target.value === '' ? UNSET : event.target.value);
                }}
              />
              <InputGroupAddon align='inline-end'>
                <InputGroupButton
                  size='icon-xs'
                  aria-label={t(revealed ? 'secret.hide' : 'secret.show', { name: label })}
                  aria-controls={id}
                  onClick={() => {
                    setRevealed(!revealed);
                  }}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </FieldRow>
        );
      }}
    />
  );
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
        <FieldRow id={id} name={name} fieldKey={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
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

/** String or number in one field: `routing_mark` can be both `255` and `"0xff"`. */
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
        <FieldRow id={id} name={name} fieldKey={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
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
 * Flag. Off and unset are different states: `false` is written to the file,
 * while unset leaves the binary its default value. So the flag has a reset that
 * deletes the key.
 */
export function BooleanField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name) ?? field.key;
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
          name={name}
          fieldKey={field.key}
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
                aria-label={t('boolean.reset', { name: label })}
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
        <FieldRow id={id} name={name} fieldKey={field.key} errorId={errorId} error={errorText(t, fieldState.error)}>
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

/** List of strings: one value per line. */
export function ListField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name) ?? field.key;
  const { control } = useFormContext<ConfigNodeFormModel>();
  const id = useId();
  const errorId = useId();
  const hintId = useId();
  const mask = secretMaskOf(field.path);
  const [revealed, setRevealed] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => {
        const masked = mask === null ? null : maskedListText(input.value, mask);
        const describedBy = fieldState.invalid ? `${hintId} ${errorId}` : hintId;

        return (
          <FieldRow
            id={id}
            name={name}
            fieldKey={field.key}
            errorId={errorId}
            error={errorText(t, fieldState.error)}
            aside={
              masked !== null && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  aria-label={t(revealed ? 'secret.hide' : 'secret.show', { name: label })}
                  aria-controls={id}
                  onClick={() => {
                    setRevealed(!revealed);
                  }}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </Button>
              )
            }
          >
            {masked !== null && !revealed ? (
              <Textarea
                id={id}
                value={masked}
                readOnly
                spellCheck={false}
                className='min-h-16 font-mono text-xs'
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy}
              />
            ) : (
              <ListInput
                id={id}
                value={input.value}
                invalid={fieldState.invalid}
                describedBy={describedBy}
                onBlur={input.onBlur}
                onChange={(text) => textToList(text, field.listable === true)}
                onValue={input.onChange}
              />
            )}
            <p id={hintId} className='text-xs text-muted-foreground'>
              {t('list.hint')}
            </p>
          </FieldRow>
        );
      }}
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
  /** Field text into a form value. */
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

/** Set of enum values: each is turned on by its own button. */
export function EnumListField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name);
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
          <span id={labelId} className='flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium'>
            <ConfigNodeFormFieldName label={label} fieldKey={field.key} />
          </span>
          <ToggleGroup
            multiple
            spacing={1}
            aria-labelledby={labelId}
            aria-describedby={fieldState.invalid ? errorId : undefined}
            value={unpackList(input.value)}
            onValueChange={(next) => {
              // The order is the schema order, not the press order: otherwise
              // the same set would give different file text.
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
 * Field whose kind the form does not know: a JSON value as text. The field is
 * not lost and does not break the form; unparsed text is not erased but stops
 * the write. A value with secrets is shown masked and read-only until revealed
 * with a button: masked text is not a value.
 */
export function RawField({ field, name }: NodeFieldProps) {
  const { t } = useTranslation(NS);
  const label = useFieldLabel(name) ?? field.key;
  const { control } = useFormContext<ConfigNodeFormModel>();
  const failures = use(RawFailuresContext);
  const id = useId();
  const errorId = useId();
  const hintId = useId();
  const [failure, setFailure] = useState<{ reason: string; value: unknown } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const mask = secretMaskOf(field.path);

  // A collapsed group removes the field together with the typed text: its
  // failure no longer stops the write.
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
        // The failure belongs to the value at which the text did not parse: a
        // value that changed from outside rewrote the field text too.
        const reason = failure !== null && isSameValue(failure.value, input.value) ? failure.reason : null;
        const masked = maskedJsonText(input.value, mask);
        const hidden = revealed ? null : masked;
        const invalid = reason !== null || fieldState.invalid;
        const describedBy = invalid ? `${hintId} ${errorId}` : hintId;

        return (
          <FieldRow
            id={id}
            name={name}
            fieldKey={field.key}
            errorId={errorId}
            error={reason === null ? errorText(t, fieldState.error) : t('error.parse', { reason })}
            aside={
              masked !== null && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  aria-label={t(revealed ? 'secret.hide' : 'secret.show', { name: label })}
                  aria-controls={id}
                  onClick={() => {
                    // Switching between the mask and the text drops unparsed text: its failure goes with it.
                    failures.delete(name);
                    setFailure(null);
                    setRevealed(!revealed);
                  }}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </Button>
              )
            }
          >
            {hidden !== null ? (
              <Textarea
                id={id}
                value={hidden}
                readOnly
                spellCheck={false}
                className='min-h-20 font-mono text-xs'
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            ) : (
              <RawInput
                id={id}
                value={input.value}
                invalid={invalid}
                describedBy={describedBy}
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
            )}
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
          // The form value is the previous one: only the parsed one goes into the draft.
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
 * Nested object: its own fields under a common label. Collapsed while nothing
 * in it is set: a long type would otherwise open as a wall of TLS and multiplex
 * fields. Collapsed fields are not mounted, and form values are not lost.
 */
export function GroupField({ field, name, children }: NodeFieldProps) {
  const label = useFieldLabel(name);
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
          className='-mx-1'
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
          <ConfigNodeFormFieldName label={label} fieldKey={field.key} />
        </Button>
      </FieldLegend>
      <div id={contentId} hidden={!open} className='flex flex-col gap-3'>
        {open && children}
      </div>
    </FieldSet>
  );
}
